# Agspace: facade-first TDD

## Mandatory testing boundary

Tests call **`AgspaceApp` directly**. Never test the application through its CLI, launch a CLI subprocess, drive a shell/terminal test harness, or parse TUI output to infer application state. Do not replace these with tests of CLI parsing or generated shell strings. Running a tool through `app.exec` and inspecting its structured result is valid application behavior; launching `agspace` from the test is not.

SSH, tmux, Docker and real remote execution may exist behind the facade. Facade-first does not require mocks or an in-memory implementation. Select real or controlled collaborators to suit the scenario; the test still interacts with the real application facade and observes results through that facade.

Keep a coherent, readable scenario. Expose relevant state through the application API rather than reaching into storage, process tables or transport internals. Establish only the state the scenario needs: read-only checks reuse an existing space, while an explicit archival/recreation scenario owns its reset. Running `deno test` invokes the test runner, not the application CLI.

## User-facing operation

```sh
agspace open dev1 --on namekis.com
agspace open dev1
agspace open tdd1 --on namekis.com --force-archive-inplace
```

The first call creates or starts a named execution environment and persistent shell. Subsequent calls reuse the environment and session. The multi-client contract covers shared observation and input through separate connections.

Ordinary `open` is **idempotent**: reuse the host, service, volume, home and tmux session when they match the requested specification. Recover only a missing layer. A configuration mismatch is reported rather than silently replacing the runtime. The layer model is documented in `agspace.md`.

`--force-archive-inplace` is an explicit home-data operation, never generic test setup. Its facade equivalent is `forceArchiveInplace: true`:

- Archive prior user-home contents under an unused numbered directory within `/home/agent/.agspace-archives/` for new spaces (retain `.spaceix-archives` for legacy spaces), restart the space's tmux shell, and prepare an empty working directory. Keep the Docker service, container, network and volume.
- Return the archive's path as `archivePath`. Do not overwrite previous archives.
- If no prior space exists, create it normally.
- If archival fails, report it and preserve the remaining data. Do not delete Docker resources as a fallback.
- Plain `open` reconnects; it never implicitly archives or resets a space.

## Test 1: open, list and check installed tools

Executable specification: `agspace_test.ts`, importing `AgspaceApp` from `agspace.ts`.

1. Construct `AgspaceApp` and open the fixed name `tdd1` with an explicit host. Reuse it if it exists; do not archive or recreate anything for these read-only checks.
2. Call `app.environment(connectionId)` to observe OS/kernel, account, working directory, actual shell, storage mountpoint and the desired/actual runtime diff through the facade.
3. Call `app.exec(connectionId, ["ls", "-a"])` and check its successful result and directory listing.
4. Through the same facade, request versions from Git, Deno, Rust/Cargo, Java/JBang and OpenCode.
5. Assert successful exit codes and recognizable version output, without pinning exact versions in the test. Java may report its version on stderr.
6. Observe the facade's public log events and verify that recorded execution results match returned results, without asserting internal shell-script syntax. Console output should remain concise and informative.
7. Disconnect, leaving the space and its files available for inspection.

No agent/model task is started: OpenCode is invoked only for its version. No separate parser/helper tests or CLI driver are involved.

## Test 2: shared session identity and reconnect — disabled

The existing multi-client scenario is retained with `ignore: true`. It is not the first implementation target:

1. Construct `AgspaceApp` and open the fixed test space `tdd1` on an explicit host, reusing existing state.
2. Open it again by name, without repeating the host.
3. Assert the same space/session identity and two distinct connections.
4. Disconnect one connection and observe one remaining connection through `inspect`.
5. Disconnect the other and observe a running session with zero connections.
6. Reopen by name and observe the same space/session, remembered host and a new connection identity.
7. Disconnect the last connection; the session remains running.

The facade is deliberately small:

```ts
const app = new AgspaceApp();
const connection = await app.open("tdd1", {
  on: "namekis.com",
});
const listing = await app.exec(connection.connectionId, ["ls", "-a"]);
await app.disconnect(connection.connectionId);
```

`open` returns `spaceId`, `sessionId` and `connectionId`. `exec(connectionId, argv)` executes a tool inside that connection's space and returns structured `exitCode`, `stdout` and `stderr`; it does not require a shell command string. `disconnect` closes the connection.

The disabled scenario also uses `inspect`, exposing `host`, `status`, `sessionId` and `connectionCount`. A session ID identifies one live session instance, not merely a reusable name: replacing that instance must produce a different ID. No fake facade is added just to satisfy these assertions.

## Run through the facade

When using the real remote backend, explicitly select an approved test host with its container prerequisites and SSH access:

```sh
AGSPACE_TEST_HOST=namekis.com \
  rtee --session remote1.md deno test --allow-read --allow-write --allow-env --allow-run=ssh agspace_test.ts
```

The test calls `AgspaceApp` methods in-process. Subprocess permission is available to the implementation's SSH backend, not to a test driver invoking `agspace` or simulating its terminal UI.

`agspace.ts` contains the facade and private transport implementation in one file. The host needs key-based SSH access, Swarm manager access, jq/curl/flock and the toolchain image `opencode-dev:2026-11-01-r2` already installed. The image can be overridden with `new AgspaceApp({ image: "..." })`.

New space metadata is stored under the SSH user's `~/.local/share/agspace/spaces`. Existing spaces remain discoverable under `~/.local/share/spaceix/spaces` and retain their resource and tmux identities. The service, persistent home volume and overlay network outlive ordinary opens and tests. Explicit home archival moves files within that volume; it does not create another Docker generation. Docker resource identities are implementation details, not test assertions.

### Visible execution logs

Normal logs show open/reuse decisions, requested tools, stdin state, live stdout/stderr, exit code and timing. They do not repeat helper definitions, raw result JSON and full scripts for every command. `debug: true` on the constructor enables those details; otherwise `APP_DEBUG` provides the optional default. Full structured events remain available through `onLog` in either mode.

Provisioning logs identify the layers reused or created. Debug scripts show what is submitted, including conditional branches; they do not claim to trace a tool's internal implementation.

The tools underneath are local OpenSSH; remote `/bin/sh`, Docker CLI and Engine API (`curl`), `jq` and `flock`; and container-side `setpriv`, tmux, Bash, a small Deno executor and the requested executable. `open` verifies/provisions and establishes the executor using one SSH channel. Consecutive `exec` calls use that same channel, sending argv requests rather than reconnecting or rebuilding Docker for each command.

`new AgspaceApp({ onLog: event => ... })` exposes structured `AgspaceLogEvent` records through the facade. The acceptance scenario observes these records, not parsed console text. Append test evidence to `remote1.md`; avoid recording credentials.

`exec` runs an independent process inside the sandbox; it does not type into the persistent tmux shell. `disconnect` releases its handle and executor channel without stopping the remote space or tmux. Host resolution and connection counts are scoped to an `AgspaceApp` instance. Durable client-side host discovery and interactive terminal transport remain later work; the CLI is not yet implemented.

The implementation provisions missing resources, but repeated runs of the tool-version test reuse `tdd1` without modifying its files or archiving anything. It starts no model and supplies no credentials itself. Tests explicitly exercising archive/recreation must own their fixtures and must not race other users of that fixture. CLI option handling and shell quoting are not this test's boundary.

## Scope

The active first scenario covers opening a space and executing installed tools through the facade. The multi-client lifecycle scenario remains disabled. A later scenario can start output every 100 milliseconds, disconnect for one second, and reconnect to verify that additional output accumulated; it is deferred, not implemented here. Shared terminal input/output, read-only attachment and host-loss recovery likewise remain later behavior. All are tested through facade operations and results, never application CLI drivers.
