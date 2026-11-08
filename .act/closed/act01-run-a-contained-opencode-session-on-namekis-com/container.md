## Build and create the session container

The upstream image runs OpenCode 1.19.5; Git, Node/npm and tmux were not found on PATH. Build a derived image with Git, SSH client, Node/npm, tmux, C/C++ build tools and Python. Run as UID/GID 1000:1000. Keep the whole home (including workspace and login state) in a new named volume.

Build from the reviewed local Dockerfile, then create a dedicated bridge, volume and container. Existing names cause the setup to stop rather than reuse existing data. No production mounts, published ports or Docker socket. This does not impose a workspace disk quota or outbound network allowlist.

```sh
rtee --session remote1.md ssh namekis.com 'docker build --tag opencode-dev:2026-11-01 -' < Dockerfile.opencode
rtee --session remote1.md ssh namekis.com 'set -eu; test -z "$(docker ps -aq --filter name=^/opencode-dev$)"; test -z "$(docker volume ls -q --filter name=^opencode-dev-home$)"; test -z "$(docker network ls -q --filter name=^opencode-dev-net$)"; docker network create --driver bridge opencode-dev-net; docker volume create opencode-dev-home; docker run -d --name opencode-dev --init --user 1000:1000 --cpus 2 --memory 4g --memory-swap 4g --pids-limit 256 --cap-drop ALL --security-opt no-new-privileges --read-only --tmpfs /tmp:rw,nosuid,nodev,size=512m,mode=1777 --network opencode-dev-net --mount type=volume,source=opencode-dev-home,target=/home/agent --log-driver local --log-opt max-size=10m --log-opt max-file=3 opencode-dev:2026-11-01; docker exec opencode-dev opencode --version'
```

Use a read-only root filesystem; home is writable and persistent, /tmp is bounded temporary storage. The named volume is initialized from the image's owned home directory.

## User entry point (no rtee around authentication)

```sh
ssh -t namekis.com 'docker exec -it opencode-dev tmux new-session -A -s opencode opencode'
```

Use `/connect` to authenticate, then select a model. Detach with Ctrl+B followed by D; the same command reconnects. In the tmux session, a shell window can be opened with Ctrl+B then C to clone a project into `/home/agent/workspace`.

## Verify before handing off

Inspect user, mount, readonly root, memory/swap/CPU/PID limits, dropped capabilities, security options, network membership and port bindings. Confirm home/workspace writes, Git, Node/npm, tmux, OpenCode version, and provider endpoint connectivity. Do not invoke a paid model before authentication and task selection.
