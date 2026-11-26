// Pure selectors; no extra subscriptions or hidden mutable counters.
const duration = seg => seg.endAt-seg.startAt;
export function taskProgress(s) {
  const stats=new Map(s.tasks.map(t=>[t.id,{...t,focusMs:0,completedBlockEquivalents:0}]));
  stats.set(null,{id:null,title:'Unassigned',estimateBlocks:0,focusMs:0,completedBlockEquivalents:0});
  for (const log of [...s.logs,...(s.session?[s.session]:[])]) {
    for (const seg of log.segments) {
      if (!stats.has(seg.taskId)) continue;
      const row=stats.get(seg.taskId);
      const ms=duration(seg);
      row.focusMs+=ms;
      // One completed session = one credit, divided across tasks by focus time.
      if (log.outcome==='completed'&&log.focusMs>0)
        row.completedBlockEquivalents+=ms/log.focusMs;
    }
  }
  return [...stats.values()];
}
export function analytics(s, now=s.now) {
  const start=new Date(now);start.setHours(0,0,0,0);
  const end=new Date(start);end.setDate(end.getDate()+1);
  const all=[...s.logs,...(s.session?[s.session]:[])];
  const todayMs=all.flatMap(q=>q.segments).reduce((n,seg)=>
    n+Math.max(0,Math.min(seg.endAt,+end)-Math.max(seg.startAt,+start)),0);
  const hours=Array.from({length:24},(_,hour)=>({hour,sessions:0,completed:0,focusMs:0,rated:0,ratingSum:0}));
  const reasons=Object.create(null);
  for (const log of s.logs) {
    // Deliberately group by session start hour, not inferred biological circadian phase.
    const h=hours[new Date(log.startedAt).getHours()];
    h.sessions++;h.focusMs+=log.focusMs;
    if (log.outcome==='completed') h.completed++;
    if (log.rating!==null&&log.rating!==undefined) {h.rated++;h.ratingSum+=log.rating;}
    for (const pause of log.pauses) reasons[pause.reason]=(reasons[pause.reason]??0)+1;
    if (log.outcome==='voided'&&!['pause-limit','pause-timeout'].includes(log.reason))
      reasons[log.reason]=(reasons[log.reason]??0)+1;
  }
  const completed=s.logs.filter(q=>q.outcome==='completed').length;
  const skipped=s.breaks.filter(q=>q.status==='skipped').length;
  const recent=s.breaks.slice(-5);
  return {todayMs,started:s.logs.length+(s.session?1:0),ended:s.logs.length,completed,
    completionRate:s.logs.length?completed/s.logs.length:null,
    startedCompletionRate:all.length?completed/all.length:null,
    skippedBreaks:skipped,skipRate:s.breaks.length?skipped/s.breaks.length:null,
    hours:hours.map(({ratingSum,...h})=>({...h,averageRating:h.rated?ratingSum/h.rated:null})),
    reasons,
    nudges:[
      ...(s.settings.dailyBudgetMs>0&&todayMs>=s.settings.dailyBudgetMs?['Your configured daily focus budget has been reached.']:[]),
      ...(recent.length>=3&&recent.filter(b=>b.status==='skipped').length>=3?['At least three of your last five recorded breaks were skipped. Consider resting.']:[])
    ]};
}
