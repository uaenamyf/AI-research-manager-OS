#!/usr/bin/env bash
# 一键升级 DSH 上游（单仓库版：fork = 唯一仓库，无 submodule）
#
# 背景：
#   uaenamyf/dsh-researchOS 是 deepseek-ai/deepseek-harness 的 fork，
#   main 分支 = 自定义版本。researchos 包（packages/researchos/）是纯新增
#   （零冲突），冲突只应出现在修改过的上游文件。本脚本直接作用于 fork 自身。
#
# 用法:
#   bash packages/researchos/scripts/upgrade-dsh.sh <tag> [--push]
#     <tag>    上游 tag：dsh-v0.1.0-rc.9（支持简写 rc.9）
#     --push   自动把 fork main push 到 GitHub
#
# 流程:
#   0. 前置检查（工作区干净、tag 未合并过）
#   1. 确保 upstream remote -> deepseek-ai/deepseek-harness
#   2. fetch upstream --tags
#   3. 从 main 创建 upgrade/<tag> 分支
#   4. merge <tag>（冲突预期=修改过的上游文件；若冲突请手动解决后重新跑）
#   5. pnpm install + 构建（host/client lib + web）
#   6. 跑 ui-layout 测试
#   7. --push: 合并回 main -> push fork
#
# 升级完成后记得重启: pnpm dsh web

set -euo pipefail

# 2026-08-22 uaenamyf: 单仓库化 —— 脚本位于 packages/researchos/scripts/，
# 上三级即 fork 根；升级直接在 fork 仓库内完成（无 submodule 指针）。
FORK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
UPSTREAM_URL="https://github.com/deepseek-ai/deepseek-harness.git"
TAG_PREFIX="dsh-v0.1.0-"

TAG="${1:-}"
[ -n "$TAG" ] || { echo "用法: bash packages/researchos/scripts/upgrade-dsh.sh <tag> [--push]  (tag 如 rc.9 / dsh-v0.1.0-rc.9)"; exit 1; }
PUSH_MODE="${2:-}"
case "$TAG" in
  rc*) TAG="${TAG_PREFIX}${TAG}" ;;
esac

[ -d "$FORK_ROOT/.git" ] || { echo "错误: $FORK_ROOT 不是 git 仓库"; exit 1; }

cd "$FORK_ROOT"

# --finish 模式：merge 冲突已手动解决，跳过 merge 直接构建/测试/push
if [ "$TAG" = "--finish" ]; then
  FINISH_TAG="${PUSH_MODE:-}"
  FINISH_PUSH="${3:-}"
  [ -n "$FINISH_TAG" ] || { echo "用法: scripts/upgrade-dsh.sh --finish <tag> [--push]"; exit 1; }
  case "$FINISH_TAG" in
    rc*) FINISH_TAG="${TAG_PREFIX}${FINISH_TAG}" ;;
  esac
  BR="upgrade/$FINISH_TAG"
  git checkout "$BR" 2>/dev/null || { echo "!! 分支 $BR 不存在，无法 --finish"; exit 1; }
  git diff --cached --quiet || git commit -m "resolve conflicts: $FINISH_TAG"
  git diff --quiet || { echo "!! 还有未暂存改动，请先 git add ."; exit 1; }
  TAG="$FINISH_TAG"
  PUSH_MODE="$FINISH_PUSH"
  echo "==> --finish 模式：跳过 merge，继续构建/测试/push（tag=$TAG）"
else
  # 0. 前置检查
  if ! git diff --quiet; then
    echo "!! submodule 工作区不干净，请先提交/清理再升级"
    git status --short | head
    exit 1
  fi
  if git rev-parse --verify "refs/tags/$TAG" >/dev/null 2>&1; then
    echo "!! tag $TAG 已在本地存在（可能已升级过，或需要 git fetch upstream --tags）"
    exit 1
  fi

  # 1. upstream remote
  if ! git remote get-url upstream >/dev/null 2>&1; then
    git remote add upstream "$UPSTREAM_URL"
    echo "已添加 upstream -> $UPSTREAM_URL"
  fi

  # 2. fetch 上游 tags（GitHub 网络不稳定，失败提示重试）
  echo "==> [1/6] git fetch upstream --tags ..."
  git fetch upstream --tags || { echo "!! fetch 失败（网络超时？），请重试"; exit 1; }
  git rev-parse --verify "refs/tags/$TAG" >/dev/null 2>&1 || { echo "!! tag $TAG 不在上游，检查 tag 名"; exit 1; }

  # 3-4. 从 main 创建升级分支并 merge
  git checkout main
  BR="upgrade/$TAG"
  git checkout -B "$BR" main
  echo "==> [2/6] merge upstream $TAG -> $BR"
  echo "    （预期冲突仅出现在修改过的上游文件；researchos 纯新增零冲突）"
  if ! git merge "$TAG" -m "merge upstream $TAG"; then
    echo ""
    echo "!! merge 有冲突，请手动解决："
    echo "   cd $FORK_ROOT"
    echo "   git status                # 查看冲突文件"
    echo "   # 解决后："
    echo "   git add . && git commit -m \"resolve conflicts: $TAG\""
    echo "   # 然后继续剩余步骤："
    echo "   bash packages/researchos/scripts/upgrade-dsh.sh --finish $TAG ${PUSH_MODE:-}"
    exit 1
  fi
fi

# 5. 安装 + 构建
echo "==> [3/6] pnpm install ..."
pnpm install
echo "==> [4/6] 构建 host lib ..."
pnpm run build:lib:host
echo "==> [4/6] 构建 client lib ..."
pnpm run build:lib:client
echo "==> [4/6] 构建 web ..."
pnpm run build:web

# 6. 测试
echo "==> [5/6] 测试 packages/client/ui-layout ..."
pnpm vitest run packages/client/ui-layout

git commit -m "chore: upgrade DSH to $TAG (merge upstream)" 2>/dev/null || true

# 7. push（可选）——单仓库：只推 fork main（无 submodule 指针）
if [ "$PUSH_MODE" = "--push" ]; then
  echo "==> [6/6] push fork main ..."
  git checkout main
  git merge "$BR" --ff-only
  git push origin main
  git push origin "$BR" || true   # 保留升级分支（失败不阻塞）
  echo "==> 完成！重启 gateway 验证: bash packages/researchos/scripts/dsh-gateway.sh restart"
else
  echo ""
  echo "==> 升级完成（未 push）。验证无误后执行："
  echo "   bash packages/researchos/scripts/upgrade-dsh.sh --finish $TAG --push"
  echo "   或手动: cd $FORK_ROOT && git checkout main && git merge $BR --ff-only && git push origin main"
  echo "   + 重启 gateway: bash packages/researchos/scripts/dsh-gateway.sh restart"
fi
