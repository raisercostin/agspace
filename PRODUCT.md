# Resource-based agent execution pool

## Purpose

Make available machines easy to join into a pool that runs coding agents and their tools with a limited blast radius. A worker advertises the resources it is willing to contribute; tasks arrive later and determine how many agent processes are started.

The experience should be as simple as Docker Swarm's **init → join → receive work**, while supporting OpenCode, Codex, Claude Code and other command-line agents through adapters.

This document defines product intent, influencing resources and proposed contracts. **Acts track progress toward the product**: research, implementation, verification and unresolved issues belong in `.act`, not in this document as a running task list.

## Core scenario

1. The owner has Docker on `host1`, `host2` and `host3`.
2. A coordinator is initialized, or an existing compatible control plane is selected.
3. Each machine joins and advertises an owner-approved CPU, RAM and storage budget, plus execution capabilities.
4. The owner submits work requiring an agent, repository/workspace and resources.
5. Work is assigned to eligible workers as capacity becomes available.
6. Agents execute tools locally, including compilation and tests, while model inference can remain with an external provider.
7. The owner can inspect, attach to, interrupt and resume supported sessions, and retrieve results and artifacts.

**Three agents per host is an example workload, not a topology constraint.** A worker may run zero, one or several tasks. A join operation must not imply launching a fixed number of agents.

## Product goals

- Simple, repeatable initialization and joining, with useful diagnostics.
- Resource-aware admission and scheduling rather than fixed agent counts.
- Reuse existing BMS/Uzene, shell-execution and agent-control ideas before introducing replacements.
- Support interactive agents and headless tasks, preserving each tool's native behavior where practical.
- Keep durable workspace/session data separate from replaceable images and processes.
- Make command execution, ownership, resource consumption and results inspectable.
- Bound filesystem damage, database/service authority, runaway resource consumption, token waste and accidental information disclosure.
- Prefer a small, testable contract over an elaborate orchestration platform.

## Concepts and boundaries

| Concept | Meaning |
|---|---|
| Pool | A set of workers that can accept work under common admission rules. |
| Worker | A machine-side executor with stable identity, capabilities and contributed resource budgets. |
| Task | Requested work, inputs, requirements, resource budget and completion criteria. |
| Attempt | One execution of a task, with its own identity, owner and outcome. |
| Agent session | A controllable process/session using a particular agent CLI; may outlive one short interaction. |
| Workspace | Durable project files and appropriate session state, independently identified from a container. |
| Artifact | A result such as a patch, commit, report, build output or transcript. |
| Coordinator | The component responsible for admission, assignment and tracking; its implementation remains an architecture choice. |

A task is not necessarily an agent: a task may compile code, run tests or request an agent interaction. Subagents are not automatically independent workers or independent security boundaries. Their resource consumption must be accounted for within the parent budget unless explicitly scheduled separately.

## Proposed minimal contracts

These contracts guide TDD and architecture selection; they do not assert that the existing projects already implement them.

### Worker registration and capacity

A worker joins with:

- stable worker identity and an authenticated pool relationship;
- OS/architecture, container/runtime capabilities and available agent/toolchain profiles;
- contributed CPU, RAM and storage budgets;
- current allocations, health and periodically refreshed capacity information;
- relevant placement constraints, such as access to a local persistent workspace.

Distinguish physical capacity, observed free resources and **capacity offered to this pool**. A production host may contribute only part of its resources. Reservations and task limits must prevent concurrent admissions from spending the same capacity twice. Storage includes retained workspaces, caches and artifacts, not just running processes.

Repeated `init` or `join` is idempotent. It must not duplicate workers or terminate unrelated processes. A worker can be drained: stop admitting new work while allowing existing work to finish or stop explicitly.

### Task submission and assignment

A task describes:

- task identity and completion criteria;
- agent adapter or executable/argument array and execution profile;
- repository/input reference and workspace identity;
- CPU, RAM and storage requirements, with enforceable limits where supported;
- required capabilities and placement constraints;
- timeout, cancellation and retry policy;
- narrowly scoped credential references, not secrets embedded in logs;
- optional dependencies and output/artifact destinations.

If no compatible worker has sufficient capacity, work stays queued with an explanation. Assignment needs an ownership/lease mechanism so worker loss can be distinguished from completion. An expired lease does not prove that the old process has stopped: conflicting writers and duplicate side effects must be addressed before retrying elsewhere.

### Execution and control

The worker provides launch, status, input, output, interrupt and stop operations, with attach/detach where the adapter supports it. Record task/attempt/session identifiers, effective arguments, working directory, execution profile, timestamps, exit status and relevant output.

Use structured process arguments by default. Shell scripts require an explicit shell/profile. Preserve path, encoding, TTY and argument-forwarding semantics across Windows and Linux boundaries.

PTY output may combine stdout and stderr and contain terminal control sequences; do not represent it as cleanly separated structured streams when it is not. Prefer a tool's supported structured protocol where suitable, retaining PTY adapters for native interactive interfaces.

### Persistence, upgrades and recovery

- Workspace identity is independent of worker process/container identity.
- Different independent agents must not accidentally share a writable home/session database.
- Image upgrades replace tools while retaining the intended data volumes.
- Tools managed by the image live outside persisted home directories, so persisted copies do not mask upgrades.
- SSH disconnect, process crash, container replacement and host loss are separate lifecycle events with different recovery guarantees.
- Local volumes remain local unless an explicit transfer/backup/shared-storage mechanism exists. Scheduling must respect that locality.
- Retrying a task creates a new attempt; completion and side effects are not assumed exactly-once.
- Image rollback does not roll back persistent data migrations.

## Architecture direction

Use **build-worker and MapReduce patterns** as inspiration: workers join with capabilities, work is queued and distributed, independent results can be combined, and failures have explicit attempt/retry semantics. Do not require every interactive agent task to fit a literal map/reduce function pair.

Separate three responsibilities:

1. **Work coordination:** tasks, dependencies, ownership, placement, capacity and outcomes.
2. **Execution adapters:** agent/process launch, PTY or structured protocol, input/output and lifecycle control.
3. **Isolation/runtime:** containers, resource enforcement, workspace mounts and node-level administration.

Docker/Swarm is an existing runtime candidate, not a mandate to build a second scheduler. Determine whether native service/task scheduling can satisfy the contract or whether a small worker/coordinator layer is needed. A global service could run one worker daemon per eligible host; it should not encode a fixed number of coding agents per host.

A worker controller that manages containers is privileged relative to its agent children. It must expose bounded operations and must not pass host Docker authority through to task agents. Swarm membership also grants the Swarm managers operational authority over the joining node; that is a different trust relationship from merely advertising work capacity to an application-level pool.

## Influencing resources

These resources are product inputs to investigate and reuse, not assumed interchangeable implementations.

| Resource | Location | Influence and evidence boundary |
|---|---|---|
| Existing BMS application | [bms.namekis.com](http://bms.namekis.com/) | Existing flow/dashboard product reference. The landing page exposes institution-specific flows; inspect their actual lifecycle and coordination behavior before claiming scheduling features. |
| BMS source | `D:\home\raiser\work\bms\` | Existing implementation to investigate, including `bms-api`, `bms-srv`, `bms-gui`, `net`, `msg`, and related modules. Reuse candidates must be grounded in their source and tests. |
| Newer Uzene work | Within the same BMS repository: `uzene-api`, `uzene-transporters`, `uzene-sayapp`, `uzene-sayapp-package` | User-identified newer direction. The API tree includes transport interfaces, registries, messages, composite transporters and persistence abstractions; the README discusses transport/address selection. Investigate how these can carry worker/task/session events. |
| MCP execution requirements | `D:\home\raiser\work\2026-02-22--mcp-exec\mcp_exec-req.md` | Explicit shell models, argument boundaries, path conversion, TTY/color, detect/doctor, structured execution metadata and daemon-first operation. This is a requirements document, not evidence of a completed executor. |
| Agent launch/capture/control prototype | `D:\home\raiser\work\2026-04-04--configs\agent_control.kt` | JBang/Kotlin, pty4j process launch, per-agent communication files, JSONL registry, locking and input/output pumps. Source inspection establishes these mechanisms, not production readiness. Existing initialization/force-cleanup semantics require review before reuse. |
| Streaming collaboration prototype | `D:\home\raiser\work\2026-04-04--configs\mcp_streaming_space.kt` | Structured `McpEvent` records, append-only JSONL stream, change signal, and init/join/watch/chat concepts. Evaluate concurrency, replay and remote transport guarantees rather than inferring them from the interface names. |
| Agent-control tests and context | Same configs directory: `agent_control_test.kt`, `codex_space_test.kt`, `mcp_streaming_space_test.kt`, `ACTORS.md`, `.spaces`, `.aims`, `.changes` | Inputs for intended behavior, prior design rationale and executable contracts; test files exist but their coverage/results need inspection. |
| Docker Swarm | [Service model, placement, updates and volumes](https://docs.docker.com/engine/swarm/services/) | Simple init/join experience, resource reservations/limits, task scheduling, placement and image replacement. Swarm does not automatically replicate local volume contents. |
| MapReduce and build workers | Distributed work/aggregation and CI/build-executor patterns | Conceptual influence for joining capacity, dispatch, dependencies, retries and collecting outputs; no particular framework is selected. |
| Existing OpenCode deployment | Swarm service `opencode-dev` on `namekis.com`; `Dockerfile.opencode-jbang-rust-deno` | A concrete isolated execution environment and persistence/upgrade example. It is not yet a resource-advertising worker pool. Operational commands and evidence belong in the deployment acts/runbook. |
| `rtee` and `act` | Installed command-line tools used in this workspace | `rtee` records execution evidence in a continuing session; `act` tracks objectives and subacts. Product requirements remain here. Interactive authentication must not leak secrets into recordings. |

### Source entry points already identified

- `bms/readme.md`: transport choices, address/configuration concepts and references to flow tests.
- `bms/uzene-api/src/main/java/org/uzene/transport/`: `Transporter`, `TransportServer`, `TransportRegistry`, `UzeneMessage`, composite transports and persistence-related contracts.
- `agent_control.kt`: `AgentInfo`, `AgentControlApp.init`, `join`, PTY setup and communication pumps.
- `mcp_streaming_space.kt`: `McpEvent`, `McpStreamingApp`, CLI init/join/watch/chat.
- `mcp_exec-req.md`: shell-model contract, observability, argument arrays, daemon lifecycle and acceptance matrix.

## TDD acceptance scenarios

**Mandatory boundary:** tests invoke the component facade directly; for sandbox/session behavior this is `AgspaceApp`. Never drive the application CLI, simulate shell input or parse terminal output as a test interface. Real SSH/tmux/Docker may be implementation details behind the facade. Scenarios below are driven and observed through component APIs, not executable wrappers.

1. **Join without work:** three hosts join with different budgets; all appear as workers and no coding agents are started merely because they joined.
2. **Dynamic dispatch:** tasks start only on workers satisfying capabilities, locality and available contributed capacity. Agent counts can differ between hosts.
3. **Atomic admission:** competing submissions cannot reserve the same resources twice; excess work remains queued.
4. **Resource release:** completion, cancellation and confirmed process exit release allocations appropriately; retained disk data remains accounted for.
5. **Isolation:** one task cannot read or overwrite another task's private workspace through its assigned mounts.
6. **Session control:** launch an adapter, deliver input, capture output, detach and reconnect without restarting the live process when supported.
7. **Execution fidelity:** arguments, working directory, exit code, paths and TTY mode obey the selected profile; test quoting and Unicode across platform boundaries.
8. **Worker failure:** missing heartbeats mark ownership uncertain; retry policy prevents uncontrolled duplicate writers and records a new attempt explicitly.
9. **Persistence:** replace an image/process and verify the intended workspace data remains; do not confuse this with host-loss recovery.
10. **Idempotent membership:** repeated init/join does not duplicate membership, erase state or kill unrelated processes.
11. **Drain:** a draining worker receives no new tasks; existing attempts follow the declared finish/stop policy.
12. **Traceability:** every result, log and artifact resolves to its task, attempt and worker; interruption is never reported as successful completion.

Prefer one readable, coherent facade scenario over a collection of parser/helper micro-tests. Exercise real dependencies through the facade when their behavior matters, with isolated setup. Add further component-facade scenarios only for concrete requirements; do not build a speculative coverage matrix. A mocked runtime does not establish real container or distributed-storage guarantees.

## Preferences and scope

- Preferred implementation/toolchain choices: **JBang/Java, Rust and Deno**. Choose based on existing code and required capabilities, not a generic Python default.
- Linux Docker workers are the first concrete deployment target; Windows is an important control/development environment. Native Windows workers require an explicit execution profile and separate verification.
- Hosted model inference is sufficient; GPUs and local model serving are optional capabilities, not baseline requirements.
- Keep credentials and production authority minimal. Track model/provider budgets separately from CPU/RAM budgets.
- Do not introduce distributed storage, Kubernetes, literal MapReduce infrastructure or a new scheduler without a demonstrated requirement.
- Names and CLI syntax remain open. `init`, `join`, `submit`, `status`, `attach`, `cancel`, `drain` and `upgrade` describe desired operations, not installed commands.

## Architecture questions to resolve from the references

- Which BMS/Uzene flow, messaging and persistence components are reusable as-is, and which are historical prototypes?
- Should workers pull leased work, accept pushes, or map work directly onto Swarm tasks?
- What should persist across agent interactions: a workspace, a process, an adapter session, or all three under separate identities?
- How should capability discovery and resource budgets be represented and updated?
- Which agent tools offer reliable structured control, and which require PTY adaptation?
- What is the initial storage-locality and backup contract, and when is moving work across hosts safe?
- How should provider authentication and spend limits be scoped across tasks?

Resolve these through source review and executable contracts before selecting a replacement architecture.
