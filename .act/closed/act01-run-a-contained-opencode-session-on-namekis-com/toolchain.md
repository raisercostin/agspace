## Toolchain correction before container creation

User preference: JBang, Rust, Deno. Replace the generic Python and Node/npm package selection with JBang, OpenJDK 21, Rust/Cargo and Deno. Retain Git, SSH client, tmux and native build tools. Bash supports JBang's launcher; curl downloads its official installer. Do not install Python or Node/npm explicitly.

The first image was built, but the persistent container has not been created. Rebuild `opencode-dev:2026-11-01` from the corrected Dockerfile using the same rtee session. Install JBang as UID 1000 into the agent home, which is copied into the new persistent volume on first creation.

```sh
rtee --session remote1.md ssh namekis.com 'docker build --tag opencode-dev:2026-11-01 -' < Dockerfile.opencode
```

Then use the container creation command in container.md. Verify `jbang --version`, `java -version`, `rustc --version`, `cargo --version`, `deno --version`, and basic execution for the three requested toolchains, in addition to OpenCode and the runtime restrictions.

JBang install reference: https://www.jbang.dev/download/
