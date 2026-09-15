# Durable spent-time synchronization

A linked timesheet is registered while it is running (including when restoring
an association with the estimate badge disabled). The queue checks Kimai for its
final duration after it stops, on startup, every minute, and on focus/online.
Work resumes when the corresponding connection and integration are active.
Newly enabled sync tracks the current linked timer; it does not backfill old
untracked timesheets or records lost by earlier app versions.

The native store persists each transition before an external time write:

- `watching`: waiting for the timesheet to end or for a safe retry.
- `sending`: durable marker written before POST.
- `done`: acknowledged success, a duration below the existing one-minute cutoff,
  or user acknowledgement. Retained to prevent duplicate rediscovery.
- `uncertain`: an ambiguous response, or a `sending` marker found after restart.
  No automatic retry. The popup links to the issue and offers acknowledgement or
  an explicitly confirmed retry if the time is missing.

Read failures and explicit HTTP 400/401/403/404/422/429 rejections retry after a
minute. Timeouts, HTTP 408, server errors, and unexpected write errors require
review. A failed completion save leaves the durable `sending` marker intact;
recovery must not POST again. Unpersisted associations are retried in memory
while the process is alive, with a visible storage error. A disk failure followed
by process termination cannot preserve data that never reached storage.

Jobs contain no tokens. They bind the connection ID, Kimai URL, provider URL,
API base and configured repository. Changed destinations are held for review
until the original configuration returns. POST targets the repository and issue
number from the saved issue URL, validated against the configured server.
Completed records are not pruned automatically: deleting a completion marker
would permit a rediscovered timesheet to be exported twice. Later edits to an
already exported timesheet are not synchronized incrementally.

## API limits

The documented endpoints add time; neither documents a client idempotency key:

- [GitLab issue time tracking](https://docs.gitlab.com/api/issues/#add-spent-time-for-an-issue)
- [Gitea tracked time](https://docs.gitea.com/api/1.24/operations/issue-add-time/)

The queue therefore provides durable recovery with conservative duplicate
prevention, not an exactly-once guarantee across independent servers. Automatic
retry after a lost POST response would risk recording the same time twice.

Tests cover restart recovery, duplicate discovery, in-flight markers, failed
persistence, backoff, connection changes, manual resolution, and native write
permissions. Live GitLab/Gitea integration is not required by the test suite.
