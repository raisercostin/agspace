export interface OpenOptions {
  on?: string;
  forceArchiveInplace?: boolean;
}

export interface Connection {
  connectionId: string;
  spaceId: string;
  sessionId: string;
  name: string;
  host: string;
  archivePath?: string;
}

export interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface EnvironmentInfo {
  host: string;
  hostname: string;
  os: { name: string; version: string; kernel: string; architecture: string };
  user: { name: string; uid: number; gid: number };
  cwd: string;
  home: string;
  tmpdir: string;
  shell: { path: string; version: string };
  tmuxVersion: string;
  term: string;
  locale: string;
  storage: { volume: string; hostPath: string; containerPath: string };
  runtime: RuntimeComparison;
}

export interface RuntimeComparison {
  expected: unknown;
  actual: unknown;
  differences: { path: string; expected: unknown; actual: unknown }[];
}

export interface SpaceState {
  name: string;
  host: string;
  spaceId: string;
  sessionId: string | null;
  status: "running" | "stopped" | "starting" | "archived";
  connectionCount: number;
}

export interface AgspaceLogEvent {
  timestamp: string;
  operationId: string;
  parentId?: string;
  operation: string;
  phase: "start" | "command" | "stdout" | "stderr" | "end" | "error";
  details?: unknown;
  text?: string;
  durationMs?: number;
}

interface RemoteState {
  name: string;
  runtimeName: "agspace" | "spaceix";
  spaceId: string;
  sessionId: string | null;
  status: SpaceState["status"];
  archivePath?: string;
  containerId?: string;
  storage: EnvironmentInfo["storage"];
  runtime: RuntimeComparison;
}

// Swarm ServiceSpec configuration, shared by creation and comparison. Lifecycle
// (replica count) is separate: opening may start an otherwise matching stopped service.
const RUNTIME_SPEC = {
  TaskTemplate: {
    ContainerSpec: {
      Image: "@image", User: "1000:1000", ReadOnly: true, Init: true,
      Args: ["-c", "@startup"], Env: [], Command: [],
      Privileges: { NoNewPrivileges: true },
      CapabilityDrop: ["ALL"], CapabilityAdd: [],
      Mounts: [
        { Type: "volume", Source: "@volume", Target: "/home/agent", ReadOnly: false },
        { Type: "tmpfs", Target: "/tmp", TmpfsOptions: { SizeBytes: 536870912, Mode: 1023 } },
      ],
      StopGracePeriod: 30_000_000_000,
    },
    Resources: { Limits: { NanoCPUs: 2_000_000_000, MemoryBytes: 4_294_967_296, Pids: 256 }, SwapBytes: 0 },
    Placement: { Constraints: ["@nodeConstraint"] },
    Networks: [{ Target: "@network" }],
    LogDriver: { Name: "local", Options: { "max-size": "10m", "max-file": "3" } },
  },
  EndpointSpec: { Ports: [] },
  UpdateConfig: { Order: "stop-first" },
  RollbackConfig: { Order: "stop-first" },
};

function quote(value: string): string {
  if (value.includes("\0")) throw new Error("Arguments cannot contain NUL bytes.");
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

const ARCHIVE_HOME = String.raw`
set -eu
runtime_name="$1"
archives="$HOME/.$runtime_name-archives"
test ! -L "$archives"
mkdir -p "$archives"
n=1
while test -e "$archives/archive$n"; do n=$((n + 1)); done
archive="$archives/archive$n"
mkdir "$archive"
if tmux has-session -t "$runtime_name" 2>/dev/null; then tmux kill-session -t "$runtime_name"; fi
for item in "$HOME"/* "$HOME"/.[!.]* "$HOME"/..?*; do
  if ! test -e "$item" && ! test -L "$item"; then continue; fi
  if test "$item" = "$archives"; then continue; fi
  mv "$item" "$archive/"
done
mkdir -p "$HOME/workspace" "$TMPDIR"
chmod 700 "$TMPDIR"
cd "$HOME/workspace"
tmux new-session -d -s "$runtime_name" /bin/bash
printf '%s\n' "$archive"
`;

// This protocol is private to the SSH backend, not the application's test interface.
const REMOTE = String.raw`
set -eu
umask 077
root="$HOME/.local/share/agspace"
# Existing spaces retain their original metadata location and runtime identities.
legacy_root="$HOME/.local/share/spaceix"
if test -d "$legacy_root/spaces/$name"; then
  if test -d "$root/spaces/$name"; then
    printf 'Ambiguous space %s: metadata exists under both agspace and spaceix.\n' "$name" >&2
    exit 1
  fi
  root="$legacy_root"
fi
path="$root/spaces/$name"

fail() { printf '%s\n' "$*" >&2; exit 1; }
step() { printf '[agspace stage] %s\n' "$*" >&2; }

load_state() {
  test -f "$path/state.json" || fail "Space $name has no state on this host."
  id=$(jq -er .spaceId "$path/state.json")
  service=$(jq -er .service "$path/state.json")
  volume=$(jq -er .volume "$path/state.json")
  network=$(jq -er .network "$path/state.json")
  image=$(jq -er .image "$path/state.json")
  runtime_name=$(jq -er '.runtimeName // "spaceix"' "$path/state.json")
  case "$runtime_name" in agspace|spaceix) ;; *) fail "Unsupported runtime identity." ;; esac
  owner_label="io.$runtime_name.id"
  startup=$(printf 'mkdir -p "$TMPDIR" && chmod 700 "$TMPDIR" && tmux new-session -d -s %s /bin/bash && exec sleep infinity' "$runtime_name")
}

check_service_owner() {
  owner=$(docker service inspect "$service" --format '{{json .Spec.Labels}}' | jq -er --arg key "$owner_label" '.[$key]')
  test "$owner" = "$id" || fail "Refusing to operate on a service with a different owner."
}

find_container() {
  set -- $(docker ps -q --filter "label=com.docker.swarm.service.name=$service" --filter status=running)
  test "$#" -eq 1 || return 1
  container="$1"
}

describe() {
  status=stopped
  session=""
  if test "$(jq -r .status "$path/state.json")" = archived; then
    status=archived
  elif docker service inspect "$service" >/dev/null 2>&1; then
    check_service_owner
    if find_container; then
      status=starting
      if key=$(docker exec "$container" tmux display-message -p -t "$runtime_name" '#{pid}:#{session_id}:#{session_created}' 2>/dev/null); then
        status=running
        session="$container:$key"
      fi
    fi
  fi
  home_path=$(docker volume inspect "$volume" --format '{{.Mountpoint}}')
  jq -cn --arg name "$name" --arg id "$id" --arg session "$session" \
    --arg status "$status" --arg archived "$archived" \
    --arg container "$container" --arg volume "$volume" --arg homePath "$home_path" \
    --arg runtimeName "$runtime_name" \
    --argjson expected "$runtime_expected" --argjson actual "$runtime_actual" --argjson differences "$runtime_diff" \
    '{type:"space",name:$name,runtimeName:$runtimeName, spaceId:$id, containerId:$container, sessionId:(if $session=="" then null else $session end), status:$status,
      storage:{volume:$volume,hostPath:$homePath,containerPath:"/home/agent"},runtime:{expected:$expected,actual:$actual,differences:$differences}}
      + (if $archived=="" then {} else {archivePath:$archived} end)'
}
`;

/** Application facade. Agent execution stays inside a separately owned Swarm space. */
export class AgspaceApp {
  readonly #image: string;
  readonly #debug: boolean;
  readonly #onLog?: (event: AgspaceLogEvent) => void;
  #sequence = 0;
  readonly #hosts = new Map<string, string>();
  readonly #connections = new Map<string, Connection>();
  readonly #executors = new Map<string, Promise<SshExecutor>>();

  constructor(options: { image?: string; debug?: boolean; onLog?: (event: AgspaceLogEvent) => void } = {}) {
    this.#image = options.image ?? "opencode-dev:2026-11-01-r2";
    let envDebug = false;
    if (options.debug === undefined) {
      try { envDebug = /^(true|1|yes|on)$/i.test(Deno.env.get("APP_DEBUG") ?? ""); } catch { /* Optional env default. */ }
    }
    this.#debug = options.debug ?? envDebug;
    this.#onLog = options.onLog;
  }

  async open(name: string, options: OpenOptions = {}): Promise<Connection> {
    return await this.#operation("open", { name, ...options }, (id) => this.#open(name, options, id));
  }

  async exec(connectionId: string, argv: string[]): Promise<ExecutionResult> {
    const connection = this.#connections.get(connectionId);
    return await this.#operation("exec", {
      connectionId,
      space: connection?.name,
      host: connection?.host,
      argv,
      stdin: { mode: "closed", bytes: 0 },
    }, (id) => this.#exec(connectionId, argv, id));
  }

  async environment(connectionId: string): Promise<EnvironmentInfo> {
    return await this.#operation("environment", { connectionId }, async (operationId) => {
      const connection = this.#connections.get(connectionId);
      const pending = this.#executors.get(connectionId);
      if (!connection || !pending) throw new Error("Unknown or disconnected connection.");
      const state = (await pending).state;
      const argv = ["deno", "eval", ENVIRONMENT_SOURCE, "--", state.runtimeName];
      this.#emit({ operationId, operation: "environment", phase: "command",
        details: { argv, stdin: "closed" }, text: ENVIRONMENT_SOURCE });
      const result = await this.#exec(connectionId, argv, operationId, "environment");
      this.#requireSuccess(result, "Inspecting sandbox environment");
      return { ...JSON.parse(result.stdout), host: connection.host, storage: state.storage, runtime: state.runtime };
    });
  }

  async disconnect(connectionId: string): Promise<void> {
    return await this.#operation("disconnect", { connectionId }, async () => {
      const connection = this.#connections.get(connectionId);
      if (!connection) throw new Error("Unknown or disconnected connection.");
      this.#connections.delete(connectionId);
      const executor = this.#executors.get(connectionId);
      this.#executors.delete(connectionId);
      if (executor) await (await executor).close();
    });
  }

  async inspect(name: string, options: { on?: string } = {}): Promise<SpaceState> {
    return await this.#operation("inspect", { name, ...options }, (id) => this.#inspect(name, options, id));
  }

  async #open(name: string, options: OpenOptions, operationId: string): Promise<Connection> {
    const host = this.#resolve(name, options.on);
    if (options.forceArchiveInplace && [...this.#connections.values()].some((connection) => connection.name === name)) {
      throw new Error("Disconnect this application's handles before explicitly archiving its home.");
    }
    const startup = 'mkdir -p "$TMPDIR" && chmod 700 "$TMPDIR" && ' +
      'tmux new-session -d -s agspace /bin/bash && exec sleep infinity';
    const script = this.#header(name) + `
requested_image=${quote(this.#image)}
new_id=${quote(crypto.randomUUID())}
force=${options.forceArchiveInplace ? "yes" : "no"}
startup=${quote(startup)}
archive_home=${quote(ARCHIVE_HOME)}
executor_source=${quote(EXECUTOR_SOURCE)}
spec_template=${quote(JSON.stringify(RUNTIME_SPEC))}
` + String.raw`
expected_spec() {
  network_id=$(docker network inspect "$network" --format '{{.Id}}')
  printf '%s\n' "$spec_template" | jq --arg image "$requested_image" --arg volume "$volume" \
    --arg network "$network_id" --arg nodeConstraint "node.id==$node" --arg startup "$startup" '
      {"@image":$image,"@volume":$volume,"@network":$network,"@nodeConstraint":$nodeConstraint,"@startup":$startup} as $bindings
      | walk(if type=="string" then ($bindings[.] // .) else . end)'
}
compare_spec() {
  runtime_expected=$(expected_spec)
  runtime_actual=$(docker service inspect "$service" | jq '.[0].Spec')
  comparison=$(jq -n --argjson expected "$runtime_expected" --argjson actual "$runtime_actual" '
    # Normalize API defaults and unordered collections, not business expectations.
    def normalize:
      .TaskTemplate.ContainerSpec |= (
        .CapabilityAdd = ((.CapabilityAdd // []) | sort)
        | .CapabilityDrop = ((.CapabilityDrop // []) | sort)
        | .Env = (.Env // []) | .Command = (.Command // [])
        | .Mounts |= (map(.ReadOnly = (.ReadOnly // false) | .Source = (.Source // "")) | sort_by(.Target)))
      | .TaskTemplate.Networks |= sort_by(.Target)
      | .TaskTemplate.Placement.Constraints |= sort
      | .EndpointSpec.Ports = (.EndpointSpec.Ports // []);
    def diff($e; $a; $p):
      if ($e|type)=="object" and ($a|type)=="object" then
        [($e|keys[]) as $k | diff($e[$k]; $a[$k]; $p+[$k])[]]
      elif ($e|type)=="array" and ($a|type)=="array" and ($e|length)==($a|length) then
        [range(0; $e|length) as $i | diff($e[$i]; $a[$i]; $p+[$i])[]]
      elif $e==$a then []
      else [{path:($p|map(tostring)|join(".")),expected:$e,actual:$a}] end;
    ($expected|normalize) as $e | ($actual|normalize) as $a
    | {expected:$e,actual:$a,differences:diff($e;$a;[])}')
  runtime_expected=$(printf '%s\n' "$comparison" | jq .expected)
  runtime_actual=$(printf '%s\n' "$comparison" | jq .actual)
  runtime_diff=$(printf '%s\n' "$comparison" | jq .differences)
  if test "$(printf '%s\n' "$runtime_diff" | jq length)" != 0; then
    printf '%s\n' "$runtime_diff" | jq -r '.[] | "[agspace stage] MISMATCH " + .path + ": actual=" + (.actual|tojson) + " expected=" + (.expected|tojson)' >&2
    fail "Runtime specification differs; no replacement was attempted."
  fi
  step "runtime matches desired specification: no differences (image, user/security, mounts, resources, placement, network and logging)"
}
finish_open() {
  describe
  # Release the provisioning lock before this channel becomes a long-lived executor.
  flock -u 9
  exec 9>&-
  exec docker exec -i --workdir /home/agent/workspace "$container" \
    setpriv --no-new-privs deno eval "$executor_source"
}
# Check prerequisites before touching an existing space.
for tool in jq curl flock; do
  location=$(command -v "$tool") || fail "Required host tool missing: $tool"
  step "host prerequisite: $tool available at $location"
done
test "$(docker info --format '{{.Swarm.ControlAvailable}}')" = true || fail "The SSH host must be a Swarm manager."
step "host prerequisite: Docker Swarm manager available"
image_description=$(docker image inspect "$requested_image" --format '{{.Os}}/{{.Architecture}} {{.Id}}')
requested_image_id=$(docker image inspect "$requested_image" --format '{{.Id}}')
step "image available locally: $requested_image ($image_description)"
node=$(docker info --format '{{.Swarm.NodeID}}')
mkdir -p "$root/spaces"
exec 9>"$root/provision.lock"
flock -w 180 9 || fail "Timed out waiting for another space operation."
step "provisioning lock acquired for $name"

had_state=no
if test -d "$path"; then
  had_state=yes
  load_state
  test "$(jq -r .status "$path/state.json")" != archived || fail "This name is archived; it cannot be reopened implicitly."
  test "$image" = "$requested_image" || fail "Existing space uses $image, not $requested_image; update it explicitly."
  if docker service inspect "$service" >/dev/null 2>&1; then
    check_service_owner
    compare_spec
    if find_container; then
      actual_image_id=$(docker inspect "$container" --format '{{.Image}}')
      test "$actual_image_id" = "$requested_image_id" || fail "Running image $actual_image_id differs from installed image $requested_image_id."
      step "running container image matches the installed image ID"
      if test "$force" = yes; then
        step "archive user home in place; keep Docker service, volume and network"
        archived=$(docker exec "$container" /bin/sh -c "$archive_home" -- "$runtime_name")
      elif docker exec "$container" tmux has-session -t "$runtime_name" >/dev/null 2>&1; then
        step "reuse $name: matching Docker service, home volume, tmux session and shell"
      else
        step "reuse $name runtime; start only the missing tmux session"
        docker exec "$container" /bin/sh -c 'mkdir -p "$TMPDIR"; chmod 700 "$TMPDIR"; tmux new-session -d -s "$1" /bin/bash' -- "$runtime_name"
      fi
      finish_open
    fi
  fi
fi

if ! test -d "$path"; then
  step "create new generation $new_id for $name"
  mkdir "$path"
  service="agspace-$new_id"
  jq -n --arg name "$name" --arg id "$new_id" --arg service "$service" \
    --arg volume "$service-home" --arg network "$service-net" --arg image "$requested_image" \
    '{name:$name,runtimeName:"agspace",spaceId:$id,service:$service,volume:$volume,network:$network,image:$image,status:"provisioning"}' \
    > "$path/state.next"
  mv "$path/state.next" "$path/state.json"
fi
load_state

# Resume a partially provisioned generation only when resource ownership matches.
if docker volume inspect "$volume" >/dev/null 2>&1; then
  test "$(docker volume inspect "$volume" --format '{{json .Labels}}' | jq -er --arg key "$owner_label" '.[$key]')" = "$id" \
    || fail "Volume ownership mismatch."
else
  step "create volume $volume"
  docker volume create --label "$owner_label=$id" "$volume" >&2
fi
if docker network inspect "$network" >/dev/null 2>&1; then
  test "$(docker network inspect "$network" --format '{{json .Labels}}' | jq -er --arg key "$owner_label" '.[$key]')" = "$id" \
    || fail "Network ownership mismatch."
else
  step "create overlay network $network"
  docker network create --driver overlay --label "$owner_label=$id" "$network" >&2
fi
if docker service inspect "$service" >/dev/null 2>&1; then
  check_service_owner
else
  step "create stopped service $service from $image"
  spec=$(expected_spec | jq --arg name "$service" --arg id "$id" --arg space "$name" --arg runtime "$runtime_name" \
    '. + {Name:$name,Labels:{("io."+$runtime+".id"):$id,("io."+$runtime+".name"):$space},Mode:{Replicated:{Replicas:0}}}')
  curl --fail --silent --show-error --unix-socket /var/run/docker.sock \
    --header 'Content-Type: application/json' --request POST --data "$spec" \
    http://localhost/services/create >&2
fi

if test "$(docker service inspect "$service" --format '{{.Spec.Mode.Replicated.Replicas}}')" = 0; then
  step "set zero swap, no-new-privileges and start service $service via Docker Engine API"
  version=$(docker service inspect "$service" --format '{{.Version.Index}}')
  spec=$(docker service inspect "$service" | jq '.[0].Spec
    | .Mode.Replicated.Replicas=1')
  curl --fail --silent --show-error --unix-socket /var/run/docker.sock \
    --header 'Content-Type: application/json' --request POST --data "$spec" \
    "http://localhost/services/$service/update?version=$version" >&2
fi

elapsed=0
ready=no
step "wait for tmux session $runtime_name in $service"
while test "$elapsed" -lt 120; do
  if find_container && docker exec "$container" tmux has-session -t "$runtime_name" >/dev/null 2>&1; then
    ready=yes
    break
  fi
  sleep 1
  elapsed=$((elapsed + 1))
done
if test "$ready" != yes; then
  docker service ps --no-trunc "$service" >&2
  fail "Timed out waiting for the space shell; resources retained for inspection."
fi
if test "$force" = yes && test "$had_state" = yes; then
  step "archive user home in place; keep the recovered runtime"
  archived=$(docker exec "$container" /bin/sh -c "$archive_home" -- "$runtime_name")
fi
jq '.status="active"' "$path/state.json" > "$path/state.next"
mv "$path/state.next" "$path/state.json"
step "space $name ready in container $container after $elapsed readiness polls"
compare_spec
finish_open
`;
    const executor = await this.#operation("transport", { host, space: name }, async (id) => {
      const args = ["-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", host, BOOTSTRAP];
      this.#emit({ operationId: id, parentId: operationId, operation: "transport", phase: "command",
        details: { executable: "ssh", args, host, stdin: "bootstrap script, then JSON argv requests" }, text: script });
      return await SshExecutor.connect(args, script, (text) => {
        this.#emit({ operationId: id, parentId: operationId, operation: "transport", phase: "stderr", text });
      });
    }, operationId);
    const state = executor.state;
    if (state.status !== "running" || !state.sessionId) {
      await executor.close();
      throw new Error(`Space ${name} did not establish a running session.`);
    }
    this.#hosts.set(name, host);
    const connection: Connection = {
      connectionId: crypto.randomUUID(),
      name,
      host,
      spaceId: state.spaceId,
      sessionId: state.sessionId,
      ...(state.archivePath ? { archivePath: state.archivePath } : {}),
    };
    this.#connections.set(connection.connectionId, { ...connection });
    this.#executors.set(connection.connectionId, Promise.resolve(executor));
    return connection;
  }

  async #exec(connectionId: string, argv: string[], operationId: string, operation = "exec"): Promise<ExecutionResult> {
    const connection = this.#connections.get(connectionId);
    if (!connection) throw new Error("Unknown or disconnected connection.");
    if (argv.length === 0 || !argv[0]) throw new Error("exec requires a program.");
    argv.forEach(quote); // Reject NULs; the reusable transport carries JSON argv, not shell text.
    const pending = this.#executors.get(connectionId);
    if (!pending) throw new Error("Execution channel is closed; reopen the space.");
    try {
      const executor = await pending;
      return await executor.exec(argv, (phase, text) => {
        this.#emit({ operationId, operation, phase, text });
      });
    } catch (error) {
      this.#executors.delete(connectionId);
      try { await (await pending).close(); } catch { /* Preserve the original execution failure. */ }
      throw error;
    }
  }

  async #inspect(name: string, options: { on?: string }, operationId: string): Promise<SpaceState> {
    const host = this.#resolve(name, options.on);
    const result = await this.#ssh(host, this.#header(name) + "\nload_state\ndescribe\n", operationId);
    this.#requireSuccess(result, `Inspecting ${name}`);
    const state = JSON.parse(result.stdout) as RemoteState;
    const connectionCount = [...this.#connections.values()].filter((connection) =>
      connection.host === host && connection.spaceId === state.spaceId
    ).length;
    return { name, host, spaceId: state.spaceId, sessionId: state.sessionId, status: state.status, connectionCount };
  }

  #resolve(name: string, explicitHost?: string): string {
    if (!/^[a-z][a-z0-9-]*[0-9]$/.test(name) || name.length > 64) {
      throw new Error("Use a space name ending in a number, such as dev1 or tdd1.");
    }
    const host = explicitHost ?? this.#hosts.get(name);
    if (!host) throw new Error(`Host unknown for ${name}; pass { on: "host" }.`);
    if (!/^[A-Za-z0-9_][A-Za-z0-9_.@:[\]-]*$/.test(host)) throw new Error("Invalid SSH target.");
    const known = this.#hosts.get(name);
    if (known && known !== host) throw new Error(`Space ${name} is already associated with ${known}.`);
    return host;
  }

  #header(name: string): string {
    return `name=${quote(name)}\narchived=''\ncontainer=''\nruntime_expected='{}'\nruntime_actual='{}'\nruntime_diff='[]'\n` + REMOTE;
  }

  async #ssh(host: string, script: string, parentId: string): Promise<ExecutionResult> {
    // Stream scripts rather than nesting them through Windows/SSH command-line quoting.
    const args = ["-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", host, "exec /bin/sh -s"];
    const scriptBytes = new TextEncoder().encode(script);
    return await this.#operation("ssh", {
      host,
      remoteShell: "/bin/sh",
      stdin: { mode: "script", bytes: scriptBytes.length },
    }, async (operationId) => {
      this.#emit({
        operationId, parentId, operation: "ssh", phase: "command",
        details: { executable: "ssh", args, host, remoteShell: "/bin/sh" },
        text: script,
      });
      const process = new Deno.Command("ssh", {
        args,
        stdin: "piped",
        stdout: "piped",
        stderr: "piped",
      }).spawn();
      const read = async (stream: ReadableStream<Uint8Array>, phase: "stdout" | "stderr") => {
        const decoder = new TextDecoder();
        let output = "";
        for await (const bytes of stream) {
          const text = decoder.decode(bytes, { stream: true });
          output += text;
          if (text) this.#emit({ operationId, parentId, operation: "ssh", phase, text });
        }
        const text = decoder.decode();
        output += text;
        if (text) this.#emit({ operationId, parentId, operation: "ssh", phase, text });
        return output;
      };
      const writeScript = async () => {
        const writer = process.stdin.getWriter();
        try {
          await writer.write(scriptBytes);
          await writer.close();
        } finally {
          writer.releaseLock();
        }
      };
      const [status, stdout, stderr] = await Promise.all([
        process.status,
        read(process.stdout, "stdout"),
        read(process.stderr, "stderr"),
        writeScript(),
      ]);
      return { exitCode: status.code, stdout, stderr };
    }, parentId);
  }

  async #operation<T>(
    operation: string,
    details: unknown,
    action: (operationId: string) => Promise<T>,
    parentId?: string,
  ): Promise<T> {
    const operationId = `op${++this.#sequence}`;
    const started = performance.now();
    this.#emit({ operationId, parentId, operation, phase: "start", details });
    try {
      const result = await action(operationId);
      this.#emit({
        operationId, parentId, operation, phase: "end",
        durationMs: Math.round(performance.now() - started),
        details: { result: operation === "transport" ? { ready: true } : result ?? null },
      });
      return result;
    } catch (error) {
      this.#emit({
        operationId, parentId, operation, phase: "error",
        durationMs: Math.round(performance.now() - started),
        text: error instanceof Error ? error.stack ?? error.message : String(error),
      });
      throw error;
    }
  }

  #emit(event: Omit<AgspaceLogEvent, "timestamp">): void {
    const entry: AgspaceLogEvent = { timestamp: new Date().toISOString(), ...event };
    this.#onLog?.(entry);
    if (!this.#debug) {
      this.#present(entry);
      return;
    }
    const prefix = `${entry.timestamp} [agspace ${entry.operationId}` +
      `${entry.parentId ? ` parent=${entry.parentId}` : ""} ${entry.operation} ${entry.phase}]`;
    console.error(`${prefix}${entry.durationMs === undefined ? "" : ` ${entry.durationMs}ms`}`);
    if (entry.details !== undefined) {
      console.error(JSON.stringify(entry.details, null, 2));
    }
    if (entry.text !== undefined) {
      if (entry.phase === "command") console.error("--- remote script begin ---");
      console.error(entry.text);
      if (entry.phase === "command") console.error("--- remote script end ---");
    }
  }

  #present(entry: AgspaceLogEvent): void {
    const details = (entry.details ?? {}) as Record<string, unknown>;
    const label = `[${entry.operationId}]`;
    if (entry.phase === "error") {
      console.error(`${label} ${entry.operation} failed after ${entry.durationMs}ms\n${entry.text}`);
    } else if (entry.phase === "start" && entry.operation === "exec") {
      console.error(`${label} ${details.space}@${details.host} > ${(details.argv as string[]).map(quote).join(" ")}  [stdin closed]`);
    } else if (entry.phase === "start" && entry.operation === "open") {
      console.error(`${label} open ${details.name}${details.on ? ` on ${details.on}` : ""}${details.forceArchiveInplace ? " (explicit home archive requested)" : ""}`);
    } else if (entry.phase === "start" && entry.operation === "transport") {
      console.error(`${label} connect reusable executor: SSH → Docker → Deno (${details.space}@${details.host})`);
    } else if ((entry.phase === "stdout" || entry.phase === "stderr") && entry.operation === "exec") {
      console.error(`${label} ${entry.phase}: ${entry.text?.replace(/\r?\n$/, "")}`);
    } else if (entry.phase === "stderr" && (entry.operation === "ssh" || entry.operation === "transport")) {
      for (const line of (entry.text ?? "").split(/\r?\n/)) {
        if (line.startsWith("[agspace stage]")) console.error(`${label} ${line.replace("[agspace stage] ", "")}`);
      }
    } else if (entry.phase === "end" && entry.operation === "environment") {
      const info = details.result as EnvironmentInfo;
      console.error(`${label} OS: ${info.os.name} ${info.os.version}; ${info.os.architecture}; kernel ${info.os.kernel}`);
      console.error(`${label} user: ${info.user.name} (uid=${info.user.uid}, gid=${info.user.gid}); container ${info.hostname}`);
      console.error(`${label} shell: ${info.shell.path} — ${info.shell.version}; ${info.tmuxVersion}`);
      console.error(`${label} cwd: ${info.cwd}; home: ${info.home}; tmp: ${info.tmpdir}`);
      console.error(`${label} terminal: ${info.term}; locale: ${info.locale || "unset"}`);
      console.error(`${label} volume: ${info.storage.hostPath} on ${info.host} → ${info.storage.containerPath}`);
      console.error(`${label} environment done (${entry.durationMs}ms; reused execution channel)`);
    } else if (entry.phase === "end" && entry.operation !== "ssh") {
      const result = details.result as { exitCode?: number } | null;
      console.error(`${label} ${entry.operation} ${entry.operation === "exec" ? `exit=${result?.exitCode}` : "done"} (${entry.durationMs}ms)`);
    }
  }

  #requireSuccess(result: ExecutionResult, operation: string): void {
    if (result.exitCode !== 0) {
      throw new Error(`${operation} failed (${result.exitCode}).\n${result.stderr}\n${result.stdout}`);
    }
  }
}

const ENVIRONMENT_SOURCE = String.raw`
async function text(program, args) {
  const result = await new Deno.Command(program, {args, stdout:"piped", stderr:"piped"}).output();
  const decoder = new TextDecoder();
  if (!result.success) throw new Error(decoder.decode(result.stderr));
  return (decoder.decode(result.stdout) + decoder.decode(result.stderr)).trim();
}
const release = {};
for (const line of (await Deno.readTextFile("/etc/os-release")).split("\n")) {
  const equal = line.indexOf("=");
  if (equal > 0) release[line.slice(0,equal)] = line.slice(equal+1).replace(/^"|"$/g, "");
}
const uid = Deno.uid();
const gid = Deno.gid();
const account = (await Deno.readTextFile("/etc/passwd")).split("\n")
  .map(line => line.split(":" )).find(fields => Number(fields[2]) === uid);
const pid = await text("tmux", ["display-message", "-p", "-t", Deno.args[0], "#{pane_pid}"]);
const shellPath = await Deno.readLink("/proc/" + pid + "/exe");
console.log(JSON.stringify({
  hostname:Deno.hostname(),
  os:{name:release.NAME,version:release.VERSION_ID,kernel:Deno.osRelease(),architecture:Deno.build.arch},
  user:{name:account?.[0] ?? String(uid),uid,gid},
  cwd:Deno.cwd(), home:Deno.env.get("HOME") ?? "", tmpdir:Deno.env.get("TMPDIR") ?? "/tmp",
  shell:{path:shellPath,version:(await text(shellPath,["--version"])).split("\n")[0]},
  tmuxVersion:await text("tmux",["-V"]),
  term:Deno.env.get("TERM") ?? "", locale:Deno.env.get("LC_ALL") || Deno.env.get("LANG") || ""
}));
`;

/** Private execution transport: one SSH channel, many argv-based requests. */
const EXECUTOR_SOURCE = String.raw`
const emit = (value) => console.log(JSON.stringify(value));
emit({type: "ready"});
let input = "";
const decoder = new TextDecoder();
async function execute(argv) {
  try {
    const child = new Deno.Command(argv[0], {
      args: argv.slice(1), stdin: "null", stdout: "piped", stderr: "piped",
    }).spawn();
    const forward = async (stream, type) => {
      const decoder = new TextDecoder();
      for await (const chunk of stream) {
        const text = decoder.decode(chunk, {stream: true});
        if (text) emit({type, text});
      }
      const text = decoder.decode();
      if (text) emit({type, text});
    };
    const [status] = await Promise.all([
      child.status, forward(child.stdout, "stdout"), forward(child.stderr, "stderr"),
    ]);
    emit({type: "exit", exitCode: status.code});
  } catch (error) {
    emit({type: "stderr", text: String(error) + "\n"});
    emit({type: "exit", exitCode: 127});
  }
}
for await (const chunk of Deno.stdin.readable) {
  input += decoder.decode(chunk, {stream: true});
  let newline;
  while ((newline = input.indexOf("\n")) >= 0) {
    const line = input.slice(0, newline);
    input = input.slice(newline + 1);
    if (line) await execute(JSON.parse(line).argv);
  }
}
`;

// The script is length-framed on stdin to avoid shell/Windows command-line limits.
// The same stdin then carries execution requests; the bootstrap file is removed on exit.
const BOOTSTRAP = `exec /bin/sh -c ${quote(String.raw`
set -eu
umask 077
IFS= read -r size
case "$size" in ''|*[!0-9]*) exit 2;; esac
script=$(mktemp /tmp/agspace-bootstrap.XXXXXX)
trap 'rm -f "$script"' EXIT
dd bs=1 count="$size" of="$script" 2>/dev/null
/bin/sh "$script"
`)}`;

interface Frame {
  type: "space" | "ready" | "stdout" | "stderr" | "exit";
  text?: string;
  exitCode?: number;
}

class SshExecutor {
  state!: RemoteState;
  readonly #child: Deno.ChildProcess;
  readonly #writer: WritableStreamDefaultWriter<Uint8Array>;
  readonly #reader: ReadableStreamDefaultReader<string>;
  readonly #diagnostics: Promise<void>;
  #stderr = "";
  #buffer = "";
  #queue: Promise<void> = Promise.resolve();
  #closed = false;

  private constructor(args: string[], log: (text: string) => void) {
    this.#child = new Deno.Command("ssh", {
      args, stdin: "piped", stdout: "piped", stderr: "piped",
    }).spawn();
    this.#writer = this.#child.stdin.getWriter();
    this.#reader = this.#child.stdout.pipeThrough(new TextDecoderStream()).getReader();
    const diagnostics = this.#child.stderr.pipeThrough(new TextDecoderStream());
    this.#diagnostics = (async () => {
      for await (const text of diagnostics) {
        this.#stderr += text;
        log(text);
      }
    })();
  }

  static async connect(args: string[], script: string, log: (text: string) => void): Promise<SshExecutor> {
    const executor = new SshExecutor(args, log);
    try {
      const bytes = new TextEncoder().encode(script);
      await executor.#writer.write(new TextEncoder().encode(`${bytes.length}\n`));
      await executor.#writer.write(bytes);
      const state = await executor.#next();
      if (state.type !== "space") throw new Error("Missing space description during open.");
      executor.state = state as unknown as RemoteState;
      if ((await executor.#next()).type !== "ready") throw new Error("Executor did not become ready.");
      return executor;
    } catch (error) {
      await executor.close();
      throw error;
    }
  }

  exec(argv: string[], output: (stream: "stdout" | "stderr", text: string) => void) {
    const result = this.#queue.then(async () => {
      if (this.#closed) throw new Error("Execution channel is closed.");
      await this.#writer.write(new TextEncoder().encode(JSON.stringify({ argv }) + "\n"));
      let stdout = "";
      let stderr = "";
      while (true) {
        const frame = await this.#next();
        if (frame.type === "exit") {
          if (frame.exitCode === undefined) throw new Error("Missing process exit code.");
          return { exitCode: frame.exitCode, stdout, stderr };
        }
        if (frame.type === "stdout" || frame.type === "stderr") {
          const text = frame.text ?? "";
          if (frame.type === "stdout") stdout += text;
          else stderr += text;
          output(frame.type, text);
        }
      }
    });
    this.#queue = result.then(() => {}, () => {});
    return result;
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    await this.#queue;
    this.#closed = true;
    try {
      await this.#writer.close();
    } catch {
      // The remote process may already have closed the channel.
    }
    await this.#child.status;
    await this.#diagnostics;
    await this.#reader.cancel();
    this.#writer.releaseLock();
    this.#reader.releaseLock();
  }

  async #next(): Promise<Frame> {
    while (true) {
      const newline = this.#buffer.indexOf("\n");
      if (newline >= 0) {
        const line = this.#buffer.slice(0, newline);
        this.#buffer = this.#buffer.slice(newline + 1);
        if (line) return JSON.parse(line) as Frame;
      } else {
        const { value, done } = await this.#reader.read();
        if (done) {
          await this.#diagnostics;
          throw new Error(`SSH execution channel closed. ${this.#stderr}`);
        }
        this.#buffer += value;
      }
    }
  }
}
