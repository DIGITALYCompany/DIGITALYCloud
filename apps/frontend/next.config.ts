import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Type-check every <Link href> and router.push() target against the real route tree.
  typedRoutes: true,
  poweredByHeader: false,
  allowedDevOrigins: ['chowtime-silliness-nervy.ngrok-free.dev'],
  async redirects() {
    return [{ source: '/app', destination: '/dashboard', permanent: false }];
  },
  // Dev tunnels (ngrok): serve the API from the frontend's origin so its cookies are first-party.
  async rewrites() {
  const target = process.env.API_PROXY_TARGET?.replace(/\/+$/, '');

  return [
    {
      source: '/demo/http-test/:path*',
      destination: 'http://127.0.0.1:55811/:path*',
    },
    ...(target
      ? [{ source: '/v1/:path*', destination: `${target}/v1/:path*` }]
      : []),
  ];
},
};

export default nextConfig;
