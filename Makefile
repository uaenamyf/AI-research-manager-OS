# ============================================================
# ResearchOS Makefile - 常用命令快捷方式
# 使用方法：make <target>
# ============================================================

.PHONY: help infra up down build test logs clean

.DEFAULT_GOAL := help

# ────────────────────────────────────────────────────────────
# 帮助信息
# ────────────────────────────────────────────────────────────
help:
	@echo "ResearchOS AI - 常用命令"
	@echo ""
	@echo "基础设施:"
	@echo "  make infra-up      - 启动数据库/Redis/RabbitMQ"
	@echo "  make infra-down    - 停止基础设施"
	@echo ""
	@echo "应用服务:"
	@echo "  make up            - 启动全部服务（Docker）"
	@echo "  make down          - 停止全部服务"
	@echo "  make build         - 重新构建所有 Docker 镜像"
	@echo ""
	@echo "测试:"
	@echo "  make test          - 运行所有服务的单元测试"
	@echo "  make test-backend  - 运行后端测试"
	@echo "  make test-ai       - 运行 AI Service 测试"
	@echo "  make test-frontend - 运行前端测试"
	@echo ""
	@echo "日志:"
	@echo "  make logs          - 查看所有服务日志"
	@echo "  make logs-backend  - 查看后端日志"
	@echo "  make logs-ai       - 查看 AI Service 日志"
	@echo "  make logs-frontend - 查看前端日志"
	@echo ""
	@echo "其他:"
	@echo "  make clean         - 清理 Docker 资源（保留数据卷）"
	@echo "  make reset         - 完全重置（删除所有数据，慎用！）"

# ────────────────────────────────────────────────────────────
# 基础设施
# ────────────────────────────────────────────────────────────
infra-up:
	cd infra && docker compose up -d

infra-down:
	cd infra && docker compose down

# ────────────────────────────────────────────────────────────
# 应用服务
# ────────────────────────────────────────────────────────────
up:
	cd infra && docker compose --profile app up -d

down:
	cd infra && docker compose --profile app down

build:
	cd infra && docker compose --profile app build

build-backend:
	cd infra && docker compose build backend

build-ai:
	cd infra && docker compose build ai-service

build-frontend:
	cd infra && docker compose build frontend

# ────────────────────────────────────────────────────────────
# 测试
# ────────────────────────────────────────────────────────────
test: test-backend test-ai test-frontend

test-backend:
	cd backend && mvn test -B

test-ai:
	cd ai-service && pytest tests/ -v --cov=app

test-frontend:
	cd frontend && npm run lint && npx tsc --noEmit && npm test -- --run

# ────────────────────────────────────────────────────────────
# 日志
# ────────────────────────────────────────────────────────────
logs:
	cd infra && docker compose logs -f

logs-backend:
	cd infra && docker compose logs -f backend

logs-ai:
	cd infra && docker compose logs -f ai-service

logs-frontend:
	cd infra && docker compose logs -f frontend

logs-infra:
	cd infra && docker compose logs -f postgres redis rabbitmq

# ────────────────────────────────────────────────────────────
# 清理与重置
# ────────────────────────────────────────────────────────────
clean:
	cd infra && docker compose down --remove-orphans

reset:
	@echo "⚠️  警告：这将删除所有数据（数据库、向量、消息队列）"
	@echo "5 秒后继续，按 Ctrl+C 取消..."
	@sleep 5
	cd infra && docker compose down -v --remove-orphans
	docker system prune -f
