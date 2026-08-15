import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 部署：独立输出模式
  output: "standalone",

  // 后端 API 代理，避免开发时跨域问题
  // 服务端代理在容器内执行：localhost 指向容器自身，必须用容器网络内的内部地址
  // （BACKEND_INTERNAL_URL，如 http://backend:8080）；浏览器端请直接用 NEXT_PUBLIC_API_URL 直连。
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
