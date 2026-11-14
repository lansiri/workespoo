import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` would otherwise write an AGENTS.md into the checkout. The project's own
  // instructions live in CLAUDE.md and docs/.
  agentRules: false,
  // CV PDF reading: pdf.js is loaded by Node from node_modules, not bundled. The image keeps
  // the full node_modules (Dockerfile), and pdf.js resolves its own files at run time.
  serverExternalPackages: ["unpdf"],
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
