import type { NextConfig } from "next";

/**
 * Configure Next.js static export with support for GitHub Pages project subpaths.
 * If BASE_PATH is set (e.g. '/trace'), Next.js prefixes all route and asset links.
 * When running in GitHub Actions for genpoputils/trace, defaults to '/trace'.
 */
const getBasePath = (): string => {
  if (process.env.BASE_PATH !== undefined) {
    const bp = process.env.BASE_PATH.trim();
    if (!bp || bp === '/') return '';
    return bp.startsWith('/') ? bp : `/${bp}`;
  }
  if (process.env.GITHUB_ACTIONS && !process.env.CI_CUSTOM_DOMAIN) {
    return '/trace';
  }
  return '';
};

const basePath = getBasePath();

const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  basePath: basePath || undefined,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
