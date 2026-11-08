# First SpaceixApp implementation

Implement the active facade scenario in TDD.md against real SSH and Docker Swarm on namekis.com. Reuse the existing toolchain image opencode-dev:2026-11-01-r2, but create independent Spaceix-owned services/volumes/networks. Do not repurpose the existing opencode-dev service or its home volume.

Space metadata lives under the SSH user's ~/.local/share/spaceix/spaces. Logical names map to generation-specific Docker resources tagged io.spaceix.id. Serialise provisioning/archive operations with a host-side flock. forceArchiveInplace stops the prior owned service, renames its metadata to an unused tdd1-archiveN, retains its original volume, and only then creates a new generation and separate home volume. Partial provisioning remains recorded for diagnosis/recovery.

Runtime: existing image, UID 1000:1000, 2 CPUs, 4 GiB RAM, no swap, 256 PIDs, read-only root, dropped capabilities, native no-new-privileges, 512 MiB /tmp, separate overlay and no published ports. Start a passive tmux shell, not OpenCode or any model request. Use the Engine API to set explicit zero swap and no-new-privileges before starting the service task, as the earlier Swarm CLI ignored a zero swap update.

Public operations: open, exec, disconnect, inspect. exec takes argv and returns exitCode/stdout/stderr. The facade owns SSH command construction and runtime inspection. Tests never invoke the application CLI. Connection handles are local to the facade instance; multi-client/interactive terminal transport remains outside the first active scenario.

Verify with the active test through rtee --session remote1.md and SPACEIX_TEST_HOST=namekis.com. Run again to exercise archival of stable tdd1 and fresh storage. Keep the multi-client test ignored. Document limitations and retain test artifacts.
