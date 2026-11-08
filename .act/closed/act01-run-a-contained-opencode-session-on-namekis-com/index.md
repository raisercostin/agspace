# OpenCode session on namekis.com

Entry point: `ssh namekis.com`. Remote commands run through `rtee --session remoteN.md ssh namekis.com '...'`.

## Intent

Run OpenCode and its subagents in one persistent, unprivileged Docker container on the existing production host. Authenticate interactively after setup; never record API keys or login tokens with rtee.

User direction: limit the damage multi-agents can cause without unnecessary infrastructure. Relevant risks are accidental filesystem/database deletion, executing vulnerable or injected code, wasting tokens, and leaking information. Use the existing SSH target `namekis.com`, execute remote operations through `rtee`, and document intended work with the `act` command. The selected CLI is OpenCode. No model provider or repository has been selected yet.

Acceptance: a persistent OpenCode session environment is available through SSH, the documented runtime restrictions are verified, and the user has exact login and reconnect commands. Do not claim authenticated model execution until it has been tested.

## Planned setup

- Container: `opencode-dev`.
- Image: inspect the documented `ghcr.io/anomalyco/opencode` image before choosing its user and startup command; record the resolved image digest.
- Pulled image digest: `sha256:f4cfe16d91efbbfca01a51c44094fba4cf82e15c7fa17de5f11f9059699b1e6e`. Entrypoint is `opencode`; no default non-root user is configured. Override the user explicitly.
- Storage: new dedicated home/workspace storage only. No production directories, existing production volumes, SSH credentials, or Docker socket mounted.
- Runtime: non-root UID/GID; 2 CPUs; 4 GiB memory with no additional swap; 256 PIDs; all capabilities dropped; no-new-privileges; default AppArmor/seccomp.
- Logs: rotation at 10 MiB with three files.
- Network: a separate bridge, no production overlay membership, no published ports. Outbound access is needed for model providers and dependencies.
- Access: interactive OpenCode through `ssh -t` and `docker exec -it`. Keep home, authentication state, and projects across container restarts.

## Next commands

Completed image pull/inspection (remote3.md); no agent container created yet:

```sh
rtee --session remote3.md ssh namekis.com 'set -eu; docker pull ghcr.io/anomalyco/opencode:latest; docker image inspect ghcr.io/anomalyco/opencode:latest --format "Digest: {{json .RepoDigests}} | User: {{.Config.User}} | Entrypoint: {{json .Config.Entrypoint}}"'
```

Record exact creation commands here after image inspection and before executing them.

## Verification

Check OpenCode version, non-root identity, writable persistent workspace/home, container limits, mounts, capabilities, network membership, and absence of published ports. Model execution remains unverified until the user authenticates.

## Boundaries

This shares the production kernel and disk. CPU/RAM/PID limits and log rotation do not impose a workspace disk quota. A separate bridge does not block all access to host services, public production endpoints, or external destinations. Do not describe this setup as network-isolated or fully resource-isolated.

Decision: start with one container for the session and its subagents; no Docker-in-Docker or per-subagent orchestration.

Reference: https://opencode.ai/docs/
