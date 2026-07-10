import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 后端 API 代理，避免开发时跨域问题
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
