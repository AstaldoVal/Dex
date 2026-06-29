import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Note: if you run `next build` from the Dex repo root and see a lockfile warning, run the
  // build from this directory, or remove the root `package-lock.json` from the path Next scans.
};

export default nextConfig;
