#!/usr/bin/env bash
# Audit an existing repository against the conventions it is subject to.
#
# Only checks that hold for every repository regardless of its stack live here.
# Whether a recipe body actually does what its name promises depends on the
# project, and is left to the agent reading the skill.
#
# The owning skill's templates are the SSoT for anything compared by content.

set -euo pipefail

SKILL_ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.." && pwd)"
TEMPLATES="${SKILL_ROOT}/templates"
AGENT_GUIDE="${SKILL_ROOT}/references/audit.md"

# Policy. These are the SSoT for what the audit demands.
#
# FAIL is for things the conventions state unconditionally. WARN is for things
# a repository may legitimately lack — a single-app repository has no docs/adr
# yet, a private mirror needs no LICENSE.
HOOKS_PATH=".githooks"
REQUIRED_HOOKS=(commit-msg pre-commit pre-push)
PINNED_HOOKS=(commit-msg)
# Recipes pre-commit must invoke. A repository-wide invariant belongs to no app,
# so no path filter selects it and it reaches remote CI unnoticed.
PRE_COMMIT_RECIPES=(repo-checks)
REQUIRED_RECIPES=(setup clean ci-local repo-checks _check-hooks-configured)
REQUIRED_FILES=(justfile AGENTS.md .gitignore)
OPTIONAL_FILES=(README.md CONTRIBUTING.md LICENSE)
OPTIONAL_DIRS=(docs/adr docs/spec)
WORKFLOW_DIR=".github/workflows"
# Toolchain versions have exactly one home. Anything else that names a version
# is a second authority for the same fact.
VERSION_FILES=(mise.toml .mise.toml .tool-versions)

usage() {
  printf 'Usage: audit.sh [--repo <path>] [--verbose]\n' >&2
  exit 2
}

REPO=""
VERBOSE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      [[ $# -ge 2 ]] || usage
      REPO="$2"
      shift 2 ;;
    --verbose)
      VERBOSE=1
      shift ;;
    *) usage ;;
  esac
done

[[ -n "$REPO" ]] || REPO="$(pwd)"
REPO="$(git -C "$REPO" rev-parse --show-toplevel 2>/dev/null)" || {
  echo "audit: not a git repository: ${REPO}" >&2
  exit 1
}
[[ -d "$TEMPLATES" ]] || { echo "audit: missing templates: $TEMPLATES" >&2; exit 1; }

fail_count=0
warn_count=0

report() {
  local level="$1"
  local check="$2"
  local detail="$3"
  case "$level" in
    FAIL) fail_count=$((fail_count + 1)) ;;
    WARN) warn_count=$((warn_count + 1)) ;;
    PASS) [[ "$VERBOSE" -eq 1 ]] || return 0 ;;
  esac
  printf '%s\t%s\t%s\n' "$level" "$check" "$detail"
}

# Hooks are configured and present.
#
# A repository can carry a complete .githooks directory and still run none of
# it: core.hooksPath is per-clone local config and is never carried by a clone.
configured="$(git -C "$REPO" config --get core.hooksPath || true)"
if [[ "$configured" == "$HOOKS_PATH" ]]; then
  report PASS hooks-configured "core.hooksPath = ${HOOKS_PATH}"
else
  report FAIL hooks-configured "core.hooksPath is '${configured:-unset}' — run: git config core.hooksPath ${HOOKS_PATH}"
fi

for hook in "${REQUIRED_HOOKS[@]}"; do
  path="${REPO}/${HOOKS_PATH}/${hook}"
  if [[ ! -f "$path" ]]; then
    report FAIL "hook-${hook}" "missing ${HOOKS_PATH}/${hook}"
  elif [[ ! -x "$path" ]]; then
    report FAIL "hook-${hook}" "${HOOKS_PATH}/${hook} is not executable"
  else
    report PASS "hook-${hook}" "present and executable"
  fi
done

# Pinned hooks enforce a convention that does not vary by repository, so a
# local edit is drift rather than adaptation.
for hook in "${PINNED_HOOKS[@]}"; do
  path="${REPO}/${HOOKS_PATH}/${hook}"
  [[ -f "$path" ]] || continue
  if cmp -s "$path" "${TEMPLATES}/${HOOKS_PATH}/${hook}"; then
    report PASS "hook-${hook}-pinned" "matches the template"
  else
    report FAIL "hook-${hook}-pinned" "diverges from the template — hooks enforcing a fixed convention must not be edited per repository; overwrite from ${TEMPLATES}/${HOOKS_PATH}/${hook}"
  fi
done

# Repository-wide invariants are checked at commit time, not only by CI.
pre_commit="${REPO}/${HOOKS_PATH}/pre-commit"
for recipe in "${PRE_COMMIT_RECIPES[@]}"; do
  if [[ ! -f "$pre_commit" ]]; then
    continue
  elif grep -qE "just[[:space:]]+${recipe}\b" "$pre_commit"; then
    report PASS "pre-commit-calls-${recipe}" "invoked from ${HOOKS_PATH}/pre-commit"
  else
    report FAIL "pre-commit-calls-${recipe}" "${HOOKS_PATH}/pre-commit does not run 'just ${recipe}' — the check then fires only after a push"
  fi
done

# Required files.
for file in "${REQUIRED_FILES[@]}"; do
  if [[ -f "${REPO}/${file}" ]]; then
    report PASS "file-${file}" "present"
  else
    report FAIL "file-${file}" "missing"
  fi
done

for file in "${OPTIONAL_FILES[@]}"; do
  if [[ -f "${REPO}/${file}" ]]; then
    report PASS "file-${file}" "present"
  else
    report WARN "file-${file}" "missing — justified only if the repository has no use for it"
  fi
done

for dir in "${OPTIONAL_DIRS[@]}"; do
  if [[ -d "${REPO}/${dir}" ]]; then
    report PASS "dir-${dir}" "present"
  else
    report WARN "dir-${dir}" "missing — design decisions have nowhere to be recorded"
  fi
done

# Recipes required by the conventions exist.
#
# The justfile is read as text rather than through `just --summary`, because
# private recipes are hidden from it and just may not be installed on the host
# being audited.
if [[ -f "${REPO}/justfile" ]]; then
  for recipe in "${REQUIRED_RECIPES[@]}"; do
    if grep -qE "^${recipe}( [^:]*)?:" "${REPO}/justfile"; then
      report PASS "recipe-${recipe}" "defined"
    else
      report FAIL "recipe-${recipe}" "not defined in justfile"
    fi
  done

  # Placeholders left by the template mean the repository was never wired up.
  if grep -q 'TODO: implement' "${REPO}/justfile"; then
    unimplemented="$(grep -c 'TODO: implement' "${REPO}/justfile")"
    report FAIL recipe-placeholders "${unimplemented} recipe(s) still hold the template placeholder"
  else
    report PASS recipe-placeholders "none"
  fi

  # A single `wait` returns 0 no matter which background job failed, so the
  # gate stays green while an app's CI is broken.
  if grep -qE '^\s*(just .+ &\s*)+wait\s*$' "${REPO}/justfile"; then
    report FAIL ci-local-wait "parallel jobs are awaited with a bare 'wait' — its status is always 0; collect PIDs and wait on each"
  else
    report PASS ci-local-wait "no bare 'wait' over background jobs"
  fi

  # `set shell := [...]` does not reach a shebang recipe: just writes the body
  # to a temp file and reads only its final exit status, so a failing command
  # mid-body is silently passed over. Every bash shebang recipe must therefore
  # set errexit itself. `set -u` alone reads as if it did and does not.
  noexit="$(awk '
    function flush() {
      if (in_body && is_bash && !has_errexit) print name
      in_body = 0; is_bash = 0; has_errexit = 0
    }
    /^[[:space:]]*$/ { next }
    /^[^[:space:]]/ {
      flush()
      if (match($0, /^[A-Za-z_][A-Za-z0-9_-]*([[:space:]][^:]*)?:/)) {
        name = $0
        sub(/[[:space:]:].*$/, "", name)
        pending = name
      }
      next
    }
    {
      if (!in_body) {
        if ($0 ~ /^[[:space:]]+#!.*(bash|sh)[[:space:]]*$/) { in_body = 1; is_bash = 1; name = pending }
        else next
      } else if ($0 ~ /^[[:space:]]*set[[:space:]]+(-[a-zA-Z]*e|-o[[:space:]]+errexit)/) {
        has_errexit = 1
      }
    }
    END { flush() }
  ' "${REPO}/justfile" | sort -u | paste -sd, -)"
  if [[ -n "$noexit" ]]; then
    report FAIL recipe-shebang-errexit "shebang recipe(s) without errexit — 'set shell' does not apply to them, so a failing command mid-body is passed over: ${noexit}"
  else
    report PASS recipe-shebang-errexit "every shebang recipe sets errexit itself"
  fi

  # Every listed recipe carries a description that stands on its own.
  #
  # `just --list` takes only the LAST line of the comment block above a recipe,
  # so a multi-line comment is listed as a sentence fragment. The listing is the
  # only surface an agent discovers commands through, which makes this a defect
  # in the interface rather than a style preference. [doc] names the one-line
  # description explicitly and leaves the comment free to hold the rationale.
  fragments="$(awk '
    /:=/ { next }
    /^#/ { comments++; next }
    /^\[/ {
      if ($0 ~ /^\[doc\(/) has_doc = 1
      if ($0 ~ /^\[private\]/) is_private = 1
      next
    }
    /^[A-Za-z_@]/ {
      if (match($0, /^[A-Za-z_][A-Za-z0-9_-]*([[:space:]][^:]*)?:/) && comments > 1 && !has_doc && !is_private) {
        name = $0
        sub(/[[:space:]:].*$/, "", name)
        print name
      }
      comments = 0; has_doc = 0; is_private = 0; next
    }
    { comments = 0; has_doc = 0; is_private = 0 }
  ' "${REPO}/justfile" | sort -u | paste -sd, -)"
  if [[ -n "$fragments" ]]; then
    report FAIL recipe-doc "recipe(s) whose 'just --list' description is a sentence fragment — add [doc('...')]: ${fragments}"
  else
    report PASS recipe-doc "every listed recipe has a self-contained description"
  fi
else
  report FAIL recipes "no justfile to inspect"
fi

# Toolchain versions are declared once, in the version-manager file.
version_file=""
for candidate in "${VERSION_FILES[@]}"; do
  if [[ -f "${REPO}/${candidate}" ]]; then
    version_file="$candidate"
    break
  fi
done
if [[ -n "$version_file" ]]; then
  report PASS tool-versions "${version_file} declares the toolchain"
else
  report WARN tool-versions "no ${VERSION_FILES[0]} — nothing pins the toolchain for the developer, so CI is the only place a version exists"
fi

# Remote CI exists at all.
if compgen -G "${REPO}/${WORKFLOW_DIR}/*.y*ml" > /dev/null; then
  report PASS remote-ci "$(compgen -G "${REPO}/${WORKFLOW_DIR}/*.y*ml" | wc -l) workflow(s)"

  # Workflow contents.
  #
  # Read as text rather than parsed: the checks below are all line-shaped, and
  # a YAML parser is not guaranteed to be present on the host being audited.
  # Nothing here names a language or a runtime, so the same checks hold for
  # every stack.
  for workflow in "${REPO}/${WORKFLOW_DIR}"/*.y*ml; do
    name="$(basename "$workflow")"

    # The workflow names no toolchain version.
    #
    # The version-manager file is the single declaration and CI reads it. A
    # version written here is a second authority for the same fact: a rule can
    # force the two to agree, but it cannot remove the place where they can
    # disagree. Enforcing agreement is what let a CI-only pin survive unnoticed.
    declared="$(grep -E "^[[:space:]]*([A-Z][A-Z0-9_]*_VERSION|[a-z][a-z0-9_-]*[-_]version):[[:space:]]*[^[:space:]]" "$workflow" \
                | sed 's/^[[:space:]]*//' | sort -u | paste -sd, - || true)"
    if [[ -n "$declared" ]]; then
      report FAIL "ci-tool-version-${name}" "toolchain version(s) declared in the workflow: ${declared} — declare them in ${VERSION_FILES[0]} and read that file from CI"
    else
      report PASS "ci-tool-version-${name}" "no toolchain version declared in the workflow"
    fi

    # No second installer stands beside the version manager.
    #
    # A setup action fetches the tool by its own route, so the version it
    # installs is not the one the version-manager file names.
    if [[ -n "$version_file" ]]; then
      setups="$(grep -oE "uses:[[:space:]]*[^[:space:]]+/setup-[^@[:space:]]+" "$workflow" \
                | sed 's/uses:[[:space:]]*//' | sort -u | paste -sd, - || true)"
      if [[ -n "$setups" ]]; then
        report FAIL "ci-installer-${name}" "setup action(s) install toolchains beside ${version_file}: ${setups} — install from ${version_file} instead"
      else
        report PASS "ci-installer-${name}" "toolchains come from ${version_file}"
      fi
    fi

    # Action references are pinned to a tag.
    mutable="$(grep -oE "uses:[[:space:]]*[^[:space:]]+@(main|master)\b" "$workflow" | sed 's/uses:[[:space:]]*//' | sort -u | paste -sd, - || true)"
    if [[ -n "$mutable" ]]; then
      report FAIL "ci-action-ref-${name}" "action(s) referenced by a moving branch: ${mutable}"
    else
      report PASS "ci-action-ref-${name}" "actions referenced by tag"
    fi

    # Every job bounds its runtime.
    #
    # Without it a hung job holds a runner until the account-wide limit, and
    # the failure surfaces as a queue stall rather than as a red job.
    jobs_count="$(awk '/^jobs:[[:space:]]*$/ { in_jobs = 1; next } in_jobs && /^[A-Za-z]/ { in_jobs = 0 } in_jobs && /^  [A-Za-z0-9_-]+:[[:space:]]*$/ { n++ } END { print n + 0 }' "$workflow")"
    timeouts="$(grep -cE "^[[:space:]]+timeout-minutes:" "$workflow" || true)"
    if [[ "$jobs_count" -eq 0 ]]; then
      report WARN "ci-timeout-${name}" "no job could be identified — check the workflow by hand"
    elif [[ "$timeouts" -lt "$jobs_count" ]]; then
      report FAIL "ci-timeout-${name}" "${timeouts} of ${jobs_count} job(s) declare timeout-minutes"
    else
      report PASS "ci-timeout-${name}" "${jobs_count} job(s), all bounded"
    fi

    # Duplicate runs of the same ref are cancelled.
    if grep -qE "^concurrency:" "$workflow"; then
      report PASS "ci-concurrency-${name}" "declared"
    else
      report WARN "ci-concurrency-${name}" "no concurrency block — pushes to the same ref run on top of each other"
    fi

    # Checks are invoked through the justfile.
    #
    # A command written straight into a step exists in two places at once, and
    # the copy in the justfile is the one that stops being updated.
    raw="$(grep -E "^[[:space:]]*-?[[:space:]]*run:" "$workflow" | grep -cvE "run:[[:space:]]*just[[:space:]]" || true)"
    if [[ "$raw" -gt 0 ]]; then
      report WARN "ci-run-via-just-${name}" "${raw} run step(s) do not call a just recipe — the check then lives in both the workflow and the justfile"
    else
      report PASS "ci-run-via-just-${name}" "run steps call just recipes"
    fi

    # Placeholders left by the template mean the workflow was never finished.
    if grep -q "TODO:" "$workflow"; then
      report WARN "ci-placeholders-${name}" "template TODO left in place — per-app jobs were never added"
    else
      report PASS "ci-placeholders-${name}" "none"
    fi
  done
else
  report FAIL remote-ci "no workflow under ${WORKFLOW_DIR}"
fi

printf '\n%d FAIL, %d WARN\n' "$fail_count" "$warn_count"
printf '\nAGENT AUDIT REQUIRED\n'
printf 'Target: %s\n' "$REPO"
printf 'Guide: %s\n' "$AGENT_GUIDE"
printf 'Instruction: Read the guide, perform every current check, and combine the findings with the machine audit.\n'

[[ "$fail_count" -eq 0 ]]
