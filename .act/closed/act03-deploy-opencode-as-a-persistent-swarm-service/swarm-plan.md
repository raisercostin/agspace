# Swarm implementation decisions

Single-node Swarm: namekis.com, node ID yr0x9ioufzzty2khlzoe1z9he. Build versioned node-local images and deploy with --no-resolve-image and a node-ID constraint; a registry is unnecessary for this single-node arrangement. Do not reuse version tags for future upgrades.

Install pinned JBang 0.143.0 in /opt/jbang, outside the persisted home, with /opt/jbang/bin first on PATH. Other preferred toolchains remain in the image.

Swarm CLI lacks --security-opt. Launch the session process tree through setpriv --no-new-privs, verify NoNewPrivs=1 for the live OpenCode process, and use setpriv for reconnect/shell entry commands. This protects the agent process tree, not arbitrary administrator docker exec calls.

Resolve native-library loading by setting TMPDIR=/home/agent/.cache/opencode-tmp, creating it with mode 700 at startup. This intentionally permits native code loading there. /tmp remains a restricted 512 MiB tmpfs. Home has no disk quota; the chosen temporary directory uses the home volume rather than bounded RAM.

Migration: stop the standalone opencode-dev container, retain it for rollback, deploy a one-replica service named opencode-dev on its own overlay, and mount the existing opencode-dev-home at /home/agent. Stop-first updates/rollbacks. Keep non-root, read-only root, all capabilities dropped, 2 CPUs, 4 GiB memory/no additional swap, 256 PIDs, and log rotation. Preserve volume contents and check a harmless marker across replacement.

Before declaring readiness, inspect actual service/task restrictions, verify toolchain execution and TUI startup, and confirm the agent's kernel no-new-privileges flag. No provider authentication or paid model request is part of these checks.
