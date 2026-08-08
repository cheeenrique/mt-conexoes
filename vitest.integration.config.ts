import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup-integration.ts'],
    include: ['src/**/*.integration.test.ts', 'scripts/**/*.integration.test.ts'],
    testTimeout: 15000,
    passWithNoTests: true,
    // Suites de integração compartilham um único Postgres real com constraints
    // globais (ex.: channel_configs_single_default). Rodar arquivos em paralelo
    // causa colisão de unique constraint e afterEach de um arquivo apagando
    // linhas que outro arquivo ainda está usando. Serializa a execução por arquivo.
    fileParallelism: false,
  },
});
