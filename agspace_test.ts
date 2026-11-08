import { strict as assert } from "node:assert";
import { AgspaceApp, type AgspaceLogEvent } from "./agspace.ts";

Deno.test("open tdd1, list its directory and run the installed tools", async () => {
  const host = Deno.env.get("AGSPACE_TEST_HOST") ?? Deno.env.get("SPACEIX_TEST_HOST");
  assert.ok(host, "Set AGSPACE_TEST_HOST to the approved test host.");

  const logs: AgspaceLogEvent[] = [];
  const app = new AgspaceApp({ onLog: (event) => logs.push(event) });
  const connection = await app.open("tdd1", {
    on: host,
  });

  const environment = await app.environment(connection.connectionId);
  assert.equal(environment.host, host);
  assert.ok(environment.os.name);
  assert.ok(environment.os.version);
  assert.ok(environment.os.kernel);
  assert.equal(environment.user.uid, 1000);
  assert.equal(environment.cwd, "/home/agent/workspace");
  assert.ok(environment.shell.path.startsWith("/"));
  assert.ok(environment.shell.version);
  assert.equal(environment.storage.containerPath, "/home/agent");
  assert.ok(environment.storage.hostPath.startsWith("/"));
  assert.deepEqual(environment.runtime.differences, []);

  const listing = await app.exec(connection.connectionId, ["ls", "-a"]);
  assert.equal(listing.exitCode, 0, listing.stderr);
  assert.ok(listing.stdout.split(/\r?\n/).includes("."));

  const tools = [
    { args: ["git", "--version"], version: /git version \d+\.\d+/ },
    { args: ["deno", "--version"], version: /deno \d+\.\d+/ },
    { args: ["rustc", "--version"], version: /rustc \d+\.\d+/ },
    { args: ["cargo", "--version"], version: /cargo \d+\.\d+/ },
    { args: ["java", "-version"], version: /(?:openjdk|java) version "\d+/ },
    { args: ["jbang", "--version"], version: /^\d+\.\d+\.\d+/m },
    { args: ["opencode", "--version"], version: /^\d+\.\d+\.\d+/m },
  ];

  for (const tool of tools) {
    const result = await app.exec(connection.connectionId, tool.args);
    assert.equal(result.exitCode, 0, `${tool.args[0]}: ${result.stderr}`);
    assert.match(result.stdout + result.stderr, tool.version, tool.args[0]);

    const completed = logs.findLast((event) => event.operation === "exec" && event.phase === "end");
    assert.deepEqual(completed?.details, { result });
  }

  await app.disconnect(connection.connectionId);

  for (const operation of ["open", "exec", "disconnect"]) {
    assert.ok(logs.some((event) => event.operation === operation && event.phase === "start"));
    assert.ok(logs.some((event) =>
      event.operation === operation && event.phase === "end" && event.durationMs !== undefined
    ));
  }
  assert.ok(logs.some((event) => event.phase === "command" && event.text));
  assert.ok(logs.some((event) => event.phase === "stdout" && event.text));
  assert.ok(logs.some((event) => event.phase === "stderr" && event.text));
});

Deno.test({
  name: "two connections share a session that survives both disconnecting",
  ignore: true,
  async fn() {
    const host = Deno.env.get("AGSPACE_TEST_HOST") ?? Deno.env.get("SPACEIX_TEST_HOST");
    assert.ok(host, "Set AGSPACE_TEST_HOST to the approved test host.");

    const name = "tdd1";
    const app = new AgspaceApp();

    const first = await app.open(name, { on: host });
    const second = await app.open(name);

    assert.equal(second.spaceId, first.spaceId);
    assert.equal(second.sessionId, first.sessionId);
    assert.notEqual(second.connectionId, first.connectionId);
    assert.equal((await app.inspect(name)).connectionCount, 2);

    await app.disconnect(first.connectionId);
    assert.equal((await app.inspect(name)).connectionCount, 1);

    await app.disconnect(second.connectionId);
    const detached = await app.inspect(name);
    assert.equal(detached.connectionCount, 0);
    assert.equal(detached.status, "running");
    assert.equal(detached.sessionId, first.sessionId);

    const reconnected = await app.open(name);
    assert.equal(reconnected.spaceId, first.spaceId);
    assert.equal(reconnected.sessionId, first.sessionId);
    assert.notEqual(reconnected.connectionId, first.connectionId);
    assert.notEqual(reconnected.connectionId, second.connectionId);

    const current = await app.inspect(name);
    assert.equal(current.host, host);
    assert.equal(current.status, "running");
    assert.equal(current.connectionCount, 1);

    await app.disconnect(reconnected.connectionId);
    assert.equal((await app.inspect(name)).status, "running");
  },
});
