## Runtime verification

The preferred toolchain image is built from `Dockerfile.opencode-jbang-rust-deno` (supersedes the original Dockerfile). Container `opencode-dev`, volume `opencode-dev-home`, and bridge `opencode-dev-net` have been created. Next, run the reviewed smoke checks as the container's default unprivileged user and start OpenCode in tmux, without provider credentials or a model request:

```sh
rtee --session remote1.md ssh namekis.com 'docker exec -i opencode-dev sh' < verify-opencode.sh
rtee --session remote1.md ssh namekis.com 'docker inspect opencode-dev --format "User={{.Config.User}} CPU={{.HostConfig.NanoCpus}} RAM={{.HostConfig.Memory}} SwapTotal={{.HostConfig.MemorySwap}} PIDs={{.HostConfig.PidsLimit}} Readonly={{.HostConfig.ReadonlyRootfs}} Privileged={{.HostConfig.Privileged}} Caps={{json .HostConfig.CapDrop}} Security={{json .HostConfig.SecurityOpt}} Mounts={{json .Mounts}} Network={{.HostConfig.NetworkMode}} Ports={{json .HostConfig.PortBindings}} Logs={{json .HostConfig.LogConfig}}"'
```

The smoke check writes small Java/Rust test sources and binaries only into a new temporary container directory, verifies compilation/execution plus Deno execution, checks public model-catalog connectivity, and starts the reconnectable terminal session. Authentication is a user step afterward.
