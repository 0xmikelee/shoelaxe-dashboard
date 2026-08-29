import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const nextConfig: NextConfig = {
  images: {
    // Three internal users, images already capped at 2MB by the upload rule and rendered in a
    // 400px rail. The optimiser would add a CPU-bound resize inside the same small container that
    // runs the API, and turning it on means unblocking sharp's build script (deliberately blocked
    // in pnpm-workspace.yaml) and re-verifying musl vs glibc binaries in the Docker image.
    // To re-enable: unoptimized false, qualities [75], sharp true, rebuild.
    unoptimized: true,
    qualities: [75],
    remotePatterns: supabaseUrl
      ? [new URL(`${supabaseUrl}/storage/v1/object/public/product-images/**`)]
      : [],
  },
};

export default nextConfig;
