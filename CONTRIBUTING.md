# Contributing

Create changes on a topic branch and keep runtime behavior changes separate
from mechanical formatting or dependency updates where practical.

Before opening a pull request, run:

```sh
npm ci
npm run check
npm audit --audit-level=high
cd src-tauri
cargo fmt --all -- --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
```

Changes to connection identity, credentials, timers, storage migrations, or
time-zone handling must include a regression test. Never commit API tokens,
signing keys, production URLs containing credentials, or user diagnostics.
