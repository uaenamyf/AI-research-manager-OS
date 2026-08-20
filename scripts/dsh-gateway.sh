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

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# DSH checkout: prefer env override, else the sibling working checkout (the
# in-repo copy is git-ignored and may be an unbuilt archive).
DSH="${DSH_HOME_CHECKOUT:-$REPO_ROOT/deepseek-harness-master}"
ENV_FILE="$REPO_ROOT/.env"
LOG_FILE="${DSH_LOG_FILE:-$REPO_ROOT/.dsh-gateway.log}"
PID_FILE="${DSH_PID_FILE:-$REPO_ROOT/.dsh-gateway.pid}"
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
  # 2026-08-22 uaenamyf: 全 SQLite 化 —— 数据库已从 MySQL/PG 迁移到
  # node:sqlite（$RESEARCH_DATA_DIR/researchos.db，默认 ~/.researchos/data），
  # 不再需要 RESEARCH_MYSQL_* 注入；数据目录与上传目录随应用自动创建。
  export RESEARCH_DATA_DIR="${RESEARCH_DATA_DIR:-$(grep '^RESEARCH_DATA_DIR=' "$ENV_FILE" | cut -d= -f2- || true)}"
  # Phase 3 research-auth: shared JWT secret (dual-auth with Spring Boot)
  export JWT_SECRET="$(grep '^JWT_SECRET=' "$ENV_FILE" | cut -d= -f2- || true)"
  # 2026-08-20 myf: RESEARCH_RABBITMQ_URL 注入已移除（RabbitMQ 彻底下线，
  # AI 管道直调 research-ai-worker bundle，见 research-paper/review bundle 注释）
  # 2026-08-20 myf: STRIPE 注入已移除（research-subscription bundle 随登录/订阅
  # 功能下线，见 server/index.js 与 server/bundles/auth.js 注释）
  # Phase 3 research-file: local storage dir + internal token
  export RESEARCH_STORAGE_LOCAL_DIR="${RESEARCH_STORAGE_LOCAL_DIR:-$HOME/.researchos/uploads}"
  export RESEARCH_INTERNAL_TOKEN="${RESEARCH_INTERNAL_TOKEN:-$(grep '^INTERNAL_TOKEN=' "$ENV_FILE" | cut -d= -f2- || true)}"
  # 2026-08-19 myf: RESEARCH_BACKEND_URL 已随 legacy backend 退役移除（文件全量
  # 走 research-file 本地存储；ai-worker 直接读 research-file）
  export RESEARCH_AI_INLINE="$(grep '^RESEARCH_AI_INLINE=' "$ENV_FILE" | cut -d= -f2- || true)"
  # 2026-08-20 myf: 工作区栏目单根（默认 = 父仓库根，DSH checkout 的上一级）
  export RESEARCH_WORKSPACE_DIR="${RESEARCH_WORKSPACE_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
  # 2026-08-20 myf: 多根支持 —— research-workspace bundle 接受逗号分隔的
  # 绝对路径白名单，UI 跟随左侧 DSH workspace 切换根。默认扫描父目录
  # (mmmyyyfff) 下所有顶层目录（AI-research-manager-OS + 兄弟项目
  # ARIS-in-AI-Offer-main / AegisOS / closed_set_identification / 等），
  # 让左侧 DSH workspace 列表里任何已注册项目都能成为右侧 panel 根。
  # 显式 RESEARCH_WORKSPACE_ROOTS= 时按用户值（用冒号/分号/逗号分隔）。
  if [ -n "${RESEARCH_WORKSPACE_ROOTS:-}" ]; then
    export RESEARCH_WORKSPACE_ROOTS
  else
    PARENT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
    if [ -d "$PARENT_DIR" ]; then
      _roots=""
      for d in "$PARENT_DIR"/*/; do
        [ -d "$d" ] || continue
        if [ -z "$_roots" ]; then
          _roots="$d"
        else
          _roots="$_roots,$d"
        fi
      done
      export RESEARCH_WORKSPACE_ROOTS="${_roots:-$RESEARCH_WORKSPACE_DIR}"
    else
      export RESEARCH_WORKSPACE_ROOTS="$RESEARCH_WORKSPACE_DIR"
    fi
  fi
  # 研究区无登录 UI 的静默引导（dev-only；RESEARCH_ANON_ENABLED != 1 时 /research-auth/anon 404）
  export RESEARCH_ANON_ENABLED="$(grep '^RESEARCH_ANON_ENABLED=' "$ENV_FILE" | cut -d= -f2- || true)"
  export RESEARCH_ANON_EMAIL="$(grep '^RESEARCH_ANON_EMAIL=' "$ENV_FILE" | cut -d= -f2- || true)"
  export RESEARCH_ANON_USER_ID="$(grep '^RESEARCH_ANON_USER_ID=' "$ENV_FILE" | cut -d= -f2- || true)"

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
