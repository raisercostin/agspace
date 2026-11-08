# Portable agent sessions in space-owned environments

## Objective

Provide a persistent workspace and session environment that users can continue with different coding-agent harnesses and, eventually, on different machines with minimal manual handoff.

The space owns the environment, working files, user home and durable session records. Harnesses such as OpenCode, Codex and Claude Code are replaceable executors within that space.

The existing implementation is named Spaceix. `agspace` is a naming candidate; this specification does not authorize a source or executable rename.

## User problem

A user advances several projects in different directories and with different agents. Work for one project may span multiple directories; one directory may contain work for several projects. The user wants to switch agents or execution locations without reconstructing the discussion, rediscovering artifacts or losing unfinished work.

Preserving the Git repository is insufficient. Harnesses also create configuration, transcripts, memory, caches and other artifacts under their user home or private runtime. The replacement harness may not discover those artifacts, may not understand their format, or may be unable to access them through its own sandbox.

User-provided example:

> i start work on prj1 with codex and want to continue with opencode. or want to move the work to other machine

User-provided boundary concern:

> the agent is owning a space. in both project space but mainly in user home . that aretefacts might be lost when you continue. so the "sandbox" of one harness cant be accesssed by low level "sandbox" of another one.

## Scope and identity

- A named space is a persistent execution and context boundary. Use descriptive names ending in a number, such as `dev1`, `review1` and `tdd1`.
- Space identity is independent of the current harness, process/container identity and host placement.
- Projects, directories, sessions and spaces have many-to-many relationships. Do not infer a unique project identity from a directory or its ancestors.
- Zildai already supplies project/work listing and discussion-management capabilities for this user. Investigate its existing interfaces before adding overlapping registries or conversation storage.
- Start with one host and a remote Docker environment. Multiple hosts and resource-based scheduling are extensions driven by actual need, not prerequisites for agent portability.

## Ownership and storage

The space owns:

1. **Working directories:** repositories, uncommitted changes, untracked and ignored files needed to continue work, build inputs and outputs.
2. **Persistent home:** user configuration, tool state and native harness directories across process/container replacement.
3. **Portable session record:** objective, constraints, user instructions, decisions, progress, unresolved issues, verification evidence and next action.
4. **Original discussions and native sessions:** retained with their provenance and native identifiers for inspection and same-harness resume.
5. **Artifact references:** stable links between sessions and relevant files, reports, patches, commits and outputs, including material outside the repository.

A harness switch must not replace the home, recreate the workspace, discard uncommitted work or delete the original session history. Summaries are entry points into preserved evidence, not replacements for it.

An initial environment may use one persistent `/home/agent` volume and a consistent UID/GID. Harness-specific directories can coexist there. Tools installed and upgraded through the image should live outside persisted home directories so old copies do not mask upgrades.

## Access and sandbox boundaries

There are separate boundaries:

- The outer execution environment: host permissions, container mounts, user identity, filesystem/network access and resource limits.
- The harness's own sandbox or tool-permission system.
- The harness's native storage format and discovery rules.

A shared outer volume does not automatically make an artifact accessible or interpretable to another harness. Every handoff must establish:

| Question | Required mechanism |
|---|---|
| Does the artifact still exist? | Space-owned persistent storage and lifecycle |
| Where is it? | Artifact inventory and stable references |
| May the replacement access it? | Explicit, supported access configuration |
| Can the replacement understand it? | Native adapter, export or portable representation |

Use the receiving harness's supported access controls. Where direct access is inappropriate or unsupported, the space controller exports the selected material to an allowed handoff location. Do not bypass a harness's intentional sandbox restrictions.

Classify stored information by purpose:

- **Working context:** discussions, decisions, instructions, progress and artifacts that may be needed for handoff.
- **Native harness state:** preserved for native resume; exported or translated only through supported/verified mechanisms.
- **Authentication material:** available to its intended tool, excluded from portable prompts, transcripts and handoff exports by default.

The initial shared-user model permits filesystem access between processes in the same space. Separate spaces or additional access controls are required when harnesses need stronger isolation from one another.

## Session continuity contract

### Same-harness resume

Resume the native session when the tool supports it, retaining the link to the space's portable session identity. Distinguish attaching to a live process from resuming a saved conversation after process termination.

### Cross-harness handoff

1. Identify the source session, objective, work locations and intended destination harness.
2. Establish the handoff point. Finish or explicitly interrupt active writes; do not allow accidental concurrent writers to the same working state.
3. Preserve current files and native session records.
4. Inventory relevant artifacts, including home-directory artifacts outside Git.
5. Prepare a concise handoff containing the objective, constraints, decisions, completed work, current changes, verification results, unresolved issues and next action.
6. Make the original evidence available through references and appropriate access boundaries.
7. Start or resume the destination harness through its supported interface.
8. Associate the new native session with the continuing portable session and record what was supplied, omitted or unsupported.
9. Verify that the destination can locate the required files and understand the continuation point.

Portable continuity does not imply transferring hidden reasoning, internal caches or every vendor-specific feature. Native formats must not be treated as interchangeable. Unsupported exports or permissions are explicit handoff limitations, not silent data loss.

### Relocation

Relocation carries the selected persistent data and portable session record to another environment, preserving identity and references. It must account for uncommitted/untracked files, permissions and path differences, not just clone a Git repository.

Live processes, native credentials and machine-specific caches require explicit policies. Local Docker volumes do not automatically move with a scheduled task. A relocated session may require a new process and authentication while retaining work continuity.

## Execution layers

Keep host, SSH transport, image, service/container, volume, named home, tmux session and agent process lifecycles separate. Ordinary opens are idempotent: reuse matching resources and initialize only missing layers.

SSH disconnection should leave persistent storage and tmux-owned interactive sessions available. Container replacement preserves the volume but ends live processes. Home archival and runtime recreation are explicit operations with dedicated acceptance scenarios; read-only tests do not request them.

## Harness integration

- Preserve the vendors' actual agent executables and their native agent loops.
- Prefer ACP (Agent Client Protocol) or a supported vendor structured interface for programmatic control.
- Retain PTY/terminal integration for native interaction and compatibility where required; do not infer completion merely from a quiet terminal.
- Use MCP to expose shared tools/resources where useful. Consider A2A for interoperability with independent external agent systems when needed.
- Keep adapters behind the component facade. A normalized event model may preserve native payloads for features that do not map cleanly.

The eventual meta-loop assigns work, observes results, verifies outcomes and decides whether to continue, redirect, delegate or stop. Most lifecycle/control behavior should be ordinary software; use model reasoning for decisions that require it.

## Acceptance scenarios

All application tests call `SpaceixApp` (or the explicitly selected future component facade) directly. SSH, Docker, tmux and real harness processes may run behind it. No application-CLI test driver, TUI parsing or generated-shell-string assertions.

1. **Reusable environment:** open an existing matching `tdd1`, execute tools and disconnect without replacing its runtime, home or tmux session.
2. **Native continuity:** disconnect/reconnect to a live session and distinguish it from native conversation resume after process exit.
3. **Cross-agent continuation:** begin a small task with Codex, preserve partial work, continue with OpenCode and complete it without the user manually retelling the task.
4. **Home artifact continuity:** the source harness creates a relevant artifact outside the repository; the replacement receives or accesses it through the declared handoff mechanism.
5. **Original evidence retention:** the handoff preserves the source transcript and native identifiers alongside the portable summary.
6. **Access mismatch:** the receiving harness cannot access a required artifact; the facade reports the limitation or performs an authorized export instead of claiming a complete handoff.
7. **Credential separation:** ordinary handoff material excludes authentication artifacts unless an explicit supported operation requires them.
8. **Multiple work locations:** continue work spanning several directories without collapsing them into a false one-directory/one-project model.
9. **Relocation:** resume work on another host with preserved files/context and explicit handling of path, ownership and authentication differences.
10. **Interruption/failure:** a failed export, migration or destination launch leaves source data available and reports the actual completion state.

The read-only first Spaceix scenario is implemented. These portability and harness-handoff scenarios describe subsequent work and must not be presented as already verified.

## Influencing resources

- `spaceix.ts`, `spaceix_test.ts`, `spaceix.md` and `TDD.md`: the current facade, sandbox runtime and executable contract.
- `D:/home/raiser/work/bms/`, including BMS and Uzene modules; http://bms.namekis.com/: workflow, messaging and persistence concepts to evaluate for reuse.
- `D:/home/raiser/work/2026-02-22--mcp-exec/mcp_exec-req.md`: explicit shell/runtime, argument, path and observability contracts.
- `D:/home/raiser/work/2026-04-04--configs/agent_control.kt` and `mcp_streaming_space.kt`: native agent process control, PTY capture and streaming-session prototypes.
- Zildai: existing work/discussion management; its concrete export/import and session-linking APIs still require investigation.
- Orca: an existing vendor-agnostic agent environment to evaluate for reuse, especially session control and orchestration. Adoption of its desktop interface is optional.

## Decisions still required

- Canonical ownership/storage location for portable session records and how to use Zildai without duplicating it.
- Minimum portable handoff schema and artifact-selection policy.
- Supported capabilities of each harness's resume, export and structured-control interfaces.
- Whether continuity is initially sequential only, and how to represent explicit concurrent access later.
- Recovery/relocation semantics and ownership mapping across hosts.
- Final product/executable name; retain the existing source names until a rename is explicitly selected.
