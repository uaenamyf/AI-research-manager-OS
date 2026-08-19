# ============================================================
# ResearchOS Makefile - 常用命令快捷方式
# 使用方法：make <target>
# ============================================================
#
# 2026-08-19: legacy backend/ai-service 已移除（AI 管道迁入 DSH
# research-ai-worker），仅保留数据库基础设施 + DSH 网关启停。

.PHONY: help infra-up infra-down start-dsh stop-dsh status logs logs-infra clean reset

.DEFAULT_GOAL := help

# ────────────────────────────────────────────────────────────
# 帮助信息
# ────────────────────────────────────────────────────────────
help:
	@echo "ResearchOS AI - 常用命令"
	@echo ""
	@echo "基础设施:"
	@echo "  make infra-up      - 启动数据库（postgres + mysql）"
	@echo "  make infra-down    - 停止基础设施"
	@echo ""
	@echo "DSH（前端 + 业务 bundle + AI 管道，:3080）:"
	@echo "  make start-dsh     - 启动 DSH 网关（scripts/dsh-gateway.sh start）"
	@echo "  make stop-dsh      - 停止 DSH 网关"
	@echo "  make status        - DSH 网关状态"
	@echo ""
	@echo "日志:"
	@echo "  make logs          - 查看 DSH 日志（.dsh-gateway.log）"
	@echo "  make logs-infra    - 查看数据库日志"
	@echo ""
	@echo "其他:"
	@echo "  make clean         - 清理 Docker 资源（保留数据卷）"
	@echo "  make reset         - 完全重置（删除所有数据，慎用！）"

# ────────────────────────────────────────────────────────────
# 基础设施
# ────────────────────────────────────────────────────────────
infra-up:
	cd infra && docker compose --env-file ../.env up -d

infra-down:
	cd infra && docker compose --env-file ../.env down

# ────────────────────────────────────────────────────────────
# DSH 网关（legacy backend/ai-service 已移除，应用层全部由 DSH 承载）
# ────────────────────────────────────────────────────────────
start-dsh:
	bash scripts/dsh-gateway.sh start

stop-dsh:
	bash scripts/dsh-gateway.sh stop

status:
	bash scripts/dsh-gateway.sh status

# ────────────────────────────────────────────────────────────
# 日志
# ────────────────────────────────────────────────────────────
logs:
	tail -f .dsh-gateway.log

logs-infra:
	cd infra && docker compose --env-file ../.env logs -f postgres mysql

# ────────────────────────────────────────────────────────────
# 清理与重置
# ────────────────────────────────────────────────────────────
clean:
	cd infra && docker compose --env-file ../.env down --remove-orphans

reset:
	@echo "⚠️  警告：这将删除所有数据（数据库、向量）"
	@echo "5 秒后继续，按 Ctrl+C 取消..."
	@sleep 5
	cd infra && docker compose --env-file ../.env down -v --remove-orphans
	docker system prune -f
