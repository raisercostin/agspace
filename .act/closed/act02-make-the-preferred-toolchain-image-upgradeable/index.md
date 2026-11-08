# Upgradeable OpenCode toolchain image

Parent aim: a contained OpenCode environment on namekis.com using JBang/Java, Rust/Cargo and Deno, rather than a generic Python/Node toolchain.

Current evidence: image opencode-dev:2026-11-01 was built; JBang 0.143.0, Java 21, Rust/Cargo 1.96.1 and Deno 2.7.4 passed execution checks. The Dockerfile is attached to act01 as Dockerfile.opencode-jbang-rust-deno.

Remaining work: move the JBang installation from the persisted /home/agent into /opt/jbang so an image update actually updates it. Keep user state/caches in home. Build a new versioned image and verify the toolchains as UID/GID 1000:1000. Choose an image distribution method compatible with the actual Swarm topology before service deployment.

Acceptance: rebuilding/upgrading the image replaces tool binaries without replacing or overwriting existing user data; all three preferred toolchains execute successfully.
