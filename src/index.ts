import { Observable, of, Subject, BehaviorSubject, combineLatest, fromEvent, interval, merge, NEVER} from "rxjs"
import { filter, map, mapTo, switchMap, mergeMap,exhaustMap, scan, tap, withLatestFrom} from "rxjs/operators"



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
const oneFromClick = fromEvent(btnRun, "click").pipe( () => interval(1000))


// button ref: stop
// const stopState = new BehaviorSubject<number>(0);
// const btnStop = document.getElementById("stop") as HTMLButtonElement;
// const zeroFromClick = fromEvent(btnStop, "click").pipe( mapTo(0))


const  numberFromClicks = oneFromClick.subscribe( v => runState.next(v))

// const runOrStop = numberFromClicks.pipe(
//     map( v => v),
//     tap( v => console.log("run or stop nbr:", v)),
//     tap( (v) => v===1? runState.next(1) : stopState.next(0) )
// )

const runChanges = runState.pipe(
    tap( v => console.log("run changes:", v)),
    map( (delta: number) => (vm:PomodoroVm) => ({...vm, current:  vm.countdown - delta, runtext:"Pause"}) ),
  );

//   const stopChanges = stopState.pipe(
//     tap( v => console.log("stopChange:",v)),
//     map( (delta: number) => (vm:PomodoroVm) => ({...vm,runtext: "Start" }) )
//   );

//   const runOrstopChanges = numberFromClicks.pipe(
//       switchMap( (v) => v===1? runChanges : stopChanges ),
//     //   tap( (v) => console.log("run or stop:", ))
//   )
  
  const vmChanges = merge(runChanges).pipe(
    scan((oldVm: PomodoroVm, mutateFn:(vm: PomodoroVm) => PomodoroVm) => mutateFn(oldVm), initialVm as PomodoroVm)
  )//.subscribe( console.log)

//   function renderPomodoro(vm: PomodoroVm)  {
//     btnRun.innerText = vm.runtext;
//     timer.innerText = vm.current.toString();
//   }