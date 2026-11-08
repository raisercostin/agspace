## Session continuity and next action

Use the original `remote1.md` transcript for all subsequent remote commands: `rtee --session remote1.md ssh namekis.com '...'`. Append to this session instead of creating a numbered file for each command. Keep this objective under act01.

Inspect the downloaded image in an ephemeral, network-disabled, resource-limited container before persistent setup. No host mounts:

```sh
rtee --session remote1.md ssh namekis.com 'set -eu; docker run --rm --network none --cpus 1 --memory 512m --pids-limit 64 --cap-drop ALL --security-opt no-new-privileges --entrypoint /bin/sh ghcr.io/anomalyco/opencode@sha256:f4cfe16d91efbbfca01a51c44094fba4cf82e15c7fa17de5f11f9059699b1e6e -c "id; command -v opencode; command -v git; command -v node; command -v npm; command -v tmux; opencode --version"'
```
