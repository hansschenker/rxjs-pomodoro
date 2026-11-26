import {Subject, ReplaySubject, NEVER, timer, merge, from, of, queueScheduler, defer} from 'rxjs';
import {scan, map, startWith, share, shareReplay, distinctUntilChanged,
  switchMap, mergeMap, observeOn, takeUntil, filter, concatMap, catchError} from 'rxjs';
import {initialState, transition, needsClock, timerView} from './domain.js';
import {analytics,taskProgress} from './analytics.js';

// The engine owns a subscription even with zero UI subscribers. dispose() is mandatory.
export function createEngine({
  saved={}, now=()=>Date.now(), namespace=globalThis.crypto?.randomUUID?.()??`${Date.now()}-${Math.random()}`,
  clockFactory=()=>timer(250,250), inputs$=NEVER
}={}) {
  const commands$=new Subject();
  const destroy$=new ReplaySubject(1);
  const seed=initialState(now(),saved,namespace);
  let disposed=false;
  const frames$=merge(commands$,inputs$).pipe(
    map(command=>({...command,at:now()})),
    observeOn(queueScheduler), // serialize re-entrant dispatches
    scan((frame,action)=>transition(frame.state,action),{state:seed,events:[]}),
    takeUntil(destroy$),share()
  );
  const state$=frames$.pipe(map(f=>f.state),startWith(seed),shareReplay({bufferSize:1,refCount:true}));
  const events$=frames$.pipe(mergeMap(f=>from(f.events))); // live, no replay
  const view$=state$.pipe(map(timerView));
  const progress$=state$.pipe(map(taskProgress));
  const analytics$=state$.pipe(map(s=>analytics(s)));
  const dispatch=command=>{if(!disposed) commands$.next(command);};
  const clock=state$.pipe(
    map(s=>needsClock(s.phase)),distinctUntilChanged(),
    switchMap(active=>active?clockFactory():NEVER),takeUntil(destroy$)
  ).subscribe(()=>dispatch({type:'TICK'}));
  function dispose() {
    if(disposed)return;
    disposed=true;destroy$.next();destroy$.complete();commands$.complete();clock.unsubscribe();
  }
  return {state$,events$,view$,progress$,analytics$,dispatch,dispose};
}

// Integration seam: the demo adapters do not contact external services.
// Install before dispatching actions; remote writes need durable outbox in production.
export function attachEffects(engine, adapters, report=()=>{}) {
  const subscriptions=[];
  const safe=(name,work)=>defer(()=>Promise.resolve(work())).pipe(
    map(value=>({name,ok:true,value})),
    catchError(error=>of({name,ok:false,error:String(error)}))
  );
  // Serialize environment writes; do not assume switchMap can undo an OS/network effect.
  subscriptions.push(engine.state$.pipe(
    map(s=>['focus','overflow'].includes(s.phase)?'focus':s.phase==='break'?'break':'idle'),
    distinctUntilChanged(),
    concatMap(mode=>safe('environment',()=>adapters.setEnvironment(mode)))
  ).subscribe(report));
  subscriptions.push(engine.events$.pipe(
    filter(e=>e.type==='SESSION_ENDED'&&e.log.outcome==='completed'),
    concatMap(e=>safe('calendar',()=>adapters.writeSession(e.log)))
  ).subscribe(report));
  subscriptions.push(engine.events$.pipe(
    filter(e=>['FOCUS_GOAL_REACHED','MICRO_BREAK_DUE','BREAK_ENDED'].includes(e.type)),
    concatMap(e=>safe('notification',()=>adapters.notify(e)))
  ).subscribe(r=>{if(!r.ok)report(r);}));
  // Task reads are latest-request-wins. Observable unsubscribe suppresses stale results;
  // an adapter should additionally support AbortSignal to cancel the actual request.
  const imports$=new Subject();
  subscriptions.push(imports$.pipe(
    switchMap(provider=>safe('task-import',()=>adapters.loadTasks(provider)))
  ).subscribe(result=>{
    if(result.ok)engine.dispatch({type:'UPSERT_TASKS',tasks:result.value});
    report(result);
  }));
  return {importTasks:provider=>imports$.next(provider),
    dispose:()=>{imports$.complete();subscriptions.forEach(s=>s.unsubscribe());}};
}
