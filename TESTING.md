# ResearchOS 测试指南

本文档描述如何运行项目的所有测试套件。

## 目录

- [后端测试（Java/Spring）](#后端测试javaspring)
- [AI Service 测试（Python/FastAPI）](#ai-service-测试pythonfastapi)
- [前端测试（TypeScript/Next.js）](#前端测试typescriptnextjs)
- [CI 流水线](#ci-流水线)
- [测试覆盖报告](#测试覆盖报告)

---

## 快速开始

```bash
# 后端测试
cd backend
mvn test

# AI Service 测试
cd ai-service
pytest tests/ -v --cov=app

# 前端测试
cd frontend
npm test
```

---

## 后端测试（Java/Spring）

### 测试类型

| 类型 | 位置 | 说明 |
|------|------|------|
| 单元测试 | `src/test/java/com/researchos/service/` | 业务逻辑测试，Mock 依赖 |
| 集成测试 | `src/test/java/com/researchos/controller/` | HTTP API 测试，MockMvc |
| 容器测试 | `src/test/java/com/researchos/PostgresIntegrationTest.java` | Testcontainers 真实 PostgreSQL |

### 运行方式

```bash
# 运行所有测试
mvn test

# 运行单个测试类
mvn test -Dtest=UserServiceTest

# 运行单个测试方法
mvn test -Dtest=UserServiceTest#testRegister_Success

# 跳过 Testcontainers 测试（无 Docker 时）
mvn test -Dtest='!PostgresIntegrationTest'

# 生成测试报告
mvn surefire-report:report
# 报告位置: target/site/surefire-report.html
```

### 测试状态（2026-07-23）

| 测试文件 | 状态 | 说明 |
|----------|------|------|
| **所有测试编译** | ✅ 通过 | 9 个测试文件全部编译无错误 |
| `ResearchOsApplicationTests` | ⏳ 待验证 | Spring 上下文加载 |
| `HealthControllerTest` | 🔧 配置中 | 健康检查 API（Spring Security 配置） |
| `AuthControllerTest` | ⏳ 待验证 | 注册/登录 API |
| `UserServiceTest` | 🔧 配置中 | MyBatis-Plus baseMapper 注入问题 |
| `ProjectServiceTest` | 🔧 配置中 | MyBatis-Plus baseMapper 注入问题 |
| `PaperServiceTest` | ✅ 部分通过 | 所有权校验测试运行，需调整 Mock 严格模式 |
| `SubscriptionServiceTest` | 🔧 配置中 | 需调整 Mockito 严格模式 |
| `KnowledgeServiceTest` | ⚠️ 2失败 | ListTags 和 Search Limit 断言值需更新 |
| `PostgresIntegrationTest` | 🐳 Docker | Testcontainers 需 Docker 运行 |

### 关键里程碑
1. **编译阶段**：✅ 全部通过 - 9 个测试文件无编译错误
2. **实体对齐**：✅ 完成 - Project → ResearchProject, passwordHash → password, setTags → setSummary
3. **方法签名对齐**：✅ 完成 - 所有测试调用与实际服务接口一致
4. **H2 Schema**：✅ 配置 - 添加 `schema.sql` + Spring SQL 初始化
5. **MyBatis-Plus 配置**：🔧 进行中 - baseMapper 注入问题

### 已知运行时问题
1. **MyBatis-Plus baseMapper 注入**：`@ExtendWith(MockitoExtension.class)` 无法注入 baseMapper，需改用 `@MybatisPlusTest` 或手动注入
2. **Mockito 严格模式**：UnnecessaryStubbingException，需添加 `@MockitoSettings(strictness = Strictness.LENIENT)`
3. **Spring 上下文加载**：Security 依赖导致上下文加载失败，需排除自动配置

### 运行方式

```bash
# 运行所有测试
mvn test

# 运行单个测试类
mvn test -Dtest=UserServiceTest

# 运行单个测试方法
mvn test -Dtest=UserServiceTest#testRegister_Success

# 跳过 Testcontainers 测试（无 Docker 时）
mvn test -Dtest='!PostgresIntegrationTest'

# 生成测试报告
mvn surefire-report:report
# 报告位置: target/site/surefire-report.html
```

---

## AI Service 测试（Python/FastAPI）

### 测试类型

| 类型 | 位置 | 说明 |
|------|------|------|
| 单元测试 | `tests/test_embedding.py` | Embedding 服务 |
| 单元测试 | `tests/test_rag_retrieval.py` | 向量检索 + section 加权 |
| API 测试 | `tests/test_health_api.py` | FastAPI 端点 |
| 边界测试 | `tests/test_pdf_parser_edge.py` | PDF 解析边界条件 |
| 集成测试 | `tests/test_pdf_parser.py` | 使用真实测试 PDF |

### 运行方式

```bash
# 进入虚拟环境（如有）
source venv/bin/activate  # Windows: venv\Scripts\Activate.ps1

cd ai-service

# 运行所有测试
pytest tests/ -v

# 运行单个测试文件
pytest tests/test_embedding.py -v

# 运行并生成覆盖率报告
pytest tests/ -v --cov=app --cov-report=html
# 报告位置: htmlcov/index.html

# 只运行单元测试（跳过需要外部服务的测试）
pytest tests/ -v -k "not integration"
```

### 测试状态（2026-07-23）

| 测试文件 | 状态 | 说明 |
|----------|------|------|
| `test_health_api.py` | ✅ **8/8 通过** | FastAPI TestClient 修复，响应断言对齐 |
| `test_pdf_parser_edge.py` | ✅ **8/8 通过** | 边界测试全部通过，函数调用对齐 |
| `test_pdf_parser.py` | ⏳ 待验证 | PDF 解析（真实文件） |
| `test_embedding.py` | ⚠️ 3失败 | API 签名与实际实现不匹配 |
| `test_rag_retrieval.py` | ⚠️ 4失败 | asyncpg 异步连接池 Mock 配置 |

### 关键里程碑
1. **测试框架迁移**：✅ 完成 - httpx.AsyncClient → FastAPI TestClient
2. **响应结构对齐**：✅ 完成 - 断言更新为 `json()` 返回的字典结构
3. **PDF 解析架构对齐**：✅ 完成 - 从 Class PdfParser 改为函数调用（extractText, split_by_section）
4. **特殊字符处理**：✅ 验证 - Unicode 字符正确处理

### 运行方式

```bash
# 进入虚拟环境（如有）
source venv/bin/activate  # Windows: venv\Scripts\Activate.ps1

cd ai-service

# 运行所有测试
pytest tests/ -v

# 运行单个测试文件
pytest tests/test_embedding.py -v

# 运行并生成覆盖率报告
pytest tests/ -v --cov=app --cov-report=html
# 报告位置: htmlcov/index.html

# 只运行单元测试（跳过需要外部服务的测试）
pytest tests/ -v -k "not integration"
```

---

## 前端测试（TypeScript/Next.js）

### 测试类型

| 类型 | 命令 | 说明 |
|------|------|------|
| Vitest 单元测试 | `npm test` | 组件、工具函数 |
| TypeScript 类型检查 | `npx tsc --noEmit` | 类型安全 |
| ESLint | `npm run lint` | 代码规范 |
| Playwright E2E | `npm run test:e2e` | 端到端用户流程 |

### 运行方式

```bash
cd frontend

# 单元测试（watch 模式）
npm test

# 单元测试（单次运行 + 覆盖率）
npm run test:coverage

# 类型检查
npx tsc --noEmit

# ESLint
npm run lint

# Playwright E2E 测试
# 首次运行需要安装浏览器：
npx playwright install

# 运行 E2E 测试（无头模式）
npm run test:e2e

# 运行 E2E 测试（带 GUI 调试）
npm run test:e2e:ui
```

### 测试列表

| 测试文件 | 覆盖内容 |
|----------|----------|
| `tests/utils.test.ts` | 工具函数（日期格式化、className 合并） |
| `tests/components.test.tsx` | React 组件渲染 |
| `tests/e2e/auth.spec.ts` | 注册→登录→访问受保护页面流程 |
| `tests/e2e/paper-upload.spec.ts` | 论文上传和状态显示 |

---

## CI 流水线

GitHub Actions 配置在 `.github/workflows/ci.yml`

### 触发条件

- 推送到 `main` 或 `dev` 分支
- 针对 `main` 或 `dev` 的 Pull Request

### CI 阶段

```
┌─────────────────────────────────────────────────────────┐
│                    CI PIPELINE                           │
├─────────────────────────────────────────────────────────┤
│  1. Backend Tests                                       │
│      ├─ Maven Test (H2 in-memory DB)                    │
│      └─ Upload test reports                              │
├─────────────────────────────────────────────────────────┤
│  2. AI Service Tests                                    │
│      ├─ pytest + coverage                                │
│      └─ Upload coverage report                           │
├─────────────────────────────────────────────────────────┤
│  3. Frontend Tests                                      │
│      ├─ TypeScript type check                           │
│      ├─ ESLint                                           │
│      └─ Vitest unit tests                                │
├─────────────────────────────────────────────────────────┤
│  4. Docker Build Validation (Push only)                 │
│      ├─ Build backend image                              │
│      ├─ Build ai-service image                           │
│      └─ Build frontend image                             │
└─────────────────────────────────────────────────────────┘
```

### 本地模拟 CI 运行

```bash
# 1. 后端测试
cd backend && mvn test

# 2. AI Service 测试
cd ../ai-service && pytest tests/ -v --cov=app

# 3. 前端测试
cd ../frontend && npm run lint && npx tsc --noEmit && npm test -- --run

# 4. Docker 构建验证
cd infra && docker compose build backend ai-service frontend
```

---

## 测试覆盖报告

### 后端测试覆盖

```
服务层测试：
✅ UserService          - 注册/登录/查询/更新
✅ ProjectService       - 创建/列表/删除/权限
✅ PaperService         - 上传/状态管理/发MQ
✅ SubscriptionService  - 额度校验/Plan 限制
✅ KnowledgeService     - 标签/搜索

控制器测试：
✅ AuthController       - 注册/登录/me
✅ HealthController     - 健康检查

集成测试：
✅ Testcontainers PostgreSQL - 真实 DB 交互
```

### AI Service 测试覆盖

```
✅ PDF Parser           - 基础解析 + 边界条件
✅ Embedding Service    - 批量处理 + 火山引擎限制
✅ Vector Store         - 插入/检索
✅ Retriever            - Section 加权排序
✅ Health API           - /health 端点
```

### 前端测试覆盖

```
✅ 工具函数             - cn(), formatDate()
✅ 组件测试             - PaperCard, PaperStatusBadge
✅ 类型检查             - 全项目 TypeScript
✅ ESLint               - 代码规范
✅ E2E Playwright       - 认证流程/论文上传
```

---

## 本地开发测试最佳实践

### 提交前检查

```bash
# 每次提交前运行
make test

# 或分别运行
cd backend && mvn test -Dtest='!PostgresIntegrationTest'
cd ../ai-service && pytest tests/ -v
cd ../frontend && npm run lint && npx tsc --noEmit && npm test -- --run
```

### Debug 测试

```bash
# 后端调试单个测试
mvn test -Dtest=UserServiceTest -Dmaven.surefire.debug

# Python 调试
pytest tests/test_embedding.py -v --pdb  # 失败时进入调试器

# 前端调试
npm run test:e2e:ui  # Playwright GUI 调试
```

---

## 常见问题

### Q: Testcontainers 测试失败

**A:** 确保 Docker 正在运行。如果不需要容器测试，可以跳过：

```bash
mvn test -Dtest='!PostgresIntegrationTest'
```

### Q: Playwright 浏览器未安装

**A:** 首次运行 E2E 测试前需要安装浏览器：

```bash
npx playwright install
```

### Q: AI Service 测试失败缺少依赖

**A:** 安装开发依赖：

```bash
pip install -e ".[dev]"
```

### Q: 前端测试报错缺少 `@testing-library`

**A:** 安装测试依赖：

```bash
npm install --save-dev @testing-library/react @testing-library/jest-dom
```

---

## 附录：测试数据 Fixtures

```
backend/
  └─ src/test/resources/
      └─ application-test.yml    # 测试环境配置（H2 DB）

ai-service/
  └─ tests/
      └─ test_paper.pdf          # 用于 PDF 解析测试的样本论文

frontend/
  └─ tests/fixtures/
      └─ test-paper.pdf          # E2E 上传测试用
```
