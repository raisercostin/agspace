# Working interactive OpenCode session

Current blocker: OpenCode 1.19.5 cannot load its OpenTUI native library from /tmp/.bun-1000-*.so because the temporary filesystem denies executable mappings. Version output works; interactive startup does not. See act01 attachment startup-fix.md and remote1.md.

Proposed correction: explicitly allow execution on the bounded 512 MiB /tmp tmpfs. Explain the security-setting change and obtain approval through a readable multiline command before applying it. Preserve the persistent home volume. Coordinate this with service deployment so the same change is not repeated unnecessarily.

Acceptance: OpenCode's actual TUI starts as UID 1000 in a reconnectable tmux session, remains running, and can access the public model catalog. Authentication is performed privately by the user; no credentials in rtee and no claim of authenticated model execution before testing it.
