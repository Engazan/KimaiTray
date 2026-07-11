# Security policy

Please report suspected vulnerabilities privately through GitHub Security
Advisories for this repository. Do not include API tokens, server response
bodies, timer descriptions, or other user data in a public issue.

KimaiTray stores credentials in the operating system credential store when one
is available. Linux installations without a Secret Service implementation use
a compatibility fallback in the application store and retry secure migration
on later reads.

Security fixes are supported on the latest released version. Reports should
include the KimaiTray version, operating system, reproduction steps, and the
minimum diagnostics necessary to demonstrate the issue.
