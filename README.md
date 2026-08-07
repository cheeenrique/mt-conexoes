# mt-conexoes

## Rodando localmente

```bash
cp .env.example .env.local
docker compose up -d db
pnpm install
pnpm dlx prisma migrate deploy
pnpm dev
```

Testes:

```bash
pnpm test              # suíte unitária
pnpm test:integration  # suíte de integração — precisa do banco (docker compose up -d db)
```

⚠️ O `docker-compose.yml` mapeia o Postgres no host na porta **5442** (não 5432) — colisão com outro projeto local forçou esse remapeamento. `DATABASE_URL` em `.env.example`/`.env.local` já aponta para `localhost:5442`. Dentro da rede docker o container continua respondendo na 5432 padrão.
