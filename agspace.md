# Agspace

**A place to run your development tools and return to your work.**

Working across projects and machines often means repeating setup, finding the right directory, and worrying about what an automated tool might change. Agspace gives that work a named, persistent sandbox on a machine you control.

Keep source files, tool configuration and caches together. Run builds and checks in an isolated environment. Reopen the same space when you want to continue.

## What you can use it for

- **Remote development:** keep a prepared toolchain on a server and use it from your own machine.
- **Sandboxed execution:** give development tools and coding agents a dedicated environment with resource limits.
- **Persistent working directories:** retain files and configuration between connections.
- **Separate environments:** use spaces such as `dev1` and `review1` for work that needs independent files or configuration.
- **Repeatable checks:** reuse the same environment when running tests or inspecting tool versions.

Each space can contain working directories for several projects.

## Usage

The intended command-line workflow is:

```sh
# Open a space on your server.
agspace open dev1 --on my-server

# Return to the same space later.
agspace open dev1
```

From the space's terminal, use your normal tools:

```sh
git status
cargo test
opencode
```

Opening an existing space preserves its files and configuration. The interactive workflow is designed to keep the remote session available across client disconnects.

**Availability:** these CLI examples define the intended interface. The runnable interface is currently the TypeScript API described under [Development](#development); the interactive CLI is not available yet.

### Run without installing

Set `AGSPACE_SOURCE_URL` to the published raw URL of `agspace.ts`; a release URL has not yet been assigned. This is the public one-shot command form for the CLI described above:

```sh
deno run --allow-run=ssh --allow-env=APP_DEBUG "$AGSPACE_SOURCE_URL" --version
```

## Install

Install the remote source as a command with Deno:

```sh
deno install --global --allow-run=ssh --allow-env=APP_DEBUG --force --name=agspace "$AGSPACE_SOURCE_URL"
agspace --version
```

Or use Scoopix's direct-source installer:

```sh
scoopix install "$AGSPACE_SOURCE_URL" --as agspace
agspace --version
```

## What to expect

- **Reuse:** a matching space opens without rebuilding its environment or replacing its storage.
- **Persistence:** files under the space's home directory remain available after disconnecting.
- **Visibility:** logs show which environment is used, which commands run, their output and elapsed time.
- **Inspection:** environment information includes the OS, shell, user, toolchain and the location of persistent storage on the host.
- **Explicit changes:** configuration mismatches are reported before replacing or updating the environment.

Live processes and stored files have different lifetimes. A container replacement preserves its home volume but ends its processes. Recovery from host loss requires a backup or migration of local storage.

The default sandbox limits CPU, RAM and process count. Its home storage has no disk quota, and outbound networking is unrestricted. Processes within the same space share access to that space's files and credentials.

## Development

### Dev Usage

**Dev install** — install from the local working copy using Deno:

```sh
deno install --global --allow-run=ssh --allow-env=APP_DEBUG --force --name=agspace "D:/home/raiser/work/2026-11-01--admin/agspace.ts"
agspace --version
```

Or use Scoopix's live-source mode:

```sh
scoopix install "D:/home/raiser/work/2026-11-01--admin/agspace.ts" --live --as agspace
agspace --version
```

**Dev local** — run the source without installing:

```sh
deno run --allow-run=ssh --allow-env=APP_DEBUG agspace.ts --version
```

These CLI command forms depend on the entrypoint noted under Usage. The working component scenario can be run now against the configured test host:

```sh
AGSPACE_TEST_HOST=namekis.com deno test --allow-read --allow-write --allow-env --allow-run=ssh agspace_test.ts
```

This opens or reuses `tdd1`, displays its environment, lists its directory and checks installed tool versions. It preserves existing files and uses your SSH authentication. The host needs the prerequisites described under [Run from source](#run-from-source) and the default test image `opencode-dev:2026-11-01-r2`.

### Source layout

- `agspace.ts` — public facade and private implementation components.
- `agspace_test.ts` — readable scenarios through `AgspaceApp`.
- `TDD.md` — executable contract and testing rules.

### Run from source

The local machine needs Deno and an SSH client. The Linux host needs SSH authentication, Docker administration access in Swarm manager mode, `jq`, `curl`, `flock`, and a prepared toolchain image.

Build the supplied image on your host:

```sh
ssh my-server 'docker build --tag agspace-dev:local -' \
  < Dockerfile.opencode-jbang-rust-deno
```

Save this example alongside `agspace.ts`:

```ts
import { AgspaceApp } from "./agspace.ts";

const app = new AgspaceApp({ image: "agspace-dev:local" });
const connection = await app.open("dev1", { on: "my-server" });

try {
  await app.environment(connection.connectionId);
  const result = await app.exec(connection.connectionId, ["deno", "--version"]);
  if (result.exitCode !== 0) throw new Error(result.stderr);
} finally {
  await app.disconnect(connection.connectionId);
}
```

```sh
deno run --allow-run=ssh example.ts
```

### Component API

| Operation | Purpose |
|---|---|
| `open(name, { on: host })` | Verify and reuse the environment, or provision missing resources. |
| `exec(connectionId, argv)` | Run a command and return `exitCode`, `stdout` and `stderr`. |
| `environment(connectionId)` | Inspect the OS, account, shell, paths, storage and runtime specification. |
| `inspect(name)` | Read the space's status and session identity. |
| `disconnect(connectionId)` | Release the connection while preserving the remote environment. |

Host associations are remembered within an application instance. `exec` passes argument arrays directly, supplies closed stdin and uses `/home/agent/workspace` as the working directory.

`environment().storage` includes the volume's host mountpoint and container mountpoint. `environment().runtime` contains the expected specification, actual specification and their differences as observed during `open`.

### Logging

Normal output contains actions, command output and timings. Set `debug: true` in the `AgspaceApp` constructor for full SSH scripts and raw payloads. The constructor setting takes precedence over `APP_DEBUG`. An `onLog` callback receives structured events in either mode.

### Design

#### Layers and lifetimes

Each layer has its own lifecycle. Opening a space reuses matching resources and initializes only the missing layers.

| Layer | Purpose | Lifetime |
|---|---|---|
| Host | CPU, RAM, storage, Docker and SSH | Managed independently of individual spaces. |
| SSH connection | Carries setup and execution requests | Shared by successive commands until disconnect. |
| Docker image | Installed tools and their versions | Reused until an explicit upgrade. |
| Docker service/container | Isolated runtime and resource limits | Reused while its specification matches. |
| Home volume | Working files, configuration and caches | Persists across connections and container replacement. |
| Named space | Identity and working environment | Retained across ordinary opens. |
| tmux session | Persistent interactive shell | Survives SSH disconnects; restarted if missing. |
| Tool process | Executes a command or agent | Determined by the requested operation. |

```text
AgspaceApp
  └── SSH connection
        └── Docker container
              ├── persistent home volume
              ├── tmux session and shell
              └── command executor → tools
```

`exec` starts independent processes; tmux maintains the persistent shell. Container replacement terminates live processes while retaining the home volume. Recovery from host loss requires storage backup or migration.

#### Shared runtime specification

`RUNTIME_SPEC` in `agspace.ts` supplies the configuration for both creation and comparison. Its declared fields are compared recursively with the actual Swarm service specification, with normalization for API defaults and unordered collections. Adding a field extends the comparison automatically. The comparison exposed by `environment().runtime` reflects the state observed during `open`.

Defaults are UID/GID `1000:1000`, 2 CPUs, 4 GiB RAM, no swap, 256 processes and a 512 MiB `/tmp`. The root filesystem is read-only, the home volume is writable, Linux capabilities are dropped, and `no-new-privileges` is enabled. The Docker socket remains outside the sandbox.

Replica count is lifecycle state. A matching stopped service can be started without changing its runtime configuration. Configuration differences are reported explicitly before replacement or update.

#### Execution transport

One SSH channel performs environment setup and remains available for successive commands. The bootstrap script is length-framed over stdin and executed through a private temporary file to avoid command-line length and quoting limits. The file is removed when the channel ends.

A private Deno executor inside the container accepts serialized argument arrays and returns stdout, stderr and exit status. This preserves argument boundaries and avoids an SSH handshake for each command. The executor and transport classes remain encapsulated in `agspace.ts`.

#### Home archival

`open(name, { forceArchiveInplace: true })` archives home contents under `/home/agent/.agspace-archives/archiveN` for new spaces, prepares a fresh working directory and restarts the tmux shell. The Docker service, container, network and volume are retained. The result includes `archivePath`.

Archival requires completed background work and disconnected application handles. Archives remain on the same volume; independent backups require separate storage. Routine opens preserve existing data.

#### Compatibility with existing spaces

New spaces use `~/.local/share/agspace/spaces` metadata and Agspace runtime names. Existing spaces created as Spaceix are discovered in their original metadata location and retain their Docker resources, tmux session, archive directory and identities. If the same name exists in both metadata roots, opening fails with an ambiguity error instead of selecting or replacing one implicitly.

### Testing

```sh
deno check agspace.ts agspace_test.ts

AGSPACE_TEST_HOST=my-server \
  rtee --session remote1.md deno test \
  --allow-read --allow-write --allow-env --allow-run=ssh agspace_test.ts
```

The test host must have the default image `opencode-dev:2026-11-01-r2` available. The toolchain scenario reuses `tdd1`, inspects its environment, lists its directory and checks installed tool versions. Project data is preserved between runs.

`SPACEIX_TEST_HOST` remains accepted as a legacy fallback; `AGSPACE_TEST_HOST` takes precedence.

### Development principles

- Test through `AgspaceApp`, using readable scenarios and public state. SSH, Docker and tmux remain implementation details behind the facade.
- Reuse existing resources in read-only scenarios. Give archival, deletion and recreation their own explicit scenarios.
- Preserve structured command results and stable identities across connections.
- Keep implementation in one source file, using private classes and functions for encapsulation.
- Use concise operational logs by default and reserve full payloads for debug mode.
- Keep credentials out of recorded arguments and output. Collect only the environment fields required for inspection.
- Keep product behavior and design in documentation; track progress, run evidence, proposals and pending verification in acts.
