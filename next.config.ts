import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev`/`next build` reescrevem CLAUDE.md a cada execução, anexando um
  // bloco <!-- BEGIN:nextjs-agent-rules --> no fim do arquivo (ver
  // node_modules/next/dist/server/lib/generate-agent-files.js). O repositório
  // já mantém suas próprias regras de agente em CLAUDE.md e .claude/rules/ —
  // o bloco gerado só produz diff sujo em toda sessão de dev/build.
  agentRules: false,
};

export default nextConfig;
