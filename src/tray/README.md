# Tray application workflows

`windows/TrayPopup.tsx` composes the UI, data hooks, and these workflows. It owns
form visibility, selections, layout state, and the commands that connect the UI
to each workflow.

- `useTrayDeepLinks`: bounded request queue, connection selection, issue
  enrichment, and dispatch to either the task form or the start command.
- `useTimerIssueLink`: submitted issue associations, restoration, estimates,
  and the existing in-memory spent-time synchronization.
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

Spent-time synchronization remains an in-memory workflow; this extraction does
not add a persistent retry queue. Native subscriptions and background workflows
still live for the lifetime of the tray window.

`windows/TrayPopup.test.tsx` exercises these workflows together using mocked
external adapters and data hooks. Service tests cover the idle boundary fallback;
system event tests cover current callbacks and delayed subscription cleanup.
