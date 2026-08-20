# ============================================================
# ResearchOS Makefile - 常用命令快捷方式
# 使用方法：make <target>（在 packages/researchos/ 目录下运行，
# 或 make -C packages/researchos <target>）
# ============================================================
#
# 2026-08-19: legacy backend/ai-service 已移除（AI 管道迁入 DSH
# research-ai-worker），仅保留数据库基础设施 + DSH 网关启停。
# 2026-08-22: 全 SQLite 化 —— 运行时零数据库依赖，infra（docker）已彻底移除。
# 2026-08-22: 单仓库化 —— 本文件位于 packages/researchos/，DSH checkout
# = fork 根（无 submodule）。

.PHONY: help start-dsh stop-dsh status logs reset

.DEFAULT_GOAL := help

# Makefile 自身所在目录（允许从任意 cwd 调用）
SELF_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))

# ────────────────────────────────────────────────────────────
# 帮助信息
# ────────────────────────────────────────────────────────────
help:
	@echo "ResearchOS AI - 常用命令"
	@echo ""
	@echo "DSH（前端 + 业务 bundle + AI 管道，:3080，零数据库依赖）:"
	@echo "  make start-dsh     - 启动 DSH 网关（scripts/dsh-gateway.sh start）"
	@echo "  make stop-dsh      - 停止 DSH 网关"
	@echo "  make status        - DSH 网关状态"
	@echo ""
	@echo "日志:"
	@echo "  make logs          - 查看 DSH 日志（.dsh-gateway.log）"
	@echo ""
	@echo "其他:"
	@echo "  make reset         - 完全重置（删除 SQLite 数据与上传文件，慎用！）"

# ────────────────────────────────────────────────────────────
# DSH 网关（legacy backend/ai-service 已移除，应用层全部由 DSH 承载）
# ────────────────────────────────────────────────────────────
start-dsh:
	cd "$(SELF_DIR)" && bash scripts/dsh-gateway.sh start

stop-dsh:
	cd "$(SELF_DIR)" && bash scripts/dsh-gateway.sh stop

status:
	cd "$(SELF_DIR)" && bash scripts/dsh-gateway.sh status

# ────────────────────────────────────────────────────────────
# 日志
# ────────────────────────────────────────────────────────────
logs:
	cd "$(SELF_DIR)" && tail -f .dsh-gateway.log

# ────────────────────────────────────────────────────────────
# 清理与重置
# ────────────────────────────────────────────────────────────
reset:
	@echo "⚠️  警告：这将删除本地 SQLite 数据库 + 上传文件，且不可恢复！"
	@echo "5 秒后继续，按 Ctrl+C 取消..."
	@sleep 5
	rm -f "$$HOME/.researchos/data/researchos.db"
	rm -rf "$$HOME/.researchos/uploads"
	@echo "✅ 已重置（下次启动 DSH 会自动重建）"
