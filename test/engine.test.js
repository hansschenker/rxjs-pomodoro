import test from 'node:test';
import assert from 'node:assert/strict';
import {Subject,NEVER,of,switchMap} from 'rxjs';
import {TestScheduler} from 'rxjs/testing';
import {createEngine,attachEffects} from '../src/engine.js';

test('switchMap replaces active clock with silent stream (marble test)',()=>{
  const scheduler=new TestScheduler((a,b)=>assert.deepEqual(a,b));
  scheduler.run(({hot,cold,expectObservable,expectSubscriptions})=>{
    const running=hot('-a----b---a----b---|',{a:true,b:false});
    const ticks=cold('--x-x-x-x-');
    const output=running.pipe(switchMap(active=>active?ticks:NEVER));
    expectObservable(output,'------------------!').toBe('---x-x------x-x---');
    expectSubscriptions(ticks.subscriptions).toBe(['-^----!','----------^----!']);
  });
});
test('engine uses one shared clock, state replays, domain events do not replay',()=>{
  let at=0,starts=0;const ticks=new Subject();
  const engine=createEngine({now:()=>at,namespace:'rx-test',clockFactory:()=>{starts++;return ticks;}});
  const states=[],events=[];
  engine.state$.subscribe(s=>states.push(s));engine.events$.subscribe(e=>events.push(e));
  engine.dispatch({type:'START_FOCUS'});at=1000;ticks.next(0);
  assert.equal(states.at(-1).session.focusMs,1000);
  let late;const replay=engine.state$.subscribe(s=>late=s);
  const lateEvents=[];const live=engine.events$.subscribe(e=>lateEvents.push(e));
  assert.equal(late.session.focusMs,1000);assert.equal(lateEvents.length,0);assert.equal(starts,1);
  engine.dispatch({type:'FINISH'});assert.equal(events.filter(e=>e.type==='SESSION_ENDED').length,1);
  assert.equal(lateEvents.filter(e=>e.type==='SESSION_ENDED').length,1);
  engine.dispose();replay.unsubscribe();live.unsubscribe();
});
test('adapter imports and calendar write are isolated from reducer',async()=>{
  let at=0;const engine=createEngine({now:()=>at,clockFactory:()=>NEVER,namespace:'effects-test',saved:{settings:{focusMs:1000}}});
  const writes=[];const fx=attachEffects(engine,{
    setEnvironment:async mode=>mode,
    writeSession:async log=>{writes.push(log.id);return log.id;},
    loadTasks:async()=>[{id:'mock:1',title:'Test',estimateBlocks:1}],
    notify:()=>{}
  });
  let latest;engine.state$.subscribe(s=>latest=s);
  fx.importTasks('mock');await new Promise(r=>setImmediate(r));
  assert.equal(latest.tasks[0].id,'mock:1');
  engine.dispatch({type:'START_FOCUS'});at=1000;engine.dispatch({type:'FINISH'});
  await new Promise(r=>setImmediate(r));assert.deepEqual(writes,['effects-test-1']);
  fx.dispose();engine.dispose();
});
