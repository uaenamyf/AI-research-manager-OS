# ResearchOS 部署指南

> 2026-08-19 更新：legacy backend / ai-service 已移除（AI 管道迁入 DSH
> `research-ai-worker`）；应用层 = DSH 单实例（:3080），数据库仅 postgres + mysql。

## 目录

1. [本地开发启动](#1-本地开发启动)
2. [基础设施（Docker）](#2-基础设施docker)
3. [生产环境部署](#3-生产环境部署)
4. [CI/CD 流水线](#4-cicd-流水线)
5. [常见问题](#5-常见问题)

---

## 1. 本地开发启动

```bash
# 步骤 1：启动数据库（postgres + mysql）
cd infra
docker compose up -d

# 步骤 2：启动 DSH（前端 + 业务 bundle + AI 管道，:3080）
cd ..
bash scripts/dsh-gateway.sh start   # 或 make start-dsh
```

访问地址：
- DSH GUI（研究区 + 业务 bundle）：http://localhost:3080
- LLM 网关：http://localhost:3080/v1/chat/completions（OpenAI 兼容）
- PostgreSQL：localhost:5432（`researchos/researchos`，向量库 paper_chunk）
- MySQL：localhost:3306（`researchos/researchos`，业务表）

停止：

```bash
bash scripts/dsh-gateway.sh stop    # 或 make stop-dsh
cd infra && docker compose down
```

---

## 2. 基础设施（Docker）

### 2.1 环境准备

```bash
# 1. 复制并配置环境变量（仓库根目录）
cp .env.example .env

# 2. 必须修改的配置（生产环境）
# - POSTGRES_PASSWORD / MYSQL_PASSWORD
# - JWT_SECRET（生成：openssl rand -base64 32）
# - INTERNAL_TOKEN
# - OPENAI_API_KEY / RESEARCH_LLM_UPSTREAM_BASE_URL
# - STRIPE_* / GOOGLE_*（启用对应功能时）
```

### 2.2 启动命令

```bash
cd infra

# 启动数据库（postgres + mysql；首次空卷自动执行 mysql-init/V1__init.sql）
docker compose up -d

# 停止服务
docker compose down

# 停止并删除数据（慎用！）
docker compose down -v
```

### 2.3 健康检查

```bash
# 检查容器状态
docker compose ps

# DSH / LLM 网关
curl http://127.0.0.1:3080

# 业务 bundle 路由
curl http://127.0.0.1:3080/research-<domain>/...
```

---

## 3. 生产环境部署

### 3.1 服务器要求

- **最低配置**：2 CPU / 4GB RAM / 40GB SSD
- **推荐配置**：4 CPU / 8GB RAM / 100GB SSD
- **操作系统**：Ubuntu 22.04 LTS / Debian 12
- **Node.js 22+**（DSH 运行环境；DSH checkout 见 `deepseek-harness-master/`）

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
# PostgreSQL（向量库）
docker exec researchos-postgres pg_dump -U researchos researchos > backup_$(date +%Y%m%d).sql

# MySQL（业务库）
docker exec researchos-mysql mysqldump -uresearchos -presearchos researchos > mysql_backup_$(date +%Y%m%d).sql

# 恢复备份（示例）
docker exec -i researchos-postgres psql -U researchos researchos < backup_20260721.sql
```

### 3.4 论文文件备份

论文 PDF 存储在 research-file 本地目录（默认 `~/.researchos/uploads`），备份时一并拷贝：

```bash
tar czf researchos-uploads-$(date +%Y%m%d).tar.gz ~/.researchos/uploads
```

### 3.5 监控与告警

```bash
# 查看资源使用
docker stats

# 查看服务日志
make logs          # DSH 网关日志（.dsh-gateway.log）
make logs-infra    # 数据库日志
```

---

## 4. CI/CD 流水线

### 4.1 GitHub Actions 工作流

项目已配置两个工作流：

**`.github/workflows/ci.yml`（每次 push / PR）**

- ✅ **research bundle 语法检查**：node --check 全部 bundle / ai-worker / gateway / mcp
- ✅ **MySQL init SQL 检查**：infra/mysql-init/V1__init.sql 存在且含建表语句
- ✅ **Compose 校验**：docker compose config --quiet

**`.github/workflows/cd.yml`（push 到 main / 手动触发）**

- 不再构建 backend / ai-service 镜像（服务已移除）
- 可选自动部署：在 GitHub Repo Settings → Secrets and variables 配置后，push 到 main 会自动 SSH 部署（服务器拉代码 → `docker compose up -d` → `dsh-gateway.sh start`）：
  - **Variables**：`DEPLOY_ENABLED=true`、`DEPLOY_PATH=/opt/researchos`
  - **Secrets**：`DEPLOY_HOST`、`DEPLOY_USER`、`DEPLOY_SSH_KEY`

### 4.2 生产服务器部署

```bash
# 服务器上克隆仓库
git clone https://github.com/uaenamyf/AI-research-manager-OS.git /opt/researchos
cd /opt/researchos

# 配置 .env（含 STRIPE_* / GOOGLE_* / LLM key 等）
cp .env.example .env
vi .env

# 启动数据库（postgres + mysql）
cd infra && docker compose --env-file ../.env up -d && cd ..

# 启动 DSH（应用层，需 Node 22 + deepseek-harness-master checkout）
bash scripts/dsh-gateway.sh start
```

> DSH checkout（`deepseek-harness-master/`）默认被 gitignore，服务器需自行放置或配置
> `DSH_HOME_CHECKOUT` 环境变量指向外部 checkout。

### 4.3 本地执行验证

```bash
# 语法检查（research 融合包）
ROOT=deepseek-harness-master/packages/researchos
find "$ROOT" -name '*.js' -not -path '*/node_modules/*' -print0 | xargs -0 -n1 node --check

# compose 校验
docker compose -f infra/docker-compose.yml config --quiet
```

---

## 5. 常见问题

### Q1: 数据库未初始化（表不存在）

**A**: MySQL 建表脚本在 `infra/mysql-init/V1__init.sql`，仅对**空数据卷**执行一次。
已存在的卷不会重跑，可重置：

```bash
cd infra && docker compose down -v && docker compose up -d
```

### Q2: DSH 启动失败 / 3080 无响应

**A**: 检查：
1. 网关日志：`make logs`（`.dsh-gateway.log`）
2. `.env` 是否齐全（`OPENAI_API_KEY` / `OPENAI_BASE_URL` 为必填，`scripts/dsh-gateway.sh` 启动时校验）
3. DSH checkout 是否存在：`deepseek-harness-master/`

### Q3: DSH GUI 调用接口报错

**A**: 检查：
1. DSH 是否运行：`curl http://127.0.0.1:3080`
2. bundle 路由是否正常：`curl http://127.0.0.1:3080/research-<domain>/...`
3. 浏览器控制台查看具体错误信息

### Q4: LLM API 调用失败

**A**: 检查：
1. `OPENAI_API_KEY` / `RESEARCH_LLM_UPSTREAM_BASE_URL` / `OPENAI_DEFAULT_MODEL` 配置正确
2. 网络连通性（火山引擎需要国内网络）
3. 网关直连验证：`curl http://127.0.0.1:3080/v1/chat/completions`

### Q5: 论文 PDF 无法打开

**A**: 检查：
1. research-file 存储目录 `~/.researchos/uploads` 中文件是否存在
2. MySQL `paper.pdf_url` 与本地文件 key 是否对应

---

## 6. 测试覆盖

### 融合包（researchos bundles / ai-worker / gateway / mcp）
- [x] JS 语法检查（node --check，CI 全量）
- [x] Compose 配置校验（CI）
- [ ] 浏览器端到端验证（研究区：目录树 / 论文详情 / PDF 打开 / 分析链路）

### legacy（已移除，git 历史可回退）
- 后端 68 用例 / AI 服务 72 用例的历史测试记录见 git 历史 `HEAD:backend/`、`HEAD:ai-service/`。

---

## 7. 版本更新流程

```bash
# 1. 拉取最新代码
git pull

# 2. 重启 DSH
bash scripts/dsh-gateway.sh stop || true
bash scripts/dsh-gateway.sh start

# 3. 数据库升级（如有 schema 变更：对已有卷执行对应迁移）
cd infra && docker compose up -d

# 4. 验证
docker compose ps
curl http://127.0.0.1:3080
```
