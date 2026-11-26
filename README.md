# Reactive Pomodoro Lab
**An advanced RxJS architecture kata** inspired by Netta Bondy's talk,
[Dissecting a completely Functional-Reactive JavaScript app](https://www.youtube.com/watch?v=tchjAe0udO0).

This is an independently authored educational extension, not a fork or a transcription of the speaker's repository.

## Contributors

- **Hans Schenker (@hansschenker)** — project direction, feature requirements and repository stewardship.
- **GlaspGPT (ChatGPT by OpenAI)** — AI-assisted reactive architecture, sample implementation, tests and documentation.

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for attribution. Netta Bondy's talk is the educational inspiration for this independent sample; she is not represented as a project contributor.

## Run locally

Requires Node.js 20+ and npm. From this directory:

```sh
npm install
npm run dev
```

Open the local URL Vite prints. For a quick exercise, set focus to `0.1` minutes (6 seconds), save settings, then start. Set earned break to 20% to see a short break. To test pause expiry, configure a short pause limit before starting. Sound is opt-in.

```sh
npm run test:core   # dependency-free pure domain tests
npm test            # all tests, including RxJS tests (after npm install)
```

Validation when this archive was produced: 13/13 domain tests passed in Node.js 22; all JavaScript files passed `node --check`. The RxJS package was not installed in the authoring environment, so the three RxJS tests and browser demo were not executed. No lockfile was generated. Install dependencies to verify locally. Vite is only the development server; the architecture is vanilla JS and RxJS 7.8.2.

## What is implemented?

| Requirement | Status and design |
|---|---|
| Overflow / flowtime | Goal event once; count up after goal; finish manually. Fixed duration is also supported. |
| Proportional break | Actual active focus time × session break ratio; defaults to 20%. |
| Smart transitions | Independent auto-break / auto-focus flags; confirmation states otherwise. |
| Micro-break prompts | Configurable active-focus interval; coalesces missed cues. Visual cue, not forced interruption. |
| Task estimates | Add local tasks with block estimates; compare credited blocks and elapsed focus time. |
| Task switching | Timestamped focus segments; task changes never reset the countdown. |
| Task and calendar sync | **Mock adapters only**. Demo task import; calendar payloads for completed sessions, one per contiguous focus segment. No live OAuth or remote writes. |
| Website/app blocking and status / DND | **Simulated** environment mode and desired blocking/status. No actual system modifications. |
| Adaptive sound | Optional locally generated brown-noise-like audio, darker/quieter rest sound and goal/break chimes. No music or external audio files. |
| Pause / void | Per-session count and per-pause duration caps; voided sessions retain focus time but earn no break or completed-block credit. |
| Scratchpad / reasons | Ctrl/Cmd+K focuses quick capture; notes and selected interruption reasons are stored locally. |
| Analytics | Focus minutes today, started/completed ratio, skipped breaks, interruption counts and self-reported focus ratings by local session start hour. |
| Energy / workload | Descriptive time-of-day statistics, configurable daily budget and skipped-break nudges. No inference of biological circadian phase or diagnosis of burnout. |
| Persistence | Local storage for tasks, settings, completed/voided history, break records and scratchpad. JSON export. Active focus / pending rest is intentionally not restored on reload. |

## Architecture

```text
DOM events ─────┐
External results ├── merge → stamp with now() → queueScheduler → scan(transition)
Clock TICK ──────┘                                    │
                                           shared transition frames
                                            │                │
                                    state$ / replay(1)      events$ / no replay
                                            │                │
                         ┌──────────────────┼──────┐         ├── calendar writes (concatMap)
                         │                  │      │         └── notifications
                      view$             progress$  analytics$
                         │                  │      │
                         └────────────── UI rendering
                                            │
                              phase → distinctUntilChanged
                                            │
                                  switchMap(clock | NEVER)
                                            │
                                      dispatch TICK
```

`transition(state, action)` returns `{ state, events }`. Time and command data are explicit inputs. The reducer is independent of RxJS, DOM, storage, and external APIs. The RxJS layer serializes state updates, shares one execution, and feeds clock events back through the same action stream.

State snapshots are replayed; domain events are intentionally **not** replayed. A late UI subscriber needs the current state, but a late calendar subscriber must not send an old write again.

### Source map

- `src/domain.js`: settings, pure state machine, elapsed-time accounting, segment ledger, session events, timer view.
- `src/engine.js`: RxJS command stream, `scan`, shared state, live event stream, clock switching, adapter orchestration.
- `src/analytics.js`: pure selectors for task progress and time-of-day statistics.
- `src/main.js`: vanilla DOM streams, state rendering, `combineLatest` task filter, `withLatestFrom` export, storage, sound and mock adapters.
- `src/style.css`, `index.html`: browser UI.
- `test/domain.test.js`: thirteen deterministic scenarios with explicit timestamps.
- `test/engine.test.js`: clock-switching marble test, shared-state/live-event test, mock effect test.

## Key policies and design decisions

- Focus uses wall-clock timestamps rather than tick counts. A long gap in active focus is counted as focus, including sleep/background time, unless the user pauses. Backward wall-clock jumps are clamped; forward clock changes are not distinguishable from elapsed time in this sample. Production should separate monotonic elapsed time and wall-clock calendar timestamps, and ask how to handle suspended devices.
- In nonoverflow mode, focus accrual stops at the logical deadline. Auto-break starts when that deadline is observed, so a delayed callback does not consume break time before the UI can react. Similarly, auto-focus starts at the observation of break end; it never creates phantom focus sessions for a long unobserved gap.
- Break ratio and pause rules are snapshotted at session start. Changed settings apply to future sessions.
- An early manual finish is recorded as `endedEarly` and earns proportional rest; only a session meeting its planned goal is `completed`. A voided session retains its actual focus ledger, but no break or completed-block credit. Two allowed pauses means the third pause voids; a pause at or past its time limit voids before resume.
- One completed block is one unit of credit, proportionally distributed among the tasks based on their share of the session's focus time. For example: 15 minutes on A + 10 on B = 0.6 and 0.4 block credits. Overtime remains part of time accounting but does not create an extra completed block.
- Calendar mock exports only completed sessions; a paused or task-switched session becomes separate contiguous calendar intervals. Segment IDs (`sessionId:index`) are idempotency keys, not actual provider event IDs.
- Completion rate among started sessions includes the active session in the denominator; closed-session completion rate is available separately in the selector. Break skip rate uses recorded finished/skipped breaks. Pending breaks are excluded. Ratings are voluntary.
- Daily budget of four hours is merely an example configuration, not a recommended medical threshold. The UI supports disabling it. Hourly averages are grouped by session start hour, in the browser's local timezone; more advanced analytics can split time across hours and days and account for sparse observations.
- Storage is single-tab, local-only and unencrypted. History grows in memory. No backend, cross-device/multi-tab reconciliation, OAuth, full active-state recovery or production offline outbox.
- Integration effects are mock calls. They demonstrate operator semantics, not production guarantees. `switchMap` suppresses old import results but cannot cancel a Promise or undo a remote write. Environment calls are serialized and errors isolated; real adapters should reconcile desired state, implement timeouts, release leases on exit, and restore the user's prior settings rather than blindly setting status to available. `attachEffects().dispose()` only unsubscribes; real adapter cleanup must be implemented separately.

## Learning sequence

1. Start with `domain.js`: trace a focus → overflow → rest flow.
2. Find `scan` in the engine; replace the old BehaviorSubject feedback loop with a reducer.
3. Find `switchMap` and `NEVER`: only timed states need a clock.
4. Trace a task selection through the reducer and the segment ledger.
5. Compare `merge` (independent inputs), `combineLatest` (derived filtered task progress), and `withLatestFrom` (sample current state on export).
6. Compare `switchMap` (latest task read) and `concatMap` (ordered calendar/environment writes).
7. Try different pause limits and time jumps with the pure tests.
8. Extend the mock adapters incrementally.

## Production extensions

- **Reliable persistence**: IndexedDB or a server store, schema migration, active-session recovery, and an append-only durable domain-event/outbox table. Calendar writes should use idempotency keys, reconciliation, bounded retries only for transient errors and explicit sync failures. Do not rely on `shareReplay` for durability.
- **Bidirectional synchronization**: normalized provider-scoped task IDs; OAuth with least privilege; change tokens/webhooks or polling; conflict policy and deleted-task handling. Separate reads (latest wins) from ordered, idempotent writes.
- **Environment**: use a browser extension for site blocking and an authorized native helper or desktop app for OS settings. Slack/Teams/Discord require their own supported APIs, account consent and permission checks. Use expiring leases and restore prior settings, including after crashes. A regular web page cannot guarantee OS-wide blocking or DND.
- **Audio**: user-initiated audio context, volume control, explicit teardown, fade transitions.
- **Analytics**: minimum sample sizes, robust confidence estimates, timezone-aware hourly attribution, flexible work schedules, privacy controls. Present patterns as suggestions, not diagnoses.
- **Testing**: marble tests for time operators and cancellation, state invariant/property tests, browser integration tests and contract tests for each adapter.

## Reference material

- RxJS API: https://rxjs.dev/api
- RxJS marble testing: https://rxjs.dev/guide/testing/marble-testing
- Browser extension native messaging: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging
- Original talk: https://www.youtube.com/watch?v=tchjAe0udO0
