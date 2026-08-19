# ResearchOS 部署指南

## 目录

1. [本地开发启动](#1-本地开发启动)
2. [Docker 一键部署](#2-docker-一键部署)
3. [生产环境部署](#3-生产环境部署)
4. [CI/CD 流水线](#4-cicd-流水线)
5. [常见问题](#5-常见问题)

---

## 1. 本地开发启动

### 方式 A：手动启动（推荐用于开发调试）

```bash
# 步骤 1：启动基础设施（PostgreSQL + Redis + RabbitMQ）
cd infra
docker compose up -d

# 步骤 2：启动后端（新终端）
cd backend
mvn spring-boot:run

# 步骤 3：启动 AI Service（新终端）
cd ai-service
source .venv/bin/activate  # Windows: .venv\Scripts\Activate.ps1
uvicorn app.main:app --reload

# 步骤 4：启动前端（DSH GUI，新终端）
cd deepseek-harness-master && pnpm dsh web   # :3080
```

访问地址：
- 前端（DSH GUI）：http://localhost:3080
- 后端 API：http://localhost:8080
- AI Service：http://localhost:8000
- RabbitMQ 管理：http://localhost:15672（guest/guest）

### 方式 B：Docker Compose 全栈启动

```bash
# 复制环境变量模板
cp .env.example .env
# 编辑 .env，填入 LLM API Key 等必要配置

# 启动全部服务（基础设施 + 应用）
cd infra
docker compose --profile app up -d

# 查看日志
docker compose logs -f backend
docker compose logs -f ai-service
```

---

## 2. Docker 一键部署

### 2.1 环境准备

```bash
# 1. 复制并配置环境变量
cp .env.example .env

# 2. 必须修改的配置（生产环境）
# - POSTGRES_PASSWORD
# - JWT_SECRET（生成：openssl rand -base64 32）
# - INTERNAL_TOKEN
# - LLM_PROVIDER + 对应的 API Key
# - STORAGE_* 配置
```

### 2.2 启动命令

```bash
cd infra

# 启动基础设施（首次部署，或只需要 DB/Redis/RabbitMQ）
docker compose up -d

# 启动全部服务
docker compose --profile app up -d

# 只启动特定服务
docker compose --profile app up -d backend
docker compose --profile app up -d ai-service

# 停止服务
docker compose down

# 停止并删除数据（慎用！）
docker compose down -v
```

### 2.3 健康检查

```bash
# 检查容器状态
docker compose ps

# 检查后端健康状态
curl http://localhost:8080/api/health

# 检查 AI Service 健康状态
curl http://localhost:8000/health
```

---

## 3. 生产环境部署

### 3.1 服务器要求

- **最低配置**：2 CPU / 4GB RAM / 40GB SSD
- **推荐配置**：4 CPU / 8GB RAM / 100GB SSD
- **操作系统**：Ubuntu 22.04 LTS / Debian 12

### 3.2 生产环境配置优化

```bash
# 1. 配置 Docker 日志轮转
# /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}

# 2. 配置 Nginx 反向代理（可选）
# - 用于 SSL 终止、负载均衡、静态资源缓存
# - 参考：infra/nginx/nginx.conf.example

# 3. 配置 HTTPS（Let's Encrypt）
# certbot --nginx -d your-domain.com
```

### 3.3 数据库备份

```bash
# 手动备份
docker exec researchos-postgres pg_dump -U researchos researchos > backup_$(date +%Y%m%d).sql

# 恢复备份
docker exec -i researchos-postgres psql -U researchos researchos < backup_20260721.sql
```

### 3.4 监控与告警

```bash
# 查看资源使用
docker stats

# 查看服务日志
docker compose logs -f --tail=100 backend
```

---

## 4. CI/CD 流水线

### 4.1 GitHub Actions 工作流

项目已配置两个工作流：

**`.github/workflows/ci.yml`（每次 push / PR）**

- ✅ **后端测试**：Maven 单元测试（68 个用例）
- ✅ **AI Service 测试**：pytest + 覆盖率报告（72 个用例）
- ✅ **Docker 构建验证**：两个服务镜像构建验证
- ✅ **E2E 测试**：启动 MySQL/Redis/RabbitMQ/Postgres + 真实后端，验证后端 API 全流程（已随旧 Next.js 前端移除，前端验证走 DSH GUI 手动验证，见 `dsh-plugins/README.md`）

**`.github/workflows/cd.yml`（push 到 main / 手动触发）**

- 构建两个服务镜像并推送至 GitHub Container Registry：
  `ghcr.io/uaenamyf/ai-research-manager-os/{backend,ai-service}`（tag = SHA 前 8 位 + latest）
- 可选自动部署：在 GitHub Repo Settings → Secrets and variables 配置后，push 到 main 会自动 SSH 部署：
  - **Variables**：`DEPLOY_ENABLED=true`、`DEPLOY_PATH=/opt/researchos`
  - **Secrets**：`DEPLOY_HOST`、`DEPLOY_USER`、`DEPLOY_SSH_KEY`

### 4.2 生产服务器部署（拉取 CD 镜像）

```bash
# 服务器上克隆仓库（只需 infra/ 与配置文件，用于 compose 编排）
git clone https://github.com/uaenamyf/AI-research-manager-OS.git /opt/researchos
cd /opt/researchos

# 配置 .env（含 STRIPE_* / GOOGLE_* / LLM key 等）
cp .env.example .env
vi .env

# 登录 GHCR（私有镜像时需要）
echo $GITHUB_TOKEN | docker login ghcr.io -u <your-username> --password-stdin

# 拉取 CD 构建好的镜像并启动（docker-compose.prod.yml 把 build 替换为 image）
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml --profile app up -d
```

### 4.3 本地执行测试

```bash
# 后端测试
cd backend
mvn test

# AI Service 测试
cd ai-service
pytest tests/ -v --cov=app
```

---

## 5. 常见问题

### Q1: 后端启动失败，提示数据库连接失败

**A**: 检查：
1. PostgreSQL 容器是否运行：`docker compose ps`
2. 环境变量 `DB_HOST` / `DB_PORT` 配置正确
3. 数据库密码与 `.env` 一致

### Q2: AI Service 无法连接 RabbitMQ

**A**: 检查：
1. RabbitMQ 容器健康状态：`docker compose ps rabbitmq`
2. 等待 RabbitMQ 完全启动（约 10-20 秒）
3. 检查 `RABBITMQ_URL` 格式：`amqp://user:pass@host:port`

### Q3: DSH GUI 调用接口报错

**A**: 检查：
1. DSH 是否运行：`curl http://127.0.0.1:3080`
2. bundle 路由是否正常：`curl http://127.0.0.1:3080/research-<domain>/...`
3. 浏览器控制台查看具体错误信息

### Q4: LLM API 调用失败

**A**: 检查：
1. `LLM_PROVIDER` 配置（openai / anthropic / volcengine）
2. 对应的 API Key 正确配置
3. 网络连通性（火山引擎需要国内网络）

### Q5: Docker 构建失败

**A**: 常见原因：
1. 网络问题导致依赖下载失败 → 重试或配置镜像
2. 内存不足 → 增加 Docker 内存限制（至少 4GB）

---

## 6. 测试覆盖

### 后端测试
- [x] 应用启动测试
- [x] 健康检查接口测试
- [x] 订阅服务额度校验测试
- [ ] 用户服务测试
- [ ] 论文服务测试
- [ ] 集成测试（Testcontainers）

### AI Service 测试
- [x] PDF 解析测试
- [x] 健康检查测试
- [x] Embedding 服务测试
- [ ] RAG 检索测试
- [ ] Agent 测试（mock LLM）

---

## 7. 版本更新流程

```bash
# 1. 拉取最新代码
git pull

# 2. 停止旧容器
cd infra
docker compose --profile app down

# 3. 重新构建并启动
docker compose --profile app up -d --build

# 4. 验证
docker compose ps
curl http://localhost:8080/api/health
```
