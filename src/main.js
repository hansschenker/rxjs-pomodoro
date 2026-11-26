import {fromEvent, merge, combineLatest} from 'rxjs';
import {map, filter, auditTime, distinctUntilChanged, startWith, withLatestFrom} from 'rxjs';
import {createEngine,attachEffects} from './engine.js';
import {MIN,durableSnapshot} from './domain.js';

const $=id=>document.getElementById(id);
const key='rx-pomodoro-lab-v1';
let saved={};
try {saved=JSON.parse(localStorage.getItem(key)||'{}')??{};}catch {}
const command=(id,type,extra=()=>({}))=>fromEvent($(id),'click').pipe(map(()=>({type,...extra()})));
const input$=merge(
  command('start','START_FOCUS'),command('pause','PAUSE',()=>({reason:$('reason').value})),
  command('resume','RESUME'),command('finish','FINISH'),command('abort','ABORT',()=>({reason:$('reason').value})),
  command('start-break','START_BREAK'),command('skip-break','SKIP_BREAK'),
  fromEvent($('task'),'change').pipe(map(e=>({type:'SELECT_TASK',taskId:e.target.value||null}))),
  fromEvent($('capture'),'submit').pipe(map(e=>{
    e.preventDefault();const text=$('thought').value;$('thought').value='';return {type:'CAPTURE',text};
  })),
  fromEvent($('new-task'),'submit').pipe(map(e=>{
    e.preventDefault();const task={id:`local:${crypto.randomUUID()}`,title:$('title').value,estimateBlocks:+$('estimate').value};
    $('title').value='';return {type:'UPSERT_TASKS',tasks:[task]};
  })),
  fromEvent($('history'),'change').pipe(filter(e=>e.target.matches('select[data-session]')),
    map(e=>({type:'RATE',sessionId:e.target.dataset.session,rating:e.target.value===''?null:+e.target.value}))),
  fromEvent($('settings'),'submit').pipe(map(e=>{
    e.preventDefault();const x=e.target.elements;
    return {type:'CONFIGURE',settings:{focusMs:+x.focus.value*MIN,breakRatio:+x.ratio.value/100,
      microEveryMs:+x.micro.value*MIN,maxPauses:+x.pauses.value,maxPauseMs:+x.pauseTime.value*MIN,
      dailyBudgetMs:+x.budget.value*MIN,overflow:x.overflow.checked,autoBreak:x.autoBreak.checked,autoFocus:x.autoFocus.checked}};
  }))
);
const engine=createEngine({saved,inputs$:input$});
const subscriptions=[];
let latest, audio=null, soundSource=null, soundGain=null, lowpass=null;
const fmt=(ms,up=false)=>{const sec=Math.max(0,(up?Math.floor:Math.ceil)(ms/1000));return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;};
const min=ms=>`${(ms/MIN).toFixed(1)} min`;
const percent=n=>n===null?'—':`${Math.round(n*100)}%`;
const note=text=>{$('notice').textContent=text;};
const integration=text=>{$('integration-log').textContent=`${text}\n${$('integration-log').textContent}`.slice(0,3500);};

function unlockAudio(){
  const Context=window.AudioContext||window.webkitAudioContext;
  if(!Context)return;
  audio??=new Context(); audio.resume().catch(()=>note('Audio unavailable.'));
}
function chime(){
  if(!audio||!$('sound').checked)return;
  const osc=audio.createOscillator(), gain=audio.createGain(), t=audio.currentTime;
  osc.frequency.value=660;gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.08,t+.025);
  gain.gain.exponentialRampToValueAtTime(.0001,t+.65);osc.connect(gain).connect(audio.destination);
  osc.start(t);osc.stop(t+.7);
}
function setSound(mode){
  if(!audio)return;
  if(!soundSource&&$('sound').checked){
    const frames=audio.sampleRate*3, buffer=audio.createBuffer(1,frames,audio.sampleRate), arr=buffer.getChannelData(0);
    let last=0;for(let i=0;i<frames;i++){last=(last+.02*(Math.random()*2-1))/1.02;arr[i]=last*3;}
    soundSource=audio.createBufferSource();soundSource.buffer=buffer;soundSource.loop=true;
    lowpass=audio.createBiquadFilter();lowpass.type='lowpass';soundGain=audio.createGain();soundGain.gain.value=0;
    soundSource.connect(lowpass).connect(soundGain).connect(audio.destination);soundSource.start();
  }
  if(!soundGain)return;
  const t=audio.currentTime, enabled=$('sound').checked;
  lowpass.frequency.setTargetAtTime(mode==='focus'?850:350,t,.2);
  soundGain.gain.setTargetAtTime(enabled?(mode==='focus'?.12:mode==='break'?.045:0):0,t,.2);
}
function modeFor(s){return ['focus','overflow'].includes(s?.phase)?'focus':s?.phase==='break'?'break':'idle';}
subscriptions.push(fromEvent($('sound'),'change').subscribe(()=>{
  if($('sound').checked)unlockAudio();setSound(modeFor(latest));
}));
const effects=attachEffects(engine,{
  async setEnvironment(mode){
    $('environment').textContent=`Environment: ${mode} (simulated)`;
    setSound(mode);return {mode,blockSites:mode==='focus',status:mode==='focus'?'In Focus':'Available'};
  },
  async writeSession(log){
    // A real adapter must store event IDs and reconcile retries/updates.
    const records=log.segments.map((seg,i)=>({key:`${log.id}:${i}`,taskId:seg.taskId,
      start:new Date(seg.startAt).toISOString(),end:new Date(seg.endAt).toISOString()}));
    return {calendar:'mock',records};
  },
  async loadTasks(provider){
    return [{id:`${provider}:1`,title:'Read RxJS operators',estimateBlocks:2},
      {id:`${provider}:2`,title:'Implement reactive state machine',estimateBlocks:4}];
  },
  notify(e){
    if(e.type==='FOCUS_GOAL_REACHED'){note('Focus goal reached. Continue in flow or take a break.');chime();}
    else if(e.type==='MICRO_BREAK_DUE')note('Micro-break cue: blink, hydrate or adjust your posture.');
    else if(e.type==='BREAK_ENDED'&&e.record.status==='completed'){note('Break complete. Ready for another focus block?');chime();}
  }
},r=>integration(`${r.name}: ${r.ok?JSON.stringify(r.value):r.error}`));

function cell(tr,text){const td=document.createElement('td');td.textContent=text;tr.append(td);return td;}
function option(value,text){const o=document.createElement('option');o.value=value;o.textContent=text;return o;}
function renderTasks(tasks,selected){
  const options=[option('','Unassigned'),...tasks.map(t=>option(t.id,t.title))];$('task').replaceChildren(...options);$('task').value=selected??'';
}
function renderHistory(logs){
  $('history').replaceChildren(...logs.slice().reverse().map(log=>{
    const tr=document.createElement('tr');cell(tr,new Date(log.startedAt).toLocaleString());cell(tr,log.outcome);
    cell(tr,`${min(log.focusMs)} / ${min(log.overtimeMs)}`);
    const select=document.createElement('select');select.dataset.session=log.id;select.setAttribute('aria-label','Focus rating');
    select.append(option('','—'),...[1,2,3,4,5].map(n=>option(n,n)));select.value=log.rating??'';
    const td=cell(tr,'');td.append(select);return tr;
  }));
}
function renderPolicy(s){
  const x=$('settings').elements;
  x.focus.value=s.focusMs/MIN;x.ratio.value=s.breakRatio*100;x.micro.value=s.microEveryMs/MIN;
  x.pauses.value=s.maxPauses;x.pauseTime.value=s.maxPauseMs/MIN;x.budget.value=s.dailyBudgetMs/MIN;
  x.overflow.checked=s.overflow;x.autoBreak.checked=s.autoBreak;x.autoFocus.checked=s.autoFocus;
}
subscriptions.push(engine.state$.subscribe(s=>latest=s));
subscriptions.push(engine.state$.pipe(map(s=>s.settings),distinctUntilChanged()).subscribe(renderPolicy));
subscriptions.push(engine.state$.pipe(map(s=>[s.tasks,s.selectedTaskId]),distinctUntilChanged((a,b)=>a[0]===b[0]&&a[1]===b[1]))
  .subscribe(([tasks,id])=>renderTasks(tasks,id)));
subscriptions.push(engine.state$.pipe(map(s=>s.logs),distinctUntilChanged()).subscribe(renderHistory));
subscriptions.push(engine.state$.pipe(map(s=>s.scratchpad),distinctUntilChanged()).subscribe(notes=>{
  $('notes').replaceChildren(...notes.slice().reverse().map(n=>{const li=document.createElement('li');li.textContent=n.text;return li;}));
}));
subscriptions.push(engine.view$.subscribe(v=>{
  $('phase').textContent=v.phase.replace(/([a-z])([A-Z])/g,'$1 $2').toUpperCase();
  $('clock').textContent=(v.direction==='up'?'+':'')+fmt(v.displayMs,v.direction==='up');
  $('detail').textContent=`Focus ${min(v.focusMs)} · Goal ${min(v.plannedMs)}`;
  $('pause-left').textContent=v.pauseRemainingMs===null?'':`Pause allowance remaining: ${fmt(v.pauseRemainingMs)}`;
  const p=v.phase;
  for(const [id,show] of Object.entries({start:['idle','awaitingFocus'].includes(p),pause:['focus','overflow'].includes(p),
    resume:p==='paused',finish:['focus','overflow','paused'].includes(p),abort:['focus','overflow','paused'].includes(p),
    'start-break':p==='awaitingBreak','skip-break':['awaitingBreak','break'].includes(p)}))$(id).disabled=!show;
}));
const taskQuery$=fromEvent($('task-filter'),'input').pipe(map(e=>e.target.value.trim().toLowerCase()),startWith(''),distinctUntilChanged());
subscriptions.push(combineLatest([engine.progress$.pipe(auditTime(250)),taskQuery$]).pipe(
  map(([rows,query])=>rows.filter(r=>r.title.toLowerCase().includes(query)))
).subscribe(rows=>{
  $('progress').replaceChildren(...rows.map(r=>{const tr=document.createElement('tr');cell(tr,r.title);
    cell(tr,`${r.completedBlockEquivalents.toFixed(2)} / ${r.estimateBlocks}`);cell(tr,min(r.focusMs));return tr;}));
}));
subscriptions.push(engine.analytics$.pipe(auditTime(250)).subscribe(a=>{
  $('metrics').replaceChildren(...[[min(a.todayMs),'Focus today'],[`${a.completed} / ${a.started}`,'Completed / started'],
    [percent(a.startedCompletionRate),'Started completion rate'],[percent(a.skipRate),'Break skip rate']].map(([value,label])=>{
    const div=document.createElement('div');div.className='metric';const b=document.createElement('b');b.textContent=value;
    const span=document.createElement('span');span.textContent=label;div.append(b,span);return div;}));
  $('nudges').textContent=a.nudges.join(' ');
  $('reasons').textContent=Object.entries(a.reasons).map(([k,v])=>`${k}: ${v}`).join(' · ')||'No interruptions logged.';
  const table=document.createElement('table');
  const head=document.createElement('tr');for(const t of ['Hour','Sessions','Focus','Avg rating']){const th=document.createElement('th');th.textContent=t;head.append(th);}table.append(head);
  for(const h of a.hours.filter(h=>h.sessions)){const tr=document.createElement('tr');cell(tr,`${String(h.hour).padStart(2,'0')}:00`);
    cell(tr,h.sessions);cell(tr,min(h.focusMs));cell(tr,h.averageRating===null?'—':`${h.averageRating.toFixed(1)} (${h.rated})`);table.append(tr);}
  $('hours').replaceChildren(table);
}));
subscriptions.push(engine.events$.subscribe(e=>{
  if(e.type==='SESSION_ENDED'&&e.log.outcome==='voided')note(`Session voided: ${e.log.reason}. Focus time is still recorded.`);
  if(e.type==='SESSION_ENDED'&&e.log.outcome!=='voided')note('Focus saved. Your earned break is ready.');
}));
subscriptions.push(fromEvent(document,'keydown').pipe(filter(e=>(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k')).subscribe(e=>{
  e.preventDefault();$('thought').focus();
}));
subscriptions.push(fromEvent($('import'),'click').subscribe(()=>effects.importTasks('demo')));
subscriptions.push(fromEvent($('export'),'click').pipe(withLatestFrom(engine.state$)).subscribe(([,state])=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(durableSnapshot(state),null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='pomodoro-history.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}));
const save=()=>{if(latest)try{localStorage.setItem(key,JSON.stringify(durableSnapshot(latest)));}catch{note('Local storage is unavailable or full. Export your history.');}};
subscriptions.push(engine.state$.pipe(map(s=>[s.settings,s.tasks,s.logs,s.breaks,s.scratchpad,s.selectedTaskId]),
  distinctUntilChanged((a,b)=>a.every((x,i)=>x===b[i])),auditTime(200)).subscribe(save));
window.addEventListener('pagehide',save);
// bfcache pages may resume, so only dispose on Vite hot replacement.
if(import.meta.hot)import.meta.hot.dispose(()=>{save();effects.dispose();subscriptions.forEach(s=>s.unsubscribe());engine.dispose();audio?.close();window.removeEventListener('pagehide',save);});
