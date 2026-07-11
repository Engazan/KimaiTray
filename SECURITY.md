# Security policy

Please report suspected vulnerabilities privately through GitHub Security
Advisories for this repository. Do not include API tokens, server response
bodies, timer descriptions, or other user data in a public issue.

KimaiTray stores credentials only in the operating system credential store.
Linux installations must provide a Secret Service implementation; credential
saves fail safely when it is unavailable. Plaintext values created by older
versions are removed only after a verified migration to the secure store.

External API traffic passes through a bounded native HTTP broker. Webviews do
not have the generic Tauri HTTP capability. The broker restricts URL schemes,
methods, headers, request sizes, response sizes, timeouts, and redirect handling.

Security fixes are supported on the latest released version. Reports should
include the KimaiTray version, operating system, reproduction steps, and the
minimum diagnostics necessary to demonstrate the issue.
