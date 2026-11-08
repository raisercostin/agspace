# Resource-advertising worker pool: existing architecture research

User direction: agents-per-host is not a hard constraint. A worker advertises available CPU, memory and storage, joins a pool, and receives tasks/agents later. Explore MapReduce/build-worker patterns rather than static agent counts.

Inspect the existing BMS at http://bms.namekis.com/, BMS/Uzene source in D:/home/raiser/work/bms, the execution requirements in D:/home/raiser/work/2026-02-22--mcp-exec, and agent launch/capture/control code in D:/home/raiser/work/2026-04-04--configs.

Acceptance: explain the actual implemented components with source references, distinguish requirements/prototypes from working implementation, and propose a small reusable worker/task/session contract. Identify uncertainty and ask for architecture confirmation before implementing a new scheduler or modifying these projects. This objective is read-only research apart from local act records.
