import { Observable, of, Subject, BehaviorSubject, combineLatest, fromEvent, interval, merge, NEVER} from "rxjs"
import { filter, map, mapTo, switchMap, mergeMap, scan, tap, withLatestFrom} from "rxjs/operators"



// // button refs: resume
// const btnResume = document.getElementById("resume") as HTMLButtonElement;
// const btnResumeChanges = fromEvent(btnResume, "click").pipe(
//     map( (e:MouseEvent) => e.target['id'] )
// )
// // // button refs: reset
// const btnReset = document.getElementById("reset") as HTMLButtonElement;
// const btnResetChanges = fromEvent(btnReset, "click").pipe(
//     map( (e:MouseEvent) => e.target['id'] )
// )

// type PomodoroAction = "idle" | "run" | "stop" | "resume" | "reset"

// type RunState = "run" | "stop";

// const PomodoroVmFn = (vm: PomodoroVm) => vm;

interface PomodoroVm  {
   running: boolean,
   runtext: string,
   paused: boolean,
   countdown:  number,
   current: number,
}
const initialVm : PomodoroVm = {
    running: false,
    runtext: "Start",
    paused: false,
    countdown: 2500,
    current: 2500,
}

// button ref: run
const runState = new BehaviorSubject<number>(0);
const btnRun = document.getElementById("run") as HTMLButtonElement;
const runClicks = fromEvent(btnRun, "click").pipe(
    map(v => interval(1000))
)


// button ref: stop
const stopState = new BehaviorSubject<number>(0);
const btnStop = document.getElementById("stop") as HTMLButtonElement;
const stopClicks = fromEvent(btnStop, "click")
.pipe(
    map( v => of(0))
)

const btnClicks = merge(runClicks , stopClicks).pipe(
    mergeMap( v => v)
)



const runChanges = runState.pipe(
    // tap( v => console.log("runChange:",v)),
    map( (delta: number) => (vm:PomodoroVm) => ({...vm, current:vm.current - 1, runtext:"Pause"}) ),
  );

  const stopChanges = stopState.pipe(
    // tap( v => console.log("stopChange:",v)),
    map( (delta: number) => (vm:PomodoroVm) => ({...vm,runtext: "Start" }) )
  );

  const runOrstopChanges = btnClicks.pipe(
      switchMap( (v) => v===1? runChanges : stopChanges ),
      tap( (v) => console.log("run or stop:", v))
  )
  
  const vmChanges = runOrstopChanges.pipe(
    tap( v => console.log(v)),
    //   tap( (run, stop) => console.log("run, stop:", run, stop)),
    scan((oldVm: PomodoroVm, mutateFn:(vm: PomodoroVm) => PomodoroVm) => mutateFn(oldVm), initialVm as PomodoroVm)
    // scan( (prevVm:PomodoroVm, mutationFn:(vm:PomodoroVm)=>PomodoroVm) => mutationFn(prevVm), {} as PomodoroVm)
  )
  //.subscribe( v => console.log(v))