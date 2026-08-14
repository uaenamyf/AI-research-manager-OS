# Backend Dockerfile - Spring Boot 3 + Java 21
# 多阶段构建：Maven 构建 + JRE 运行

# ────────────────────────────────────────────────────────────
# 构建阶段：Maven 编译打包
# ────────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-21 AS builder

WORKDIR /app

# 先拷贝 pom.xml，利用 Docker 缓存依赖
COPY pom.xml ./
# 使用阿里云 Maven 镜像加速（国内网络环境）
COPY settings.xml /root/.m2/settings.xml
RUN mvn dependency:go-offline -B

# 拷贝源码并构建
COPY src ./src
RUN mvn clean package -DskipTests -B

# ────────────────────────────────────────────────────────────
# 运行阶段：精简 JRE 镜像
# ────────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# 安装必要工具（alpine 镜像精简）
RUN apk add --no-cache tzdata curl

# 时区配置
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 从构建阶段拷贝 jar
COPY --from=builder /app/target/*.jar app.jar

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

EXPOSE 8080

# 启动命令（支持 JVM 调优参数注入）
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
