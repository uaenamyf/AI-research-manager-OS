#!/usr/bin/env bash
# Start/stop the ResearchOS-integrated dsh instance (web profile + unified
# LLM/Embedding gateway). Reads ResearchOS .env for the gateway upstream keys,
# so the gateway serves the SAME provider/key/model ResearchOS uses today.
#
# Usage:
#   packages/researchos/scripts/dsh-gateway.sh start [port]   # default port 3080
#   packages/researchos/scripts/dsh-gateway.sh stop
#   packages/researchos/scripts/dsh-gateway.sh status
#
# Prereqs: single-repo layout —— fork root IS the dsh checkout (no submodule);
# this script lives at packages/researchos/scripts/ inside the fork. The web
# profile already has research-llm-gateway bundle + mcp-client rows.

set -euo pipefail

# 2026-08-22 uaenamyf: 单仓库化 —— 脚本位于 packages/researchos/scripts/，
# 上三级即 fork 根；DSH checkout 就是仓库根（不再有 submodule）。
FORK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
# DSH checkout: prefer env override, else the fork root itself.
DSH="${DSH_HOME_CHECKOUT:-$FORK_ROOT}"
ENV_FILE="${RESEARCH_ENV_FILE:-$FORK_ROOT/packages/researchos/.env}"
LOG_FILE="${DSH_LOG_FILE:-$FORK_ROOT/packages/researchos/.dsh-gateway.log}"
PID_FILE="${DSH_PID_FILE:-$FORK_ROOT/packages/researchos/.dsh-gateway.pid}"
PORT="${2:-3080}"

need_env() {
  grep -q "^$1=" "$ENV_FILE" || { echo "missing $1 in $ENV_FILE" >&2; exit 1; }
}

# 2026-08-22 uaenamyf: clone 即用防护 —— DSH 运行需要构建产物（git 不跟踪）：
#   - $DSH/apps/cli/lib/bin.js          (pnpm run build:lib:host)
#   - $DSH/apps/web/dist/index.html     (pnpm run build:web)
#   - $DSH/packages/researchos/external-search/vendor/literature-search-mcp/dist/
#                                        (cd vendor && npm install && npm run build)
# 缺失时给出明确指引，避免 MODULE_NOT_FOUND 困惑。
check_build_artifacts() {
  local missing=""
  [ -f "$DSH/apps/cli/lib/bin.js" ] || missing="$missing\n  - host lib:  cd $DSH && pnpm run build:lib:host"
  [ -f "$DSH/apps/web/dist/index.html" ] || missing="$missing\n  - web:       cd $DSH && pnpm run build:web"
  if [ ! -f "$DSH/packages/researchos/external-search/vendor/literature-search-mcp/dist/server.js" ]; then
    missing="$missing\n  - lit-mcp:  cd $DSH/packages/researchos/external-search/vendor/literature-search-mcp && npm install && npm run build"
  fi
  if [ -n "$missing" ]; then
    echo "!! 缺少 DSH 构建产物，请先构建："
    echo -e "$missing"
    echo "   完整流程：cd $DSH && pnpm install && pnpm run build && \\"
    echo "             cd packages/researchos/external-search/vendor/literature-search-mcp && npm install && npm run build"
    exit 1
  fi
}

start() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "dsh already running (pid $(cat "$PID_FILE"))"
    exit 0
  fi
  check_build_artifacts
  # Required ResearchOS env (keys never logged)
  need_env OPENAI_API_KEY
  need_env OPENAI_BASE_URL

  # 2026-08-21 uaenamyf: env 注入统一走 researchos-bootstrap.mjs（与 `pnpm dsh
  # web` 同一真相源：.env 自动创建 + RESEARCH_* 注入 + vendor 构建检查）。
  # 子 shell 内 export 不会影响当前 shell，因此用 eval 导入其 process.env 快照：
  # bootstrap 脚本打印 "KEY=VALUE" 行（不含秘密），本脚本据此 export。
  node packages/researchos/scripts/researchos-bootstrap.mjs >/dev/null 2>&1 || true
  eval "$(node --input-type=module -e "
    const m = await import('./packages/researchos/scripts/researchos-bootstrap.mjs');
    m.bootstrapResearchOS();
    for (const k of ['RESEARCH_LLM_API_KEY','RESEARCH_LLM_BASE_URL','RESEARCH_LLM_MODEL',
                     'RESEARCH_EMBEDDING_API_KEY','RESEARCH_EMBEDDING_BASE_URL',
                     'RESEARCH_DATA_DIR','JWT_SECRET','RESEARCH_INTERNAL_TOKEN',
                     'RESEARCH_AI_INLINE','RESEARCH_ANON_ENABLED','RESEARCH_ANON_EMAIL',
                     'RESEARCH_ANON_USER_ID']) {
      if (process.env[k]) console.log(k + '=\"' + process.env[k].replace(/\"/g,'\\\\\"') + '\"');
    }
    console.log('RESEARCH_STORAGE_LOCAL_DIR=\"' + process.env.RESEARCH_STORAGE_LOCAL_DIR + '\"');
    console.log('RESEARCH_WORKSPACE_DIR=\"' + process.env.RESEARCH_WORKSPACE_DIR + '\"');
  ")"
  # 2026-08-20 myf: 多根支持 —— research-workspace bundle 接受逗号分隔的
  # 绝对路径白名单，UI 跟随左侧 DSH workspace 切换根。默认扫描 fork 父目录
  # 下所有顶层目录（让左侧 DSH workspace 列表里任何已注册项目都能成为
  # 右侧 panel 根）。显式 RESEARCH_WORKSPACE_ROOTS= 时按用户值
  # （用冒号/分号/逗号分隔）。bootstrap 只设单根（RESEARCH_WORKSPACE_DIR）。
  if [ -n "${RESEARCH_WORKSPACE_ROOTS:-}" ]; then
    export RESEARCH_WORKSPACE_ROOTS
  else
    PARENT_DIR="$(cd "$(dirname "$0")/../../../.." && pwd)"
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
