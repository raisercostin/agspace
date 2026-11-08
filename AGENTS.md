# Testing

- Use top-down, scenario-based TDD through the component facade. For this product, the boundary is `AgspaceApp`.
- Never test the application via its CLI or a shell/terminal driver. Do not spawn the application executable, parse TUI output, or assert generated command strings as a substitute for application behavior.
- SSH, tmux and Docker may be real implementation dependencies behind the facade. Facade-first does not mean mock-only.
- Keep tests readable: open, act, inspect, disconnect, reconnect. Observe relevant state through the same facade; do not inspect private runtime/storage details.
- Reuse the stable test space `tdd1`. Read-only scenarios must reuse a matching runtime/home/tmux session, not archive or recreate them. Only a scenario explicitly testing archival or recreation should request those operations. Leave artifacts available for investigation. Do not fragment one coherent workflow into parser/helper micro-tests.
- `TDD.md` defines the current executable contract. A test-runner command such as `deno test` is allowed; it does not make the application CLI the test boundary.

# Execution visibility

- Default logs should explain useful actions, reuse decisions, executed tools, output, failures and duration without repetitive payloads. Full SSH details, scripts and raw event payloads belong to explicit debug mode; structured log events remain available in both modes.
- Keep structured command results intact. Tests may observe public facade log events; do not turn logging verification into shell-script matching or a CLI test driver.
- Append remote test evidence to the existing `rtee --session remote1.md` transcript.

# Structure

- Keep implementation in `agspace.ts`, facade scenarios in `agspace_test.ts`, and the layer/lifecycle model in `agspace.md`. Encapsulate with private classes/functions inside the implementation file; do not split it into transport/helper modules without a concrete need.
