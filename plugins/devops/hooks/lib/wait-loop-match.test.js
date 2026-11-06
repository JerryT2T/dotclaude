import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { findWaitLoops, hasBypass } = require("./wait-loop-match.js");

const kinds = (cmd) => findWaitLoops(cmd).map((f) => f.kind);

describe("real loops from the 2026-11-05 incident", () => {
  test.each([
    ['until pgrep -f "x" >/dev/null 2>&1 && false; do :; done', "busy"],
    ['until grep -aqE "Executed [0-9]+ of" /tmp/k2.out 2>/dev/null; do sleep 5; done', "unbounded"],
    [`while ! sed 's/x//' /tmp/b.log | grep -aq "done"; do sleep 5; done`, "unbounded"],
  ])("%s", (cmd, kind) => {
    expect(kinds(cmd)).toEqual([kind]);
  });
});

describe("blocked", () => {
  test.each([
    ["sleep in the body", "while [ ! -f /tmp/x ]; do sleep 1; done", "unbounded"],
    ["multi-line", "until curl -s localhost:3000\ndo\n  echo waiting\n  sleep 2\ndone", "unbounded"],
    ["while true with a break", "while true; do if grep -q ok log; then break; fi; sleep 5; done", "unbounded"],
    ["while : with no sleep and work", "while :; do ./step || break; done", "unbounded"],
    ["until false", "until false; do ./step; done", "unbounded"],
    ["sleep in the condition", "while sleep 5; do grep -q ok log && break; done", "unbounded"],
    ["unquoted done as a grep argument", "until grep -q done log; do sleep 1; done", "unbounded"],
    ["after other commands", "cd /tmp && npm start & until curl -s x; do sleep 1; done; echo up", "unbounded"],
    ["inside a substitution", "out=$(until curl -s x; do sleep 1; done)", "unbounded"],
    ["inside a for loop", "for h in a b; do until ping -c1 $h; do sleep 1; done; done", "unbounded"],
    ["timeout bounds one attempt only", "until timeout 5 curl -s x; do sleep 1; done", "unbounded"],
    ["clock read but never compared", 'until grep -q ok log; do echo "$SECONDS"; sleep 5; done', "unbounded"],
    ["comparison with no way out", "until grep -q ok log; do [ $SECONDS -gt 60 ] && echo slow; sleep 5; done", "unbounded"],
    ["counter that never moves", "while [ $i -lt 10 ]; do sleep 1; done", "unbounded"],
    ["bash -c", `bash -c 'until grep -q ok log; do sleep 5; done'`, "unbounded"],
    ["nohup sh -c, double quotes", `nohup sh -c "while ! test -f x; do sleep 5; done" &`, "unbounded"],
    ["eval", `eval "until grep -q ok log; do sleep 5; done"`, "unbounded"],
    ["heredoc fed to bash", "bash <<'EOF'\nuntil grep -q ok log; do sleep 5; done\nEOF", "unbounded"],
    ["line continuation", "until grep -q ok log; \\\ndo sleep 5; done", "unbounded"],
    ["read in a nested loop does not excuse the outer one", "while true; do cat f | while read l; do echo $l; done; sleep 5; done", "unbounded"],
    ["a timed read in the body", "while true; do read -t 0.1 x || :; sleep 5; done", "unbounded"],
    ["a counter behind a check may never move", 'i=0; while [ "$i" -lt 10 ]; do grep -q ok log && ((i++)); sleep 1; done', "unbounded"],
    ["echo only, no sleep","while ! grep -q ok log; do echo .; done", "busy"],
    ["empty probe body", "while pgrep x; do true; done", "busy"],
    ["read-only probe in the body", "until test -f x; do ls /tmp; done", "busy"],
    ["spin under a deadline", "until test -f x || [ $SECONDS -gt 60 ]; do :; done", "busy"],
    ["spin under a timeout wrapper", `timeout 60 bash -c 'until test -f x; do :; done'`, "busy"],
  ])("%s", (_name, cmd, kind) => {
    expect(kinds(cmd)).toEqual([kind]);
  });
});

describe("allowed: bounded", () => {
  test.each([
    ["timeout wrapper", `timeout 300 bash -c 'until grep -q ok log; do sleep 5; done'`],
    ["timeout wrapper with a kill option", `timeout -k 5 300 sh -c "while ! test -f x; do sleep 5; done"`],
    ["timeout on a heredoc shell", "timeout 60 bash <<'EOF'\nuntil grep -q ok log; do sleep 5; done\nEOF"],
    ["$SECONDS in the condition", "SECONDS=0; until grep -q ok log || [ $SECONDS -ge 300 ]; do sleep 5; done"],
    ["$SECONDS with a break", "SECONDS=0; until grep -q ok log; do (( SECONDS > 300 )) && break; sleep 5; done"],
    ["$SECONDS with exit", "while ! test -f x; do if [ $SECONDS -gt 60 ]; then exit 1; fi; sleep 1; done"],
    ["date +%s", 'end=$(( $(date +%s) + 60 )); while [ "$(date +%s)" -lt "$end" ]; do sleep 5; done'],
    ["date +%s through a variable", "until test -f x; do now=$(date +%s); [ $now -ge $end ] && break; sleep 5; done"],
    ["named deadline", 'until test -f x || [ "$now" -gt "$deadline" ]; do sleep 5; done'],
    ["counter in the condition", "i=0; while [ $i -lt 30 ]; do sleep 1; i=$((i+1)); done"],
    ["quoted counter", 'n=30; while [ "$n" -gt 0 ]; do curl x && break; sleep 1; n=$((n-1)); done'],
    ["counter with a break", "n=0; until grep -q ok log; do n=$((n+1)); [ $n -ge 30 ] && break; sleep 5; done"],
    ["counter with ((++))", "while (( i < 10 )); do sleep 1; ((i++)); done"],
    ["counter with expr", "while [ $i -lt 3 ]; do sleep 1; i=$(expr $i + 1); done"],
    ["counter behind sleep &&", "while [ $i -lt 3 ]; do sleep 1 && i=$((i+1)); done"],
    ["counter in an if with a break", "while true; do if curl x; then break; else n=$((n+1)); fi; [ $n -ge 5 ] && break; sleep 1; done"],
    ["a timed read in the condition", "while read -t 5 -r l; do echo $l; done < fifo"],
    ["counter with let","while [ $i -lt 3 ]; do sleep 1; let i++; done"],
    ["counter inside (( )) with a no-op body", "while (( i++ < 10 )); do :; done"],
  ])("%s", (_name, cmd) => {
    expect(findWaitLoops(cmd)).toEqual([]);
  });
});

describe("allowed: input-driven and ordinary loops", () => {
  test.each([
    ["while read from a file", "while read -r line; do echo $line; done < list.txt"],
    ["while read from a pipe", 'git ls-files | while IFS= read -r f; do wc -l "$f"; done'],
    ["IFS with a quoted value", `while IFS=',' read -r a b; do echo $a; done < x.csv`],
    ["read with a sleep", "while read -r h; do curl $h; sleep 1; done < hosts"],
    ["read that drains", "while read -r _; do :; done < f"],
    ["read or last line", 'while read -r l || [ -n "$l" ]; do echo "$l"; done < f'],
    ["read in the body", "while true; do read -r l || break; echo $l; done < f"],
    ["argument parsing", 'while [ $# -gt 0 ]; do case "$1" in -x) X=1;; esac; shift; done'],
    ["getopts", 'while getopts "ab" o; do echo $o; done'],
    ["shift on a positional", 'while [ -n "$1" ]; do echo "$1"; shift; done'],
    ["walking up a path", 'while [ "$d" != "/" ]; do d=$(dirname "$d"); done'],
    ["work with no sleep", 'while git rev-parse -q --verify "x$n"; do n=$((n+1)); done'],
    ["for loop", "for i in 1 2 3; do sleep 1; done"],
  ])("%s", (_name, cmd) => {
    expect(findWaitLoops(cmd)).toEqual([]);
  });
});

describe("allowed: not a loop at all", () => {
  test.each([
    ["commit message", `git commit -m "fix: while true; do sleep 5; done"`],
    ["single-quoted echo", `echo 'until x; do :; done'`],
    ["comment", "ls # while true; do sleep 5; done"],
    ["plain words", "echo while until do done"],
    ["grep pattern", "grep -rn while src/"],
    ["python -c", `python -c "while True: pass"`],
    ["node -e", `node -e "while(true){}"`],
    ["script written to a file", "cat > wait.sh <<'EOF'\nuntil grep -q ok log; do sleep 5; done\nEOF"],
    ["heredoc for python", "python <<'EOF'\nwhile True:\n  pass\nEOF"],
    ["a loop with no end", "until grep -q ok log; do sleep 5"],
  ])("%s", (_name, cmd) => {
    expect(findWaitLoops(cmd)).toEqual([]);
  });
});

test("reports every offending loop", () => {
  expect(kinds("until a; do sleep 1; done; while b; do :; done")).toEqual(["unbounded", "busy"]);
});

test("hasBypass", () => {
  expect(hasBypass("DEVOPS_ALLOW_UNBOUNDED_LOOP=1 until x; do sleep 1; done")).toBe(true);
  expect(hasBypass("until x; do sleep 1; done")).toBe(false);
});
