//import   "./styles.css"
import { Observable, of, Subject, BehaviorSubject, combineLatest, fromEvent, interval, merge} from "rxjs"
import { filter, map, scan, tap, withLatestFrom} from "rxjs/operators"

console.log("it works");

// button refs: start 
const btnStart = document.getElementById("start") as HTMLButtonElement;
console.log("start button", btnStart)
const btnStartChanges = fromEvent(btnStart, "click").pipe(
    map( (e:MouseEvent) => e.target['id'] )
)

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

const secChanges = interval(1000);

const btnChanges = merge(btnStartChanges, btnStopChanges, btnResumeChanges, btnResetChanges);
// btnChanges.pipe(
//     filter ( (eventName) => eventName === "start"),
    
// )
 type PomodoroAction = "idle" | "start" | "stop" | "resume" | "reset"

 interface PomodoroVm  {
    start:  number,
    current: number,
    // action: PomodoroAction,
}
const initialPomodoro : PomodoroVm = {
    start: 2500,
    current: 2500,
    // action: "idle"
}



const initialVm : PomodoroVm = {
    start: 2500,
    current: 2500,
    // action: "idle"
}

const vm = new  BehaviorSubject<PomodoroVm>(initialVm);

type PomodoroVmFn = (vm: PomodoroVm) => PomodoroVm;

const pomodoroChanges = combineLatest(secChanges, btnChanges).pipe(
    // scan(
    //     (oldVm: PomodoroVm, mutateFn:PomodoroVmFn) => mutateFn(oldVm), {} as PomodoroVm
    // )
)
//.subscribe( ([sec, name]) => console.log({sec, name}))

