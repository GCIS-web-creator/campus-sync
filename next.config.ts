import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 旧AIモデルの重みは本番APIで使用しない。天気アイコンのZIPだけを必要な関数へ同梱する。
  outputFileTracingIncludes: {
    "/api/weather/icons/[name]": ["./weather_icons (2).zip"],
  },
};

export default nextConfig;
