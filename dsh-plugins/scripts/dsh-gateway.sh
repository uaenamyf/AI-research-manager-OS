#!/usr/bin/env bash
# Start/stop the ResearchOS-integrated dsh instance (web profile + unified
# LLM/Embedding gateway). Reads ResearchOS .env for the gateway upstream keys,
# so the gateway serves the SAME provider/key/model ResearchOS uses today.
#
# Usage:
#   scripts/dsh-gateway.sh start [port]   # default port 3080
#   scripts/dsh-gateway.sh stop
#   scripts/dsh-gateway.sh status
#
# Prereqs: DSH checkout at $DSH_HOME_CHECKOUT (env) or ./deepseek-harness-master;
# the web profile already has research-llm-gateway bundle + mcp-client rows
# (see dsh-plugins/README.md for how those get installed).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# DSH checkout: prefer env override, else the sibling working checkout (the
# in-repo copy is git-ignored and may be an unbuilt archive).
DSH="${DSH_HOME_CHECKOUT:-/Users/bbbo9/Downloads/mmmyyyfff/deepseek-harness-master}"
ENV_FILE="$REPO_ROOT/.env"
LOG_FILE="${DSH_LOG_FILE:-$REPO_ROOT/dsh-plugins/.dsh-gateway.log}"
PID_FILE="${DSH_PID_FILE:-$REPO_ROOT/dsh-plugins/.dsh-gateway.pid}"
PORT="${2:-3080}"

need_env() {
  grep -q "^$1=" "$ENV_FILE" || { echo "missing $1 in $ENV_FILE" >&2; exit 1; }
}

start() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "dsh already running (pid $(cat "$PID_FILE"))"
    exit 0
  fi
  # Required ResearchOS env (keys never logged)
  need_env OPENAI_API_KEY
  need_env OPENAI_BASE_URL

  export RESEARCH_LLM_API_KEY="$(grep '^OPENAI_API_KEY=' "$ENV_FILE" | cut -d= -f2-)"
  # 2026-08-17 uaenamyf: gateway 上游改取 RESEARCH_LLM_UPSTREAM_BASE_URL（真实上游），
  # 不再用 OPENAI_BASE_URL —— Phase 1 切换后 OPENAI_BASE_URL 已指向网关自身，否则网关自环 fetch 失败。
  export RESEARCH_LLM_BASE_URL="$(grep '^RESEARCH_LLM_UPSTREAM_BASE_URL=' "$ENV_FILE" | cut -d= -f2- || grep '^OPENAI_BASE_URL=' "$ENV_FILE" | cut -d= -f2- || true)"
  export RESEARCH_LLM_MODEL="$(grep '^OPENAI_DEFAULT_MODEL=' "$ENV_FILE" | cut -d= -f2- || true)"
  export RESEARCH_EMBEDDING_API_KEY="$RESEARCH_LLM_API_KEY"
  export RESEARCH_EMBEDDING_BASE_URL="$RESEARCH_LLM_BASE_URL"
  # Phase 3 research-auth: shared JWT secret (dual-auth with Spring Boot) + MySQL creds
  export JWT_SECRET="$(grep '^JWT_SECRET=' "$ENV_FILE" | cut -d= -f2- || true)"
  export RESEARCH_MYSQL_HOST="${RESEARCH_MYSQL_HOST:-127.0.0.1}"
  export RESEARCH_MYSQL_PORT="${RESEARCH_MYSQL_PORT:-${MYSQL_PORT:-3306}}"
  export RESEARCH_MYSQL_USER="${RESEARCH_MYSQL_USER:-${MYSQL_USER:-researchos}}"
  export RESEARCH_MYSQL_PASSWORD="${RESEARCH_MYSQL_PASSWORD:-$(grep '^MYSQL_PASSWORD=' "$ENV_FILE" | cut -d= -f2- || true)}"
  export RESEARCH_MYSQL_DATABASE="${RESEARCH_MYSQL_DATABASE:-${MYSQL_DB:-researchos}}"
  # Phase 3 research-paper: RabbitMQ URL for AI task publish (researchos.ai.task exchange)
  export RESEARCH_RABBITMQ_URL="${RESEARCH_RABBITMQ_URL:-amqp://${RABBIT_USER:-guest}:${RABBIT_PASS:-guest}@127.0.0.1:${RABBIT_PORT:-5672}}"
  # Phase 3 research-file: local storage dir + internal token + legacy backend proxy
  export RESEARCH_STORAGE_LOCAL_DIR="${RESEARCH_STORAGE_LOCAL_DIR:-$HOME/.researchos/uploads}"
  export RESEARCH_INTERNAL_TOKEN="${RESEARCH_INTERNAL_TOKEN:-$(grep '^INTERNAL_TOKEN=' "$ENV_FILE" | cut -d= -f2- || true)}"
  export RESEARCH_BACKEND_URL="${RESEARCH_BACKEND_URL:-http://127.0.0.1:8080}"

  # Always pin the webserver port via a patch overlay: dsh defaults to 3080,
  # which is typically the live GUI. If the requested port is taken, bump it.
  while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
    PORT=$((PORT + 1))
  done
  # 2026-08-17 uaenamyf: RESEARCH_GATEWAY_URL 必须在端口 bump 之后导出，否则指向初始端口（3080）而非实际端口
  # MCP server env: reach the gateway + ResearchOS DBs from dsh-spawned children
  export RESEARCH_GATEWAY_URL="http://127.0.0.1:$PORT"
  PATCH_FILE="$(mktemp)"
  printf -- '- id: webserver\n  config:\n    host: "127.0.0.1"\n    port: %s\n' "$PORT" > "$PATCH_FILE"
  PATCH="--patch $PATCH_FILE"

  cd "$DSH"
  # shellcheck disable=SC2086
  nohup node apps/cli/lib/bin.js --profile web $PATCH \
    >"$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  sleep 2
  echo "dsh started (pid $(cat "$PID_FILE"), log $LOG_FILE)"
  echo "gateway: http://127.0.0.1:$PORT/v1/chat/completions"
}

stop() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    kill "$(cat "$PID_FILE")"
    rm -f "$PID_FILE"
    echo "dsh stopped"
  else
    echo "dsh not running"
  fi
}

status() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "dsh running (pid $(cat "$PID_FILE"))"
  else
    echo "dsh not running"
  fi
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  *) echo "usage: $0 {start|stop|status} [port]"; exit 1 ;;
esac
