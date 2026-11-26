import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,transition,timerView,MIN,durableSnapshot} from '../src/domain.js';
import {analytics,taskProgress} from '../src/analytics.js';

function harness(config={},at=0){
  let state=initialState(at,{settings:config},'test');
  const events=[];
  return {get state(){return state},events,send(type,at,extra={}){
    const result=transition(state,{type,at,...extra});state=result.state;events.push(...result.events);return state;
  }};
}
test('goal crossing emits once; 50 minutes of focus earns a 10-minute break',()=>{
  const h=harness();
  h.send('START_FOCUS',0);h.send('TICK',25*MIN);
  assert.equal(h.state.phase,'overflow');assert.equal(timerView(h.state).direction,'up');
  h.send('TICK',45*MIN);h.send('FINISH',50*MIN);
  assert.equal(h.state.phase,'awaitingBreak');assert.equal(h.state.rest.durationMs,10*MIN);
  assert.equal(h.state.logs[0].focusMs,50*MIN);assert.equal(h.state.logs[0].overtimeMs,25*MIN);
  assert.equal(h.events.filter(e=>e.type==='FOCUS_GOAL_REACHED').length,1);
});
test('manual confirmation does not consume earned rest',()=>{
  const h=harness();h.send('START_FOCUS',0);h.send('FINISH',10*MIN);
  h.send('TICK',100*MIN);assert.equal(timerView(h.state).displayMs,2*MIN);
  h.send('START_BREAK',100*MIN);h.send('TICK',102*MIN);
  assert.equal(h.state.phase,'awaitingFocus');assert.equal(h.state.breaks[0].actualMs,2*MIN);
});
test('nonoverflow settles at the exact goal, auto break begins at observed time',()=>{
  const h=harness({overflow:false,autoBreak:true});
  h.send('START_FOCUS',0);h.send('TICK',40*MIN);
  assert.equal(h.state.logs[0].endedAt,25*MIN);
  assert.equal(h.state.logs[0].focusMs,25*MIN);
  assert.equal(h.state.rest.startedAt,40*MIN);
  assert.equal(h.state.phase,'break');
});
test('auto focus begins at observation and not during unobserved gap',()=>{
  const h=harness({focusMs:MIN,overflow:false,autoBreak:true,autoFocus:true});
  h.send('START_FOCUS',0);h.send('TICK',MIN);h.send('TICK',20*MIN);
  assert.equal(h.state.phase,'focus');assert.equal(h.state.session.startedAt,20*MIN);
  assert.equal(h.state.session.focusMs,0);assert.equal(h.state.logs.length,1);
});
test('pause and resume exclude pause time and preserve overflow',()=>{
  const h=harness();h.send('START_FOCUS',0);h.send('PAUSE',25*MIN+100,{reason:'Meeting'});
  h.send('RESUME',26*MIN);assert.equal(h.state.phase,'overflow');
  h.send('FINISH',27*MIN);
  assert.equal(h.state.logs[0].focusMs,26*MIN+100);assert.equal(h.state.logs[0].segments.length,2);
});
test('third pause exceeds a two-pause allowance',()=>{
  const h=harness({maxPauses:2});h.send('START_FOCUS',0);
  h.send('PAUSE',100);h.send('RESUME',200);h.send('PAUSE',300);h.send('RESUME',400);
  h.send('PAUSE',500,{reason:'Fatigue'});assert.equal(h.state.phase,'idle');
  assert.equal(h.state.logs[0].outcome,'voided');assert.equal(h.state.logs[0].focusMs,300);
  assert.equal(h.state.rest,null);
});
test('pause timeout is enforced even when no intermediate tick arrives',()=>{
  const h=harness({maxPauseMs:2*MIN});h.send('START_FOCUS',0);h.send('PAUSE',MIN);
  h.send('RESUME',4*MIN);assert.equal(h.state.phase,'idle');assert.equal(h.state.logs[0].reason,'pause-timeout');
  assert.equal(h.state.logs[0].endedAt,3*MIN);
});
test('mid-session task change splits focus and allocates exactly one completed block',()=>{
  const h=harness();
  h.send('UPSERT_TASKS',0,{tasks:[{id:'a',title:'A',estimateBlocks:1},{id:'b',title:'B',estimateBlocks:2}]});
  h.send('SELECT_TASK',0,{taskId:'a'});h.send('START_FOCUS',0);
  h.send('SELECT_TASK',15*MIN,{taskId:'b'});h.send('FINISH',25*MIN);
  const [a,b]=taskProgress(h.state);
  assert.equal(a.focusMs,15*MIN);assert.equal(b.focusMs,10*MIN);
  assert.equal(a.completedBlockEquivalents,.6);assert.equal(b.completedBlockEquivalents,.4);
  assert.equal(h.state.logs[0].segments.length,2);
});
test('micro prompts are emitted once per crossed interval, coalesced across delayed ticks',()=>{
  const h=harness({microEveryMs:5*MIN});h.send('START_FOCUS',0);
  h.send('TICK',5*MIN);h.send('TICK',5*MIN+200);h.send('TICK',20*MIN);
  assert.deepEqual(h.events.filter(e=>e.type==='MICRO_BREAK_DUE').map(e=>e.number),[1,4]);
});
test('settings snapshot prevents changing the rules mid-session',()=>{
  const h=harness({focusMs:5*MIN,breakRatio:.2});h.send('START_FOCUS',0);
  h.send('CONFIGURE',MIN,{settings:{focusMs:MIN,breakRatio:.5}});
  h.send('FINISH',5*MIN);assert.equal(h.state.rest.durationMs,MIN);
  assert.equal(h.state.logs[0].plannedMs,5*MIN);
});
test('scratchpad, rating, skip and analytics derive from state; persistence excludes active state',()=>{
  const h=harness({focusMs:MIN,dailyBudgetMs:MIN});
  h.send('START_FOCUS',0);h.send('CAPTURE',1000,{text:' remember this '});h.send('FINISH',MIN);
  h.send('RATE',MIN,{sessionId:'test-1',rating:4});h.send('SKIP_BREAK',MIN);
  assert.equal(h.state.scratchpad[0].text,'remember this');assert.equal(h.state.logs[0].rating,4);
  assert.equal(h.state.breaks[0].actualMs,0);assert.equal(analytics(h.state).skipRate,1);
  assert.equal(analytics(h.state).completionRate,1);
  h.send('START_FOCUS',MIN+1);assert.equal(analytics(h.state).startedCompletionRate,.5);
  assert.equal('session' in durableSnapshot(h.state),false);
});
test('delayed tick and backwards timestamp do not create negative or duplicate time',()=>{
  const h=harness();h.send('START_FOCUS',100);h.send('TICK',900);h.send('TICK',200);h.send('FINISH',1000);
  assert.equal(h.state.logs[0].focusMs,900);
});
test('repeated start cannot reset a running timer and voided focus remains recorded',()=>{
  const h=harness();h.send('START_FOCUS',0);h.send('START_FOCUS',MIN);h.send('ABORT',2*MIN,{reason:'Meeting'});
  assert.equal(h.state.logs[0].focusMs,2*MIN);assert.equal(h.state.logs[0].outcome,'voided');
  assert.equal(taskProgress(h.state).at(-1).focusMs,2*MIN);
});
