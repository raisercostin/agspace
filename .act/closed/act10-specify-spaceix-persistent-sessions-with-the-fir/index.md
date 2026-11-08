# First spaceix TDD contract

Implement only an executable acceptance test and its usage notes, not spaceix itself.

Public contract: `spaceix open dev1 --on namekis.com` creates/starts a sandbox and a persistent shell if needed. `spaceix open dev1` resolves the remembered host and reconnects to that same live session. Multiple clients can attach, observe output and send input. Disconnecting a client must not stop the remote shell.

The test uses a uniquely named tdd<number> space, verifies a shared shell PID, environment value and working directory across two clients and a reconnect, and closes its local clients afterward. It must not confuse echoed command text with command results. Missing implementation produces an immediate local RED result, with no SSH or remote provisioning. Once implemented, real remote execution requires explicit SPACEIX_TEST_HOST and subprocess permission.

Acceptance: run the new test and verify that it fails specifically because spaceix.ts does not exist, not due to syntax, type or unrelated setup failures. Document future real-host execution and retained test-space data. Track later implementation independently.
