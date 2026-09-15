# Tray application workflows

`windows/TrayPopup.tsx` composes the UI, data hooks, and these workflows. It owns
form visibility, selections, layout state, and the commands that connect the UI
to each workflow.

- `useTrayDeepLinks`: bounded request queue, connection selection, issue
  enrichment, and dispatch to either the task form or the start command.
- `useTimerIssueLink`: submitted issue associations, restoration, estimates,
  and registration of timesheets for spent-time synchronization.
- `useIssueTimeSync`: durable time-sync queue, periodic/focus/online recovery,
  connection checks, and manual resolution of ambiguous writes.
- `useIdleTimerWorkflow`: idle detection, notifications, reminder window, and
  idle actions. It returns its busy state to gate other timer actions.
- `useTraySystemEvents`: native event subscriptions and shortcut registration.
  Listeners call the latest commands without registering again on each render.
- `useTrayPresentation`: native menu labels, icon, tooltip, and ticker.
- `useInstalledChangelog`: startup changelog delivery.

Workflows expose commands and view data rather than mutable refs or UI setters.
They depend on API adapters; they do not depend on the popup component.
`services/timerService.ts` owns React-independent timer operation sequences.
React hooks retain responsibility for operation locks, pending/error state, and
query invalidation. Start, pause/resume, stop, and idle actions continue to share
`timerOperationLock`.

Native subscriptions and background workflows live for the lifetime of the tray
window. The time-sync queue survives restarts in `settings.json` under
`issueTimeSyncJobs`; only the tray window can mutate it through the atomic native
store broker. See [the queue contract](../integrations/issues/TIME-SYNC.md).

`windows/TrayPopup.test.tsx` exercises these workflows together using mocked
external adapters and data hooks. Service tests cover the idle boundary fallback;
system event tests cover current callbacks and delayed subscription cleanup.
