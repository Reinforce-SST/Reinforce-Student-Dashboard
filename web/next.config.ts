import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next generates its own AGENTS.md/CLAUDE.md here. The repository already
  // has a curated AGENTS.md at the root; a second, generated one in web/
  // would shadow it for anyone working in this directory.
  agentRules: false,
};

export default nextConfig;
