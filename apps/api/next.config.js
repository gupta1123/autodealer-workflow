/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep production builds separate from the cache used by `next dev`.
  // Running a build while the local API is open must not corrupt the dev server.
  distDir: process.env.NODE_ENV === "production" ? ".next-build" : ".next",
  turbopack: {
    root: `${process.cwd()}/../..`,
  },
};

module.exports = nextConfig;
