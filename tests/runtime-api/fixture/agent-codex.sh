#!/bin/sh
set -eu

final_file=""
schema_file=""
args_file="$PWD/codex-args.txt"
: >"$args_file"
for argument in "$@"; do
  printf '%s\n' "$argument" >>"$args_file"
done

while [ "$#" -gt 0 ]; do
  case "$1" in
    exec|--json|--ephemeral|--ignore-user-config|--skip-git-repo-check|-)
      shift
      ;;
    --output-last-message|--output-schema|--model|--sandbox|--disable|-c)
      option=$1
      [ "$#" -ge 2 ] || exit 90
      value=$2
      case "$option" in
        --output-last-message) final_file=$value ;;
        --output-schema) schema_file=$value ;;
      esac
      shift 2
      ;;
    *)
      printf 'unsupported fixture argument: %s\n' "$1" >&2
      exit 94
      ;;
  esac
done

scenario=""
IFS= read -r scenario || true
printf '%s\n' "$scenario" >"$PWD/codex-prompt.txt"
printf 'started\n' >"$PWD/codex-started.txt"

write_final() {
  [ -n "$final_file" ] || exit 91
  printf '%s' "$1" >"$final_file"
}

completed() {
  printf '%s\n' '{"type":"thread.started","thread_id":"fixture-thread"}'
  printf '%s\n' '{"type":"turn.started"}'
  printf '%s\n' '{"type":"turn.completed","usage":{"input_tokens":3,"output_tokens":1}}'
}

case "$scenario" in
  CASE:text-ok|CASE:argv|'返回一句简短的任务确认。'|'只返回 codex-ready。')
    if [ "$scenario" = '只返回 codex-ready。' ]; then
      write_final 'codex-ready'
    else
      write_final 'codex-text'
    fi
    completed
    ;;
  CASE:native-5) [ -n "$schema_file" ] || exit 92; write_final '{"value":5}'; completed ;;
  CASE:native-10) [ -n "$schema_file" ] || exit 92; write_final '{"value":10}'; completed ;;
  '返回一个 5 到 15 的整数。') [ -n "$schema_file" ] || exit 92; write_final '{"value":10}'; completed ;;
  CASE:native-15) [ -n "$schema_file" ] || exit 92; write_final '{"value":15}'; completed ;;
  CASE:native-string) [ -n "$schema_file" ] || exit 92; write_final '{"value":"10"}'; completed ;;
  CASE:native-low) [ -n "$schema_file" ] || exit 92; write_final '{"value":4}'; completed ;;
  CASE:native-high) [ -n "$schema_file" ] || exit 92; write_final '{"value":16}'; completed ;;
  CASE:native-float) [ -n "$schema_file" ] || exit 92; write_final '{"value":8.5}'; completed ;;
  CASE:native-extra) [ -n "$schema_file" ] || exit 92; write_final '{"value":10,"x":1}'; completed ;;
  CASE:native-missing) [ -n "$schema_file" ] || exit 92; write_final '{}'; completed ;;
  CASE:native-explanation) [ -n "$schema_file" ] || exit 92; write_final 'The answer is {"value":10}'; completed ;;
  CASE:local-ok)
    [ -z "$schema_file" ] || exit 93
    write_final '{"value":11}'
    completed
    ;;
  CASE:no-terminal)
    write_final 'orphan result'
    printf '%s\n' '{"type":"thread.started","thread_id":"fixture-thread"}'
    printf '%s\n' '{"type":"turn.started"}'
    ;;
  CASE:turn-failed)
    write_final 'must not resolve'
    printf '%s\n' '{"type":"thread.started","thread_id":"fixture-thread"}'
    printf '%s\n' '{"type":"turn.started"}'
    printf '%s\n' '{"type":"turn.failed","error":{"message":"fixture failure"}}'
    ;;
  CASE:error-event)
    write_final 'must not resolve'
    printf '%s\n' '{"type":"error","message":"fixture error"}'
    ;;
  CASE:invalid-jsonl)
    write_final 'must not resolve'
    printf '%s\n' 'not-json'
    ;;
  CASE:duplicate-terminal)
    write_final 'must not resolve'
    printf '%s\n' '{"type":"thread.started","thread_id":"fixture-thread"}' '{"type":"turn.started"}' '{"type":"turn.completed"}' '{"type":"turn.completed"}'
    ;;
  CASE:missing-final)
    completed
    ;;
  CASE:final-too-large)
    /usr/bin/python3 - "$final_file" <<'PY'
import sys
with open(sys.argv[1], "wb") as handle:
    handle.write(b"x" * (1024 * 1024 + 1))
PY
    completed
    ;;
  CASE:nonzero)
    write_final 'must not resolve'
    completed
    exit 7
    ;;
  CASE:timeout|CASE:cancel)
    /bin/sleep 30 &
    child=$!
    printf '%s\n' "$child" >"$PWD/codex-child.pid"
    wait "$child"
    ;;
  CASE:env-safety)
    business=false; llm=false; claude=false; auth=false; auth_source=false
    [ "${BUSINESS_SECRET+x}" = x ] && business=true
    [ "${OPENDESK_LLM_API_KEY+x}" = x ] && llm=true
    [ "${ANTHROPIC_API_KEY+x}" = x ] && claude=true
    [ "${CODEX_API_KEY+x}" = x ] && auth=true
    [ "${DUMMY_CODEX_AUTH+x}" = x ] && auth_source=true
    write_final "{\"businessSecretPresent\":$business,\"llmKeyPresent\":$llm,\"otherBackendKeyPresent\":$claude,\"selectedAuthPresent\":$auth,\"authSourceNamePresent\":$auth_source}"
    completed
    ;;
  *)
    printf '%s\n' '{"type":"error","message":"unknown fixture case"}'
    exit 94
    ;;
esac
