import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hostinger's build box runs out of threads with the default (one worker per host CPU, 61 there): builds died with SIGABRT.
  experimental: { cpus: 4 },
  async headers() {
    return [
      // the service worker file must never be cached by the browser, or app updates would not reach people
      { source: '/sw.js', headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Service-Worker-Allowed', value: '/' },
        { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
      ] },
      { source: '/manifest.webmanifest', headers: [{ key: 'Cache-Control', value: 'public, max-age=3600' }] },
    ]
  },
  allowedDevOrigins: ['192.168.1.5', '192.168.1.10', 'Tonys-Mac-mini.local', '*.ngrok-free.app', '*.ngrok-free.dev', '*.ngrok.app', '*.ngrok.io'],
};

export default nextConfig;
