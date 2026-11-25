#!/bin/sh
# leak-check: fail if content that is mirrored to the public GitHub repository
# contains internal infrastructure data.
#
# - Patterns come from $LEAK_PATTERNS: the PATH of a file (GitLab "File" type,
#   protected CI variable), one extended regex (ERE) per line, matched
#   case-insensitively; blank lines and lines starting with # are ignored.
#   The pattern list must never live in the repository (it would leak itself).
#   Missing, empty or invalid -> the check FAILS (fail-closed).
# - Scanned: every tracked text file (git ls-files, including .gitlab-ci.yml:
#   the mirror removes it only from the tip commit, the history still carries
#   it) and the messages of the commits in $CI_COMMIT_BEFORE_SHA..$CI_COMMIT_SHA
#   (only the tip commit if the range is unknown).
# - Known, intentional matches are listed in $LEAK_ALLOWLIST
#   (default .leakcheck-allow): "path:LINE" or "path:FROM-TO", nothing else.
# - Output names only file:line or the commit; matched values are never printed.
#
# Limitations: binary files are skipped (git grep -I); file contents that were
# added and removed again inside the same push are not inspected.

set -u

fail() {
  echo "leak-check: $*" >&2
  exit 1
}

PATTERNS_FILE="${LEAK_PATTERNS:-}"
ALLOW_FILE="${LEAK_ALLOWLIST:-.leakcheck-allow}"

[ -n "$PATTERNS_FILE" ] || fail "LEAK_PATTERNS is not set (expected a protected File-type CI variable); refusing to approve the mirror"
[ -f "$PATTERNS_FILE" ] || fail "LEAK_PATTERNS does not point to a file (use the File variable type); refusing to approve the mirror"

work=$(mktemp -d) || fail "cannot create a temporary directory"
trap 'rm -rf "$work"' EXIT INT TERM

grep -vE '^[[:space:]]*(#|$)' "$PATTERNS_FILE" > "$work/patterns" 2>/dev/null
[ -s "$work/patterns" ] || fail "LEAK_PATTERNS contains no patterns; refusing to approve the mirror"

# Validate the patterns without ever echoing them (grep/git error messages
# would quote the offending pattern, so stderr is discarded).
grep -i -E -f "$work/patterns" /dev/null >/dev/null 2>&1
[ $? -le 1 ] || fail "LEAK_PATTERNS contains an invalid extended regex; refusing to approve the mirror"

# Allowlist -> "path<TAB>from<TAB>to"
: > "$work/allow"
if [ -f "$ALLOW_FILE" ]; then
  awk '
    /^[[:space:]]*(#|$)/ { next }
    {
      line = $0
      sub(/[[:space:]]+$/, "", line)
      n = split(line, parts, ":")
      if (n < 2) { bad = 1; next }
      range = parts[n]
      path = substr(line, 1, length(line) - length(range) - 1)
      if (range ~ /^[0-9]+$/) { from = range; to = range }
      else if (range ~ /^[0-9]+-[0-9]+$/) { split(range, r, "-"); from = r[1]; to = r[2] }
      else { bad = 1; next }
      print path "\t" from "\t" to
    }
    END { if (bad) exit 3 }
  ' "$ALLOW_FILE" > "$work/allow" || fail "$ALLOW_FILE has an invalid line (expected path:LINE or path:FROM-TO)"
fi

found=0

# 1. Tracked files
git grep -n -I -i -E -f "$work/patterns" -- . > "$work/raw" 2>/dev/null
rc=$?
[ $rc -le 1 ] || fail "git grep failed (exit $rc)"
# Keep only "path:line" (drop the matched content immediately)
sed -E 's/^([^:]*):([0-9]+):.*$/\1:\2/' "$work/raw" > "$work/hits"
rm -f "$work/raw"

awk -F'\t' '
  # FILENAME, not NR == FNR: with an empty allowlist the latter would treat
  # every hit as an allowlist entry (fail-open).
  FILENAME == ARGV[1] { n++; ap[n] = $1; af[n] = $2 + 0; at[n] = $3 + 0; next }
  {
    split($0, h, ":"); line = h[length(h)] + 0
    path = substr($0, 1, length($0) - length(h[length(h)]) - 1)
    ok = 0
    for (i = 1; i <= n; i++) if (ap[i] == path && line >= af[i] && line <= at[i]) { ok = 1; break }
    if (!ok) print $0
  }
' "$work/allow" "$work/hits" > "$work/violations"

if [ -s "$work/violations" ]; then
  found=1
  echo "leak-check: internal data pattern found in tracked files (file:line):" >&2
  sed 's/^/  /' "$work/violations" >&2
fi

# 2. Commit messages of this push
before="${CI_COMMIT_BEFORE_SHA:-}"
tip="${CI_COMMIT_SHA:-HEAD}"
if [ -n "$before" ] && [ "$before" != "0000000000000000000000000000000000000000" ] \
   && git cat-file -e "${before}^{commit}" 2>/dev/null; then
  git rev-list "${before}..${tip}" > "$work/commits" 2>/dev/null || fail "cannot list commits ${before}..${tip}"
else
  git rev-parse "$tip" > "$work/commits" 2>/dev/null || fail "cannot resolve $tip"
fi

while read -r commit; do
  if git log -1 --format=%B "$commit" | grep -q -i -E -f "$work/patterns" 2>/dev/null; then
    [ $found -eq 1 ] || echo "leak-check: internal data pattern found:" >&2
    found=1
    echo "  commit message of $(git rev-parse --short "$commit")" >&2
  fi
done < "$work/commits"

if [ $found -ne 0 ]; then
  echo "leak-check: FAILED - remove the data, or add an intentional file:line to $ALLOW_FILE" >&2
  exit 1
fi

echo "leak-check: OK ($(wc -l < "$work/hits" | tr -d ' ') allowlisted hit(s), $(wc -l < "$work/commits" | tr -d ' ') commit message(s) checked)"
