import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// Root .env is shared across the monorepo (see .env.example) — Next.js only
// auto-loads .env files from this app's own directory, so load the shared
// one explicitly, same as apps/agent/src/config.ts and drizzle.config.ts.
const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "../../.env") });

const nextConfig: NextConfig = {
  // @puno/shared ships TypeScript source directly (no build step) — Next
  // needs to run it through its own compiler like first-party app code.
  transpilePackages: ["@puno/shared"],
  webpack: (config, { webpack }) => {
    // @puno/shared's internal relative imports use the NodeNext-style ".js"
    // extension convention (required for apps/agent's tsx/Node ESM runtime —
    // see tsconfig.base.json's verbatimModuleSyntax) which tsc maps to the
    // sibling ".ts" file. Plain webpack resolves ".js" literally, so without
    // this alias it can't find those files.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    // wagmi/connectors' single barrel export pulls in Coinbase's "Base
    // Account" connector (we only use `injected`), whose optional
    // x402-payments code path dynamically imports packages that are never
    // installed on purpose — ignore them so webpack doesn't fail resolving
    // code that's never reached since we never construct that connector.
    config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^@x402\// }));
    return config;
  },
};

export default nextConfig;
