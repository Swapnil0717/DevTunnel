/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Contributor avatars come from GitHub — see AuthUser.avatarUrl.
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
  // Public, non-secret runtime values only. Never place OAuth client
  // secrets, signing keys, or API keys prefixed with NEXT_PUBLIC_ here —
  // anything exposed to the browser is not secret (see rule 19).
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  },
};

export default nextConfig;
