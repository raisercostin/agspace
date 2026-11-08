# Readable component-facade testing

User requirements:

> I never want to test via cli shell ... initially i want a test via a component facade: SpaceixApp

> in implementation there could be ssh, tmux etc but the interface is via the facade. i want to have readable tests

Invariant: tests invoke the real component facade and observe its public state/results. They never launch the application CLI, drive a shell/terminal UI, inspect private transport/storage details, or assert generated command strings as application behavior. Real SSH/tmux/Docker may remain behind SpaceixApp; there is no mock-only or in-memory-backend requirement.

Corrected executable specification: spaceix_app_test.ts. One readable scenario opens two connections, checks shared space/session identity, disconnects them, inspects the still-running session, and reconnects with a new connection identity. No shell commands, subprocess driver, terminal parsing or fake facade.

Updated guidance: project AGENTS.md, TDD.md, PRODUCT.md, EXECUTOR.md, and the shared practice at C:/Users/raiser/.agents/practices/practice-tdd-rationale-mandate.md. Removed the superseded spaceix CLI driver, agent-exec parser/generated-script tests and root operational smoke-test script. Historical transcripts and archived evidence are not current testing instructions.

Verification: deno test spaceix_app_test.ts reports TS2307 because spaceix_app.ts does not yet exist. This is the initial facade contract RED, not a passing behavior test. Only spaceix_app_test.ts remains in the active test-file search; it contains no Deno.Command/spawn, parser-internals assertions or terminal driver.

Scope: session identity and connection lifecycle are the first scenario. Shared input/output and shell-state continuity must later be exposed and verified through facade operations, rather than restoring the rejected shell test.
