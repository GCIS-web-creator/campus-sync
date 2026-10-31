import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 自作AIの重み(lib/campus-ai/weights)を /api/campus-ai のサーバーレス関数に同梱する
  outputFileTracingIncludes: {
    "/api/campus-ai": ["./lib/campus-ai/weights/**/*"],
    "/api/weather/icons/[name]": ["./weather_icons (2).zip"],
  },
};

export default nextConfig;
