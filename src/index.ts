import { Observable, of, Subject, BehaviorSubject, combineLatest, fromEvent, interval, merge} from "rxjs"
import { filter, map, scan, tap, withLatestFrom} from "rxjs/operators"

 

// // button refs: stop
const btnStop = document.getElementById("stop") as HTMLButtonElement;
const btnStopChanges = fromEvent(btnStop, "click").pipe(
    map( (e:MouseEvent) => e.target['id'] )
)

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

type PomodoroAction = "idle" | "start" | "stop" | "resume" | "reset"


const PomodoroVmFn = (vm: PomodoroVm) => vm;

interface PomodoroVm  {
   countdown:  number,
   current: number,
   //action: PomodoroAction,
}
const initialVm : PomodoroVm = {
    countdown: 2500,
    current: 2500,
    // action: "idle"
}
// button refs: start 
const btnStart = document.getElementById("start") as HTMLButtonElement;
btnStart.addEventListener("click", e => {
    runState.next(1)
})
const btnStartChanges = fromEvent(btnStart, "click").pipe(
    map( (e:MouseEvent) => e.target['id'] ),
)
const runState = new BehaviorSubject<number>(1);  
btnStartChanges.subscribe(runState);

const stopState = new BehaviorSubject<PomodoroVm>(initialVm);

const runChanges = runState.pipe(
    tap( v => console.log("runChange:")),
    map( (delta: number) => (vm:PomodoroVm) => ({...vm, current:vm.current-1}) )
  );
  const stopChanges = stopState.pipe(
    tap( v => console.log("stopChange:")),
    map( (delta: PomodoroVm) => (vm:PomodoroVm) => ({...vm, current:vm.countdown + 0}) )
    
  );

  // the viewmodel observable is a merge of all mutation observables (incr$ and decr$) 
  // piped into a scan function 
  // scan has two arguments
  // the first is the accumulator (the viewmodel) and the second the mutation function
  // the body of the scan operator executes the mutation function : mutationFn(prevVm) passing the previous state of the viewmodel.
  // this function returns the mutated viewmodel which is the new accumulated value of the vm$ observable
  const vmChanges = merge( runChanges, stopChanges).pipe(
    //   tap( (run, stop) => console.log("run, stop:", run, stop)),
    scan((oldVm: PomodoroVm, mutateFn:(vm: PomodoroVm) => typeof vm) => mutateFn(oldVm), initialVm as PomodoroVm)
    // scan( (prevVm:PomodoroVm, mutationFn:(vm:PomodoroVm)=>PomodoroVm) => mutationFn(prevVm), {} as PomodoroVm)
  ).subscribe( v => console.log(v))