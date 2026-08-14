# Frontend Dockerfile - Next.js 16
# 多阶段构建：依赖安装 + 构建 + 生产运行

# ────────────────────────────────────────────────────────────
# 依赖安装阶段
# ────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# 拷贝 package 配置
COPY package.json package-lock.json* ./

# 安装依赖（生产模式，跳过 devDependencies）
RUN npm ci --only=production

# ────────────────────────────────────────────────────────────
# 构建阶段
# ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# 拷贝全部依赖（包括 devDependencies 用于构建）
COPY package.json package-lock.json* ./
RUN npm ci

# 拷贝源码
COPY src ./src
COPY public ./public
COPY next.config.ts ./
COPY tailwind.config.ts ./
COPY postcss.config.js ./
COPY tsconfig.json ./
# ESLint 9 flat config（Next.js 16 原生支持）
COPY eslint.config.mjs ./

# Next.js 构建时需要的环境变量（运行时注入的放 .env 或 compose 中）
ENV NEXT_TELEMETRY_DISABLED=1

# 执行构建
RUN npm run build

# ────────────────────────────────────────────────────────────
# 运行阶段：生产镜像
# ────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 创建非 root 用户运行（安全最佳实践）
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 从构建阶段拷贝必要文件
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000

# 健康检查（alpine 无 GNU wget，使用 node 内置 fetch）
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/').then(r=>{if(!r.ok)process.exit(1);process.exit(0)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
