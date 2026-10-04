import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Type-check every <Link href> and router.push() target against the real route tree.
  typedRoutes: true,
  poweredByHeader: false,
  async redirects() {
    return [{ source: '/app', destination: '/dashboard', permanent: false }];
  },
};

export default nextConfig;
