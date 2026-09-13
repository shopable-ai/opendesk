#!/bin/sh
set -eu

schema=""
args_file="$PWD/claude-args.txt"
: >"$args_file"
for argument in "$@"; do
  printf '%s\n' "$argument" >>"$args_file"
done

while [ "$#" -gt 0 ]; do
  case "$1" in
    -p|--no-session-persistence|--strict-mcp-config)
      shift
      ;;
    --output-format|--permission-mode|--model|--json-schema|--max-budget-usd|--tools)
      option=$1
      [ "$#" -ge 2 ] || exit 90
      [ "$option" = "--json-schema" ] && schema=$2
      shift 2
      ;;
    *)
      printf 'unsupported fixture argument: %s\n' "$1" >&2
      exit 91
      ;;
  esac
done

scenario=""
IFS= read -r scenario || true
printf '%s\n' "$scenario" >"$PWD/claude-prompt.txt"
printf 'started\n' >"$PWD/claude-started.txt"

case "$scenario" in
  CASE:text-ok|CASE:argv|'返回一句简短的任务确认。'|'只返回 claude-ready。')
    if [ "$scenario" = '只返回 claude-ready。' ]; then
      printf '%s\n' '{"type":"result","subtype":"success","is_error":false,"result":"claude-ready","model":"claude-fixture","usage":{"input_tokens":3,"output_tokens":1}}'
    else
      printf '%s\n' '{"type":"result","subtype":"success","is_error":false,"result":"claude-text","model":"claude-fixture","usage":{"input_tokens":3,"output_tokens":1}}'
    fi
    ;;
  CASE:native-5) [ -n "$schema" ] || exit 92; printf '%s\n' '{"type":"result","subtype":"success","is_error":false,"result":"ignored","structured_output":{"value":5}}' ;;
  CASE:native-10) [ -n "$schema" ] || exit 92; printf '%s\n' '{"type":"result","subtype":"success","is_error":false,"result":"ignored","structured_output":{"value":10}}' ;;
  CASE:native-15) [ -n "$schema" ] || exit 92; printf '%s\n' '{"type":"result","subtype":"success","is_error":false,"result":"ignored","structured_output":{"value":15}}' ;;
  CASE:native-string) [ -n "$schema" ] || exit 92; printf '%s\n' '{"type":"result","subtype":"success","is_error":false,"result":"ignored","structured_output":{"value":"10"}}' ;;
  CASE:native-low) [ -n "$schema" ] || exit 92; printf '%s\n' '{"type":"result","subtype":"success","is_error":false,"result":"ignored","structured_output":{"value":4}}' ;;
  CASE:native-high) [ -n "$schema" ] || exit 92; printf '%s\n' '{"type":"result","subtype":"success","is_error":false,"result":"ignored","structured_output":{"value":16}}' ;;
  CASE:native-float) [ -n "$schema" ] || exit 92; printf '%s\n' '{"type":"result","subtype":"success","is_error":false,"result":"ignored","structured_output":{"value":8.5}}' ;;
  CASE:native-extra) [ -n "$schema" ] || exit 92; printf '%s\n' '{"type":"result","subtype":"success","is_error":false,"result":"ignored","structured_output":{"value":10,"x":1}}' ;;
  CASE:native-missing) [ -n "$schema" ] || exit 92; printf '%s\n' '{"type":"result","subtype":"success","is_error":false,"result":"ignored","structured_output":{}}' ;;
  CASE:local-ok)
    [ -z "$schema" ] || exit 93
    printf '%s\n' '{"type":"result","subtype":"success","is_error":false,"result":"{\"value\":12}"}'
    ;;
  CASE:failure)
    printf '%s\n' '{"type":"result","subtype":"error_during_execution","is_error":false,"result":"must not resolve"}'
    ;;
  CASE:is-error)
    printf '%s\n' '{"type":"result","subtype":"success","is_error":true,"result":"must not resolve"}'
    ;;
  CASE:missing-structured)
    [ -n "$schema" ] || exit 92
    printf '%s\n' '{"type":"result","subtype":"success","is_error":false,"result":"{\"value\":10}"}'
    ;;
  CASE:missing-result)
    printf '%s\n' '{"type":"result","subtype":"success","is_error":false}'
    ;;
  CASE:invalid-envelope)
    printf '%s\n' 'not-json'
    ;;
  CASE:nonzero)
    printf '%s\n' '{"type":"result","subtype":"success","is_error":false,"result":"must not resolve"}'
    exit 8
    ;;
  CASE:timeout|CASE:cancel)
    /bin/sleep 30 &
    child=$!
    printf '%s\n' "$child" >"$PWD/claude-child.pid"
    wait "$child"
    ;;
  CASE:env-safety)
    business=false; llm=false; codex=false; auth=false; auth_source=false
    [ "${BUSINESS_SECRET+x}" = x ] && business=true
    [ "${OPENDESK_LLM_API_KEY+x}" = x ] && llm=true
    [ "${CODEX_API_KEY+x}" = x ] && codex=true
    [ "${ANTHROPIC_API_KEY+x}" = x ] && auth=true
    [ "${DUMMY_CLAUDE_AUTH+x}" = x ] && auth_source=true
    printf '{"type":"result","subtype":"success","is_error":false,"result":"ignored","structured_output":{"businessSecretPresent":%s,"llmKeyPresent":%s,"otherBackendKeyPresent":%s,"selectedAuthPresent":%s,"authSourceNamePresent":%s}}\n' "$business" "$llm" "$codex" "$auth" "$auth_source"
    ;;
  *)
    printf '%s\n' '{"type":"result","subtype":"error_during_execution","is_error":true,"result":"unknown fixture case"}'
    exit 94
    ;;
esac
