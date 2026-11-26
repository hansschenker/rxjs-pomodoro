# Reactive Pomodoro Lab

Reactive Pomodoro Lab is a browser-based focus timer and a hands-on exercise in RxJS architecture. You can use it to track what you worked on, how often you paused, and how much rest you earned. For a developer, the same session demonstrates how clicks, clock ticks, and asynchronous results can drive one predictable state machine.

## A session from start to finish

Suppose you plan a 25-minute focus block. You spend 15 minutes writing, switch the selected task to review, and spend another 15 minutes reviewing. Switching tasks keeps the timer running. With the default overflow setting, the timer reaches the goal at minute 25 and counts up until you finish. The history records 30 active minutes and five minutes of overtime. At the default break ratio of 20%, you earn six minutes of rest. Each task receives half of one completed block because each accounted for half of the active time.

You can turn overflow off to finish at the planned duration, or enable automatic transitions into rest and the next focus session. Paused time is excluded from both task time and earned rest. Finishing early earns proportional rest but no completed block. Aborting, exceeding the pause count, or reaching a pause time limit voids the session. Its accrued focus time still appears in the history, while its break and block credit are zero.

## How the timer works

1. The browser turns an interaction such as selecting a task into a command. The engine timestamps and queues commands, including clock ticks, so the state machine processes them in order. [Browser wiring](../src/main.js) · [RxJS engine](../src/engine.js)
2. The engine uses RxJS `scan` to pass the current state and each action to `transition`. That function accounts for elapsed time before applying the command. On a task switch, this credits time up to the click to the previous task. Elapsed time comes from timestamps, so a delayed browser tick can account for several seconds at once. [Domain rules](../src/domain.js)
3. Each transition produces a state snapshot and any events it triggered. A newly attached view receives the latest state immediately. Events such as reaching the focus goal are delivered only to current listeners, so attaching a listener later does not repeat an old chime or calendar write. The engine runs the clock only during focus, overtime, pauses, and breaks. [State and event streams](../src/engine.js)
4. The dashboard derives task progress and statistics from the recorded intervals. These include focus time today, completion rate, interruption reasons, skipped breaks, and optional focus ratings grouped by the local hour a session began. [Analytics](../src/analytics.js)

## What stays in the browser

The app saves settings, tasks, session history, break records, and scratchpad notes in local storage and offers a JSON export. Reloading returns the timer to idle, so an unfinished session or pending break is lost. Task import, calendar writes, website blocking, and status changes use simulated adapters. For example, completing the session above produces two mock calendar intervals, one for each task.

## Run and explore

With Node.js 20 or newer and npm, run `npm install`, then `npm run dev`, and open the URL Vite prints. To see the transition into overtime quickly, set focus to `0.1` minutes, save the setting, and start a session. The timer reaches its goal in six seconds.

The [domain tests](../test/domain.test.js) exercise timing and session rules with explicit timestamps and run with `npm run test:core`. After installing dependencies, `npm test` also runs the [engine tests](../test/engine.test.js), which cover clock switching, event delivery, and adapter behavior.
