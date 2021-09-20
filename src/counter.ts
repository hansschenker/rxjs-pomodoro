//import   "./styles.css"
import { Observable, of, Subject, BehaviorSubject, combineLatest, fromEvent, interval, merge} from "rxjs"
import { filter, map, scan, tap, withLatestFrom} from "rxjs/operators"

interface CounterVm {   
    counter:number; 
}

const initialVm : CounterVm = {
    counter: 0,
}
//const vm$ : Observable<CounterVm>;

const incrSubj = new Subject<number>();
const decrSubj = new Subject<number>();


function setup() {

  // the subjects are mapped to an anonymous function that 
  // - accepts as parameter the previous state of the viewmodel (vm:ICounterVm)
  // - and that returns the mutated viewmodel
  // they are the viewmodel mutation functions
  const incr$ = this.incrSubj.pipe(
    map( (delta:number) => (vm:CounterVm) => ({...vm, counter:vm.counter+delta}) )
  );
  const decr$ = this.decrSubj.pipe(
    map( (delta:number) => (vm:CounterVm) => ({...vm, counter:vm.counter-delta}))
  );

  type CounterVmFn = (vm: CounterVm) => CounterVm;

  // the viewmodel observable is a merge of all mutation observables (incr$ and decr$) 
  // piped into a scan function 
  // scan has two arguments
  // the first is the accumulator (the viewmodel) and the second the mutation function
  // the body of the scan operator executes the mutation function : mutationFn(prevVm) passing the previous state of the viewmodel.
  // this function returns the mutated viewmodel which is the new accumulated value of the vm$ observable
  const vmChanges = merge( incr$, decr$).pipe(
    scan( (oldVm: CounterVm, mutateFn:CounterVmFn) => mutateFn(oldVm), {} as CounterVm)

  
);

  }
