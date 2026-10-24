import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 自作AIの重み(lib/campus-ai/weights)を /api/campus-ai のサーバーレス関数に同梱する
  outputFileTracingIncludes: {
    "/api/campus-ai": ["./lib/campus-ai/weights/**/*"],
  },
};

export default nextConfig;
