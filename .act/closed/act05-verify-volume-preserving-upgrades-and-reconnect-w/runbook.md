# OpenCode on namekis.com

## Connect

Run from a terminal with SSH. Do not record the interactive login with rtee:

```sh
ssh -t namekis.com '
set -eu
cid=$(docker ps -q --filter label=com.docker.swarm.service.name=opencode-dev --filter status=running)
test -n "$cid"
exec docker exec -it "$cid" setpriv --no-new-privs tmux new-session -A -s opencode opencode
'
```

Use `/connect` in OpenCode to select and authenticate a provider. Detach: Ctrl+B, then D. Reconnect with the same command. Open a shell window: Ctrl+B, then C. Projects belong in `/home/agent/workspace`. For a project-specific session, use that shell to clone/open the project and run `opencode` in its directory.

## Upgrade the image while retaining data

Run from this local project directory after updating the Dockerfile. Use a fresh image tag each time. These example commands create the next revision; they have not been executed as written:

```sh
rtee --session remote1.md ssh namekis.com '
set -eu
docker build --tag opencode-dev:2026-11-01-r3 -
' < Dockerfile.opencode-jbang-rust-deno

rtee --session remote1.md ssh namekis.com '
set -eu
docker service update \
  --no-resolve-image \
  --image opencode-dev:2026-11-01-r3 \
  --update-order stop-first \
  opencode-dev

cid=$(docker ps -q --filter label=com.docker.swarm.service.name=opencode-dev --filter status=running)
test -n "$cid"
docker exec "$cid" test -f /home/agent/workspace/.volume-preservation-check
docker exec "$cid" opencode --version
docker exec "$cid" tmux list-panes -t opencode -F "#{pane_current_command} | dead=#{pane_dead}"
docker inspect "$cid" --format "Image={{.Config.Image}} Mounts={{json .Mounts}}"
'
```

Image tools live outside the persistent home, including JBang in `/opt/jbang`. Update the pinned OpenCode digest and/or `JBANG_VERSION` in the Dockerfile when upgrading those tools. The current deployment uses `opencode-dev:2026-11-01-r2`.

The trusted SSH-side operator performs deployment. The contained agent can propose source changes but has no production Docker socket. The service is pinned to node `yr0x9ioufzzty2khlzoe1z9he`; local images and the local volume will not follow it to another node automatically.

## Stop, start, and rollback

On the host:

```sh
docker service scale opencode-dev=0
docker service scale opencode-dev=1
```

After a future image update, roll back its service specification with:

```sh
docker service rollback opencode-dev
```

Rollback means the immediately preceding service specification, not necessarily a prior image release. It does not undo volume data migrations. Back up valuable data before incompatible upgrades. Never delete/prune `opencode-dev-home` to perform an upgrade.

## Verified deployment

- Service: `opencode-dev`, one replica, stop-first updates, pinned to namekis.com.
- Persistent volume: `opencode-dev-home` at `/home/agent`; no production mounts or Docker socket.
- UID/GID 1000:1000, 2 CPUs, 4 GiB RAM, 256 PIDs; kernel `memory.swap.max=0`.
- Read-only root, dropped capabilities, AppArmor, seccomp. Agent process tree launched with `setpriv --no-new-privs`; live OpenCode process reports `NoNewPrivs=1`.
- Separate `opencode-agents` overlay; no published ports. Outbound networking is not restricted and host/public services may remain reachable.
- `/tmp` is a 512 MiB tmpfs. Native-library temporary storage uses `/home/agent/.cache/opencode-tmp`; home has no disk quota.
- OpenCode 1.19.5, JBang 0.143.0 / Java 21, Rust/Cargo 1.96.1, Deno 2.7.4. Java/Rust compilation and execution, Deno execution, public catalog connectivity and actual TUI startup passed.
- A marker survived the move from the standalone image to the revised service image and a subsequent service-task replacement. Interactive attachment from the user's terminal and authenticated model execution remain user-side checks.

Swarm's CLI ignored `--memory-swap 0` when updating. Zero was set through the host Engine API by preserving the current service spec and setting `TaskTemplate.Resources.SwapBytes=0`; the kernel limit was verified afterward. Normal image updates should preserve this field; verify it after future deployment changes.

tmux survives SSH disconnects, not container/task replacement. Files and saved OpenCode state persist; running model requests and builds do not. The stopped standalone container `opencode-dev` and its old bridge remain for recovery; do not start it alongside the service against the same home.
