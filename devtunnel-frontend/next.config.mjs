/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Public, open-source project pages will eventually be prerendered/SSG'd
  // (see Frontend_Development_Rules.txt, rule 27). The auth module built in
  // this pass is intentionally private/app-shell, so no special export mode
  // is forced here — routes decide their own rendering strategy.
  images: {
    remotePatterns: [
      // GitHub avatars, used for the authenticated user's profile photo.
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
};

export default nextConfig;
