set -eu
id
test "$(id -u)" = 1000
test -w /home/agent/workspace
test ! -w /usr/local/bin
test ! -e /var/run/docker.sock
opencode --version
git --version
tmux -V
jbang --version
java -version
rustc --version
cargo --version
deno --version
deno eval 'console.log("Deno execution OK")'
work=$(mktemp -d /home/agent/workspace/.opencode-check.XXXXXX)
printf '%s\n' 'fn main() { println!("Rust compilation/execution OK"); }' > "$work/main.rs"
rustc "$work/main.rs" -o "$work/rust-check"
"$work/rust-check"
printf '%s\n' 'class Hello { public static void main(String[] args) { System.out.println("JBang compilation/execution OK"); } }' > "$work/Hello.java"
jbang "$work/Hello.java"
curl --fail --silent --show-error --max-time 30 --output /dev/null https://models.dev/api.json
tmux has-session -t opencode
tmux list-panes -t opencode -F '#{pane_current_command} | dead=#{pane_dead}'
tmux capture-pane -p -t opencode
