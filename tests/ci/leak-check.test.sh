#!/bin/sh
# Local test of scripts/ci/leak-check.sh with made-up patterns (no real data).
# Run from the repository root:  sh tests/ci/leak-check.test.sh
set -u
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SCRIPT="$ROOT/scripts/ci/leak-check.sh"
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
pass=0; failn=0

check() { # name expected_exit actual_exit
  if [ "$2" = "$3" ]; then pass=$((pass + 1)); echo "ok   - $1"; else failn=$((failn + 1)); echo "FAIL - $1 (expected exit $2, got $3)"; fi
}
expect_out() { # name file needle
  if grep -q -- "$3" "$2"; then pass=$((pass + 1)); echo "ok   - $1"; else failn=$((failn + 1)); echo "FAIL - $1"; sed 's/^/       /' "$2"; fi
}
expect_no_out() { # name file needle
  if grep -q -- "$3" "$2"; then failn=$((failn + 1)); echo "FAIL - $1"; sed 's/^/       /' "$2"; else pass=$((pass + 1)); echo "ok   - $1"; fi
}

cd "$T"
git init -q repo && cd repo
git config user.email t@example.com && git config user.name t
printf 'clean line\nanother line\n' > clean.txt
printf 'hello\nconnect to build01.corp-secret.example now\n' > leak.txt
printf 'allowed: 203.0.113.7 in an SSRF check\n' > ssrf.ts
git add . && git commit -q -m "first"
printf '# test patterns\n\ncorp-secret\\.example\n203\\.0\\.113\\.\n' > "$T/patterns"

# 1. tracked file with a forbidden pattern -> fails, prints only file:line
LEAK_PATTERNS="$T/patterns" CI_COMMIT_SHA=HEAD sh "$SCRIPT" > "$T/out" 2>&1; rc=$?
check "forbidden pattern in a tracked file fails" 1 $rc
expect_out "reports file:line" "$T/out" "leak.txt:2"
expect_out "reports the not-allowlisted ssrf line" "$T/out" "ssrf.ts:1"
expect_no_out "never prints the matched value" "$T/out" "corp-secret"
expect_no_out "never prints the IP" "$T/out" "203.0.113"

# 2. allowlisted lines pass
printf 'leak.txt:2\nssrf.ts:1-1\n' > .leakcheck-allow
LEAK_PATTERNS="$T/patterns" CI_COMMIT_SHA=HEAD sh "$SCRIPT" > "$T/out" 2>&1; rc=$?
check "allowlisted lines pass" 0 $rc
expect_out "prints OK summary" "$T/out" "leak-check: OK (2 allowlisted"

# 3. allowlist entry for a different line does not hide a new hit
printf 'leak.txt:1\nssrf.ts:1\n' > .leakcheck-allow
LEAK_PATTERNS="$T/patterns" CI_COMMIT_SHA=HEAD sh "$SCRIPT" > "$T/out" 2>&1; rc=$?
check "allowlist is per line" 1 $rc
expect_out "still reports leak.txt:2" "$T/out" "leak.txt:2"

# 4. invalid allowlist line fails
printf 'leak.txt:two\n' > .leakcheck-allow
LEAK_PATTERNS="$T/patterns" sh "$SCRIPT" > "$T/out" 2>&1; rc=$?
check "invalid allowlist line fails" 1 $rc
printf 'leak.txt:2\nssrf.ts:1\n' > .leakcheck-allow

# 5. missing / empty / non-file / invalid pattern variable -> fail-closed
env -u LEAK_PATTERNS sh "$SCRIPT" > "$T/out" 2>&1; rc=$?
check "missing LEAK_PATTERNS fails" 1 $rc
expect_out "explains missing variable" "$T/out" "LEAK_PATTERNS is not set"
LEAK_PATTERNS="corp-secret\\.example" sh "$SCRIPT" > "$T/out" 2>&1; rc=$?
check "variable that is not a file (Variable type) fails" 1 $rc
expect_no_out "does not echo a non-file value" "$T/out" "corp-secret"
printf '# only comments\n\n' > "$T/empty"
LEAK_PATTERNS="$T/empty" sh "$SCRIPT" > "$T/out" 2>&1; rc=$?
check "pattern file without patterns fails" 1 $rc
printf 'unbalanced(corp-secret\n' > "$T/bad"
LEAK_PATTERNS="$T/bad" sh "$SCRIPT" > "$T/out" 2>&1; rc=$?
check "invalid regex fails" 1 $rc
expect_no_out "does not echo the invalid pattern" "$T/out" "unbalanced"

# 6. commit messages of the pushed range
before=$(git rev-parse HEAD)
printf 'x\n' > more.txt && git add more.txt && git commit -q -m "deploy to build01.corp-secret.example"
printf 'y\n' >> more.txt && git commit -qam "harmless"
LEAK_PATTERNS="$T/patterns" CI_COMMIT_BEFORE_SHA="$before" CI_COMMIT_SHA=HEAD sh "$SCRIPT" > "$T/out" 2>&1; rc=$?
check "forbidden pattern in a pushed commit message fails" 1 $rc
expect_out "names the commit" "$T/out" "commit message of $(git rev-parse --short HEAD~1)"
expect_no_out "does not print the message" "$T/out" "corp-secret"
LEAK_PATTERNS="$T/patterns" CI_COMMIT_BEFORE_SHA="$(git rev-parse HEAD~1)" CI_COMMIT_SHA=HEAD sh "$SCRIPT" > "$T/out" 2>&1; rc=$?
check "older commits outside the range are not re-checked" 0 $rc
LEAK_PATTERNS="$T/patterns" CI_COMMIT_BEFORE_SHA=0000000000000000000000000000000000000000 CI_COMMIT_SHA=HEAD sh "$SCRIPT" > "$T/out" 2>&1; rc=$?
check "unknown range checks the tip commit only" 0 $rc

# 7. case-insensitive
printf 'CORP-SECRET.EXAMPLE\n' > upper.txt && git add upper.txt && git commit -qm upper
LEAK_PATTERNS="$T/patterns" CI_COMMIT_SHA=HEAD sh "$SCRIPT" > "$T/out" 2>&1; rc=$?
check "matching is case-insensitive" 1 $rc
expect_out "reports upper.txt:1" "$T/out" "upper.txt:1"

echo "passed: $pass, failed: $failn"
[ $failn -eq 0 ]
