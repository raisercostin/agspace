# Persistent Swarm deployment

User asked whether the existing Docker Swarm should manage image upgrades while retaining volumes. Proposed design: one replica pinned to the node holding opencode-dev-home, stop-first updates, explicitly reuse that named volume, and a dedicated service network. Never give the contained agent the production Docker socket.

Current state: standalone container opencode-dev is running with home volume opencode-dev-home and bridge opencode-dev-net. No Swarm migration has occurred. Inspect node identity/topology and supported service restrictions before writing the exact migration script. Confirm the deployment change before replacing the standalone container.

Retain the verified non-root identity, read-only root, dropped capabilities, no-new-privileges, resource limits and log rotation wherever supported; surface any unsupported equivalent before proceeding. Do not join the production application overlay or publish ports unnecessarily.

Acceptance: one healthy service task uses the original volume on the correct node; existing files survive task replacement; limits and mount identity are inspected. A running sleep process alone is not evidence that OpenCode works.
