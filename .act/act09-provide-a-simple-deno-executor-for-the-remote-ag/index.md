# Simple remote agent executor

Provide a single-file Deno command for the existing OpenCode Docker Swarm environment on namekis.com. This is a host/container execution convenience, not the future multi-agent scheduler.

Operations: status, shell, run -- <program> <args>, attach, start and stop. Defaults: SSH target namekis.com, service opencode-dev, workspace /home/agent/workspace, tmux session opencode. Permit explicit host/service/workdir overrides. Resolve the current running task by service label on every invocation; refuse ambiguous multiple running containers.

Use Deno.Command argument arrays locally and explicit POSIX quoting at the remote SSH shell boundary. Forward command arguments without interpolation, preserve exit codes and use a TTY only for interactive operations. Run container sessions through setpriv --no-new-privs. Start/stop scale only the selected service and preserve volumes.

Acceptance: meaningful automated tests cover argument forwarding and injection boundaries; type checking passes; read-only status and preferred-toolchain execution work against the existing service via the continuing rtee session. Document and install the local command if its name is available. Do not launch a paid model or log authentication.
