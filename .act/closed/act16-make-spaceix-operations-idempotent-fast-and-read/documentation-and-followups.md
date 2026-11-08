# Documentation and verification follow-ups

Documentation structure agreed during development: spaceix.md is a self-contained GitHub-style tool presentation. Its Development section contains Design (including layers), testing and principles. Discussion history, progress, advice tied to a particular run and proposed future changes belong in acts.

Verified on namekis.com: the read-only tdd1 facade scenario reuses its existing service, home and tmux session; one SSH channel handles open plus all exec calls; environment() reports OS/kernel, actual shell, account and host volume path. The latest runtime-spec comparison run passed with no differences in about four seconds. One multi-client test remains ignored. Evidence is in remote1.md.

The duplicate host-volume log was removed after that run; the final source passed deno check. The volume mapping is now printed only by environment().

Pending verification is deliberately separate from the read-only scenario: explicit in-home archival, runtime recreation, cold provisioning through the shared ServiceSpec, specification mismatch handling and multi-client behavior. Do not reset tdd1 just to rerun tool-version checks.

External Compose-style service configuration was proposed as a future direction. Swarm uses docker stack deploy, but its supported Compose fields and API-only settings need evaluation before choosing that implementation. No external service file was introduced.

Other future capabilities discussed: interactive CLI attachment, durable client-side host discovery and cross-machine relocation. These are proposals rather than claims about the implemented facade.
