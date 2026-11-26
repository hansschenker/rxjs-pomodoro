// Pure domain model: all timestamps, IDs and settings are explicit.
export const MIN = 60_000;
export const defaults = Object.freeze({
  focusMs: 25 * MIN, overflow: true, breakRatio: .2,
  autoBreak: false, autoFocus: false, microEveryMs: 25 * MIN,
  maxPauses: 2, maxPauseMs: 2 * MIN, dailyBudgetMs: 4 * 60 * MIN
});
const isFocus = p => p === 'focus' || p === 'overflow';
export const needsClock = p => isFocus(p) || p === 'paused' || p === 'break';
const validNum = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
export function settings(input = {}) {
  const s = {...defaults};
  for (const [key, min, max] of [
    ['focusMs', 1, 24*60*MIN], ['breakRatio', 0, 1],
    ['microEveryMs', 0, 24*60*MIN], ['maxPauses', 0, 100],
    ['maxPauseMs', 1, 24*60*MIN], ['dailyBudgetMs', 0, 24*60*MIN]
  ]) if (validNum(input[key], min, max)) s[key] = input[key];
  s.maxPauses = Math.floor(s.maxPauses);
  for (const key of ['overflow','autoBreak','autoFocus'])
    if (typeof input[key] === 'boolean') s[key] = input[key];
  return s;
}
export function initialState(at = 0, saved = {}, namespace = 'demo') {
  const tasks = Array.isArray(saved.tasks) ? saved.tasks : [];
  return {
    phase: 'idle', now: at, settings: settings(saved.settings),
    tasks, selectedTaskId: tasks.some(t=>t.id===saved.selectedTaskId) ? saved.selectedTaskId : null,
    session: null, rest: null,
    logs: Array.isArray(saved.logs) ? saved.logs : [],
    breaks: Array.isArray(saved.breaks) ? saved.breaks : [],
    scratchpad: Array.isArray(saved.scratchpad) ? saved.scratchpad : [],
    sequence: 0, namespace
  };
}
const emit = (events, type, payload={}) => events.push({type, ...payload});

function begin(s, events) {
  const id = `${s.namespace}-${s.sequence+1}`;
  const session = { id, startedAt:s.now, plannedMs:s.settings.focusMs,
    policy:{...s.settings}, taskId:s.selectedTaskId, focusMs:0, segments:[],
    pauses:[], pauseStartedAt:null, prompted:0 };
  emit(events,'FOCUS_STARTED',{sessionId:id,at:s.now});
  return {...s, phase:'focus', sequence:s.sequence+1, session, rest:null};
}

// Merge contiguous intervals for the same task. Paused time is never counted.
function accrue(session, from, to, events) {
  if (to <= from) return session;
  const focusMs = session.focusMs + to-from;
  const last = session.segments.at(-1);
  const segments = last && last.taskId === session.taskId && last.endAt === from
    ? [...session.segments.slice(0,-1), {...last,endAt:to}]
    : [...session.segments, {taskId:session.taskId,startAt:from,endAt:to}];
  const period = session.policy.microEveryMs;
  const prompted = period > 0 ? Math.floor(focusMs/period) : 0;
  // Coalesce missed prompts into one rather than spamming after tab suspension.
  if (prompted > session.prompted)
    emit(events,'MICRO_BREAK_DUE',{sessionId:session.id,at:to,number:prompted});
  return {...session,focusMs,segments,prompted};
}
function closePause(session, at) {
  if (session.pauseStartedAt === null) return session;
  return {...session, pauseStartedAt:null,
    pauses:session.pauses.map((p,i)=>i===session.pauses.length-1 ? {...p,endAt:at} : p)};
}
function finish(s, endedAt, reason, events, voided=false) {
  const session = closePause(s.session, endedAt);
  const outcome = voided ? 'voided' :
    session.focusMs >= session.plannedMs ? 'completed' : 'endedEarly';
  const log = {...session, endedAt, outcome, reason, rating:null,
    overtimeMs:Math.max(0,session.focusMs-session.plannedMs)};
  emit(events,'SESSION_ENDED',{log, at:endedAt});
  const next = {...s, session:null, logs:[...s.logs,log]};
  if (voided) return {...next,phase:'idle',rest:null};
  // Freeze the earned break when focus ends; settings changes affect later sessions.
  const durationMs = Math.round(session.focusMs * session.policy.breakRatio);
  if (!durationMs) return {...next,phase:'awaitingFocus',rest:null};
  const rest = {sessionId:session.id,durationMs,startedAt:null,autoFocus:session.policy.autoFocus};
  return session.policy.autoBreak
    ? startBreak({...next,rest,phase:'awaitingBreak'},events)
    : {...next,phase:'awaitingBreak',rest};
}
function startBreak(s,events) {
  emit(events,'BREAK_STARTED',{sessionId:s.rest.sessionId,at:s.now});
  return {...s,phase:'break',rest:{...s.rest,startedAt:s.now}};
}
function finishBreak(s, at, status, events) {
  const rest = s.rest;
  const record = {...rest,endedAt:at,status,
    actualMs:rest.startedAt===null?0:Math.max(0,Math.min(rest.durationMs,at-rest.startedAt))};
  emit(events,'BREAK_ENDED',{record,at});
  const next = {...s,rest:null,phase:'awaitingFocus',breaks:[...s.breaks,record]};
  // Never invent subsequent work for an unobserved time interval.
  return status==='completed' && rest.autoFocus ? begin(next,events) : next;
}

// Clock ticks are wake-up signals, not the source of elapsed time.
// Always settle elapsed time before interpreting a new user command.
function advance(prev, at, events) {
  const now = Math.max(prev.now,at);
  let s = {...prev,now};
  if (isFocus(prev.phase)) {
    const q = prev.session;
    const remaining = Math.max(0,q.plannedMs-q.focusMs);
    const cutoff = prev.now+remaining;
    const end = !q.policy.overflow && now>=cutoff ? cutoff : now;
    s = {...s,session:accrue(q,prev.now,end,events)};
    if (prev.phase==='focus' && s.session.focusMs>=q.plannedMs) {
      emit(events,'FOCUS_GOAL_REACHED',{sessionId:q.id,at:cutoff});
      if (!q.policy.overflow) return finish(s,cutoff,'goal',events);
      s = {...s,phase:'overflow'};
    }
  } else if (prev.phase==='paused') {
    const expires = prev.session.pauseStartedAt + prev.session.policy.maxPauseMs;
    if (now>=expires) return finish(s,expires,'pause-timeout',events,true);
  } else if (prev.phase==='break') {
    const ends = prev.rest.startedAt + prev.rest.durationMs;
    if (now>=ends) return finishBreak(s,ends,'completed',events);
  }
  return s;
}

export function transition(prev, action) {
  const events=[];
  if (!Number.isFinite(action.at)) throw new TypeError('Every action needs a finite timestamp');
  let s=advance(prev,action.at,events);
  const active = isFocus(s.phase);
  switch(action.type) {
    case 'TICK': break;
    case 'CONFIGURE':
      s={...s,settings:settings({...s.settings,...action.settings})}; break;
    case 'START_FOCUS':
      if (s.phase==='idle'||s.phase==='awaitingFocus') s=begin(s,events);
      break;
    case 'PAUSE':
      if (active) {
        const reason=action.reason||'unspecified';
        const q=s.session;
        emit(events,'INTERRUPTION',{sessionId:q.id,reason,at:s.now});
        if (q.pauses.length>=q.policy.maxPauses) {
          s=finish({...s,session:{...q,pauses:[...q.pauses,{startAt:s.now,endAt:s.now,reason}]}},
            s.now,'pause-limit',events,true);
        } else {
          s={...s,phase:'paused',session:{...q,pauseStartedAt:s.now,
            pauses:[...q.pauses,{startAt:s.now,endAt:null,reason}]}};
        }
      }
      break;
    case 'RESUME':
      if (s.phase==='paused') {
        const q=closePause(s.session,s.now);
        s={...s,session:q,phase:q.focusMs>=q.plannedMs?'overflow':'focus'};
      }
      break;
    case 'FINISH':
      if (active||s.phase==='paused') s=finish(s,s.now,'manual',events);
      break;
    case 'ABORT':
      if (active||s.phase==='paused') {
        emit(events,'INTERRUPTION',{sessionId:s.session.id,reason:action.reason||'abort',at:s.now});
        s=finish(s,s.now,action.reason||'abort',events,true);
      }
      break;
    case 'START_BREAK':
      if (s.phase==='awaitingBreak') s=startBreak(s,events);
      break;
    case 'SKIP_BREAK':
      if (s.phase==='awaitingBreak'||s.phase==='break') s=finishBreak(s,s.now,'skipped',events);
      break;
    case 'UPSERT_TASKS': {
      // Imported records must use provider-scoped stable IDs.
      const tasks=new Map(s.tasks.map(t=>[t.id,t]));
      for (const task of action.tasks??[]) {
        if (typeof task.id!=='string'||!task.id||typeof task.title!=='string'||!task.title.trim()) continue;
        const old=tasks.get(task.id);
        tasks.set(task.id,{...old,...task,title:task.title.trim(),
          estimateBlocks:validNum(task.estimateBlocks,0,1000)?task.estimateBlocks:old?.estimateBlocks??0});
      }
      s={...s,tasks:[...tasks.values()]}; break;
    }
    case 'SELECT_TASK': {
      const id=action.taskId??null;
      if (id===null||s.tasks.some(t=>t.id===id))
        s={...s,selectedTaskId:id,session:s.session?{...s.session,taskId:id}:null};
      break;
    }
    case 'CAPTURE': {
      const text=String(action.text??'').trim();
      if (text) s={...s,scratchpad:[...s.scratchpad,{text,at:s.now,sessionId:s.session?.id??null}]};
      break;
    }
    case 'RATE':
      if (action.rating===null||(Number.isInteger(action.rating)&&action.rating>=1&&action.rating<=5))
        s={...s,logs:s.logs.map(log=>log.id===action.sessionId?{...log,rating:action.rating}:log)};
      break;
    default: break;
  }
  return {state:s,events};
}

export function timerView(s) {
  const q=s.session;
  return {
    phase:s.phase, taskId:q?.taskId??s.selectedTaskId,
    focusMs:q?.focusMs??0, plannedMs:q?.plannedMs??s.settings.focusMs,
    overtimeMs:q?Math.max(0,q.focusMs-q.plannedMs):0,
    pauseRemainingMs:s.phase==='paused'?Math.max(0,q.policy.maxPauseMs-(s.now-q.pauseStartedAt)):null,
    displayMs:q ? Math.abs(q.plannedMs-q.focusMs) :
      s.rest ? Math.max(0,s.rest.durationMs-(s.rest.startedAt===null?0:s.now-s.rest.startedAt)) : s.settings.focusMs,
    direction:q&&q.focusMs>=q.plannedMs?'up':'down'
  };
}
export function durableSnapshot(s) {
  // Intentionally persist history/config only, not active sessions or partial breaks.
  const {settings,tasks,selectedTaskId,logs,breaks,scratchpad}=s;
  return {settings,tasks,selectedTaskId,logs,breaks,scratchpad};
}
