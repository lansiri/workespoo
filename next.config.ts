import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` would otherwise write an AGENTS.md into the checkout. The project's own
  // instructions live in CLAUDE.md and docs/.
  agentRules: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
