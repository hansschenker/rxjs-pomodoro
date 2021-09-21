import { Observable, of, Subject, BehaviorSubject, combineLatest, fromEvent, interval, merge} from "rxjs"
import { filter, map, mapTo, switchMap, mergeMap, scan, tap, withLatestFrom} from "rxjs/operators"

 
const runState = new BehaviorSubject<boolean>(false);  
const stopState = new BehaviorSubject<boolean>(false);
// // button refs: stop
// const btnStop = document.getElementById("stop") as HTMLButtonElement;
// const btnStopChanges = fromEvent(btnStop, "click").pipe(
//     map( (e:MouseEvent) => e.target['id'] )
// )

// // button refs: resume
const btnResume = document.getElementById("resume") as HTMLButtonElement;
const btnResumeChanges = fromEvent(btnResume, "click").pipe(
    map( (e:MouseEvent) => e.target['id'] )
)
// // button refs: reset
const btnReset = document.getElementById("reset") as HTMLButtonElement;
const btnResetChanges = fromEvent(btnReset, "click").pipe(
    map( (e:MouseEvent) => e.target['id'] )
)

type PomodoroAction = "idle" | "run" | "stop" | "resume" | "reset"

type RunState = "run" | "stop";

const PomodoroVmFn = (vm: PomodoroVm) => vm;

interface PomodoroVm  {
   running: boolean,
   runtext: string,
   paused: boolean,
   countdown:  number,
   current: number,
   // button ref: run
}
const initialVm : PomodoroVm = {
    running: false,
    runtext: "Start",
    paused: false,
    countdown: 2500,
    current: 2500,
}

const btnRun = document.getElementById("run") as HTMLButtonElement;
const runClicks = fromEvent(btnRun, "click").pipe(
    // tap(v => console.log("runClick:", v)),
    mapTo(true),
    ).pipe(
        tap( v => runState.next(v))
    )
    //.subscribe();


// btnRun.addEventListener("click", e => {
//     runState.next( true);
//     btnRun.innerText = "Stop";
// })


// button ref: stop

const btnStop = document.getElementById("stop") as HTMLButtonElement;
const stopClicks = fromEvent(btnStop, "click")
.pipe(
    // tap(v => console.log("runClick:", v)),
    mapTo(false),
    ).pipe(
        tap( v => runState.next(v))
    )
    //.subscribe();

const btnClicks = merge(runClicks , stopClicks);




///////////////////////7


const runChanges = runState.pipe(
    tap( v => console.log("runChange:",v)),
    map( (delta: boolean) => (vm:PomodoroVm) => ({...vm, current:vm.current-1, runtext:"Pause"}) ),
  );

  const stopChanges = stopState.pipe(
    tap( v => console.log("stopChange:",v)),
    map( (delta: boolean) => (vm:PomodoroVm) => ({...vm,runtext: "Start" }) )
  );

  const changes = btnClicks.pipe(
      switchMap( (v:boolean) => v? runChanges : stopChanges )
  )
  
  const vmChanges = changes.pipe(
    //   tap( (run, stop) => console.log("run, stop:", run, stop)),
    scan((oldVm: PomodoroVm, mutateFn:(vm: PomodoroVm) => PomodoroVm) => mutateFn(oldVm), initialVm as PomodoroVm)
    // scan( (prevVm:PomodoroVm, mutationFn:(vm:PomodoroVm)=>PomodoroVm) => mutationFn(prevVm), {} as PomodoroVm)
  ).subscribe( v => console.log(v))