import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev`/`next build` reescrevem CLAUDE.md a cada execução, anexando um
  // bloco <!-- BEGIN:nextjs-agent-rules --> no fim do arquivo (ver
  // node_modules/next/dist/server/lib/generate-agent-files.js). O repositório
  // já mantém suas próprias regras de agente em CLAUDE.md e .claude/rules/ —
  // o bloco gerado só produz diff sujo em toda sessão de dev/build.
  agentRules: false,

  // O Cloud Run cobra por request e mantém zero instância ociosa — cada cron e
  // cada primeira visita depois de um tempo parado paga o boot do servidor.
  // `standalone` emite só o node_modules que o runtime usa, o que corta a
  // imagem de ~1 GB para a casa das centenas de MB e o cold start junto.
  // ⚠️ O Dockerfile depende disto: ele copia .next/standalone e chama
  // `node server.js`, não `next start`.
  output: 'standalone',
};

export default nextConfig;
