import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typedRoutes: true,
  poweredByHeader: false,
  async redirects() {
    return [{ source: '/app', destination: '/dashboard', permanent: false }];
  },
  async rewrites() {
    const target = process.env.API_PROXY_TARGET?.replace(/\/+$/, '');
    return target
      ? [{ source: '/v1/:path*', destination: `${target}/v1/:path*` }]
      : [];
  },
};

export default nextConfig;
