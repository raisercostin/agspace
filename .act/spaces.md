# Named sandboxed execution spaces

Build the Deno command `space` around persistent sandbox identities such as dev1, dev2 and review1. A space may contain several directories/projects and may be used by different agent CLIs. Zildai continues to identify work and discussions; do not create a competing project registry or scheduler.

Operations: create, adopt an existing Swarm service, list, status, enter, run, agent, start and stop. Default host namekis.com; explicit --on override. Discover spaces using Docker service labels rather than container IDs or project-directory ancestry. Names contain a descriptive keyword and end with a number.

Preserve the existing opencode-dev service and home volume when adopting it as dev1. New spaces use separate home volumes, no production mounts/socket, non-root execution and resource limits. Start/stop preserve data. Keep shell argument forwarding literal; use multiline scripts and append remote evidence to remote1.md.

Single-host/explicit-host executor first. No distributed task scheduler, Zildai import, machine migration or paid model request. Verify the original environment plus one separate dev2 space, then leave dev2 stopped. Document exact commands and current limits; do not install globally until the name is settled and verification passes.
