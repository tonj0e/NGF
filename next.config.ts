import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hostinger's build box runs out of threads with the default (one worker per host CPU, 61 there): builds died with SIGABRT.
  experimental: { cpus: 4 },
  allowedDevOrigins: ['192.168.1.5', '192.168.1.10', 'Tonys-Mac-mini.local', '*.ngrok-free.app', '*.ngrok-free.dev', '*.ngrok.app', '*.ngrok.io'],
};

export default nextConfig;
