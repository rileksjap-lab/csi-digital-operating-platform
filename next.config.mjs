/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict mode for catching React bugs early
  reactStrictMode: true,

  // Server-side env vars validated at startup — prevent silent misconfiguration
  serverRuntimeConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    sessionSecret: process.env.SESSION_SECRET,
    oidcProviderUrl: process.env.OIDC_PROVIDER_URL,
    oidcClientId: process.env.OIDC_CLIENT_ID,
    oidcClientSecret: process.env.OIDC_CLIENT_SECRET,
    fastApiWorkerUrl: process.env.FASTAPI_WORKER_URL,
  },

  // Public env vars (safe to expose to browser)
  publicRuntimeConfig: {
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
  },
};

export default nextConfig;
