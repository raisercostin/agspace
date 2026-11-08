# OpenCode startup blocker

Verified: JBang 0.143.0 / OpenJDK 21, Rust/Cargo 1.96.1 and Deno 2.7.4 run successfully. Java and Rust compiled and executed from the workspace. OpenCode 1.19.5 reports its version, but its TUI cannot load `/tmp/.bun-1000-*.so`: operation not permitted on the restricted tmpfs.

Verified container settings: UID 1000, 2 CPUs, 4 GiB RAM/no additional swap, 256 PIDs, read-only root, all capabilities dropped, no-new-privileges, only the dedicated home volume, separate bridge, no published ports, rotated logs.

Proposed correction requiring approval: recreate only `opencode-dev` with `exec` explicitly enabled on its 512 MiB `/tmp` tmpfs. Preserve the existing `opencode-dev-home` volume and network. This allows native library loading/execution from container temporary storage; other restrictions stay in place. Restart OpenCode in tmux and verify its actual TUI before reporting readiness.

Workflow: use readable multiline remote scripts, append to `remote1.md`, keep act notes under `.act` with concise filenames. No authenticated model invocation has occurred.
