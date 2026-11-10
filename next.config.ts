import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Weather icon files are extracted to public/ before next build.
  // Keep the historical API URL stable while serving pre-generated static assets.
  async rewrites() {
    return [
      {
        source: "/api/weather/icons/:name",
        has: [{ type: "query", key: "format", value: "png" }],
        destination: "/weather-icons/:name.png",
      },
      {
        source: "/api/weather/icons/:name",
        destination: "/weather-icons/:name.svg",
      },
    ];
  },
};

export default nextConfig;
