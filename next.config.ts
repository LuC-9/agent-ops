import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  transpilePackages: ["antd", "@ant-design/icons", "rc-util", "rc-pagination", "rc-picker"],
  // next dev --hostname 0.0.0.0 treats 127.0.0.1 / localhost as cross-origin and
  // blocks /_next/hmr (invalid WebSocket handshake + error overlay in the browser).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
