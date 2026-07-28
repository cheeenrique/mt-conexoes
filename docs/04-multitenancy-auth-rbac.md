# 04 — Multi-tenancy, Autenticação, RBAC e LGPD

## Modelo de isolamento

**Shared database, shared schema, com `tenant_id` em toda tabela de negócio + RLS.**

Descartados: banco por tenant (custo de migration e conexão inviável) e schema por tenant (Prisma não lida bem, migrations viram N execuções).

### RLS — a rede de segurança

Toda tabela com `tenant_id` recebe:

```sql
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON customers
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

⚠️ `FORCE ROW LEVEL SECURITY` é obrigatório — sem ele o owner da tabela ignora a policy.

⚠️ A aplicação conecta com um **role sem `BYPASSRLS`**. Migrations usam role separado.

### Como o contexto chega ao banco

Duas camadas, defesa em profundidade:

**Camada 1 — extension do Prisma (caminho normal).** Injeta `tenantId` em toda operação:

```ts
// packages/db/src/tenant-client.ts
export const tenantClient = (tenantId: string) =>
  prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query, model }) {
          if (!TENANT_SCOPED_MODELS.has(model)) return query(args);
          args.where = { ...args.where, tenantId };
          if (args.data) args.data = { ...args.data, tenantId };
          return query(args);
        },
      },
    },
  });
```

**Camada 2 — RLS (rede de segurança).** Para queries cruas, TypedSQL e scripts, embrulhe em transação com contexto:

```ts
export async function withTenant<T>(tenantId: string, fn: (tx) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}
```

⚠️ `set_config(..., true)` é **local à transação**. Com pooler em modo transaction isso é obrigatório — `SET` global vazaria contexto entre requests.

### Guard de tenant

```ts
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const tenantId = req.user?.activeTenantId;
    if (!tenantId) throw new ForbiddenException('NO_TENANT_CONTEXT');
    if (!req.user.memberships.some(m => m.tenantId === tenantId && m.status === 'ACTIVE'))
      throw new ForbiddenException('NOT_A_MEMBER');
    req.tenantId = tenantId;
    return true;
  }
}
```

Registrado **globalmente**. Rotas públicas (webhooks, health, auth) marcadas com `@Public()`. A lista de exceções é curta e revisada.

### Testes obrigatórios de isolamento ⚠️

Suite que, para **cada** endpoint autenticado, cria dois tenants e verifica que o tenant A não lê, escreve nem deleta recurso de B. Falha aqui bloqueia deploy.

---

## Autenticação

### Estratégia

- E-mail + senha, hash **Argon2id** (`memoryCost` 19 MiB, `timeCost` 2, `parallelism` 1)
- **Access token** JWT, 15 min, em memória no front (nunca `localStorage`)
- **Refresh token** opaco, 30 dias, cookie `httpOnly` `Secure` `SameSite=Lax`, com **rotação** e detecção de reuso
- Detecção de reuso → revoga toda a família de tokens e notifica por e-mail

### Payload do access token

```ts
{
  sub: userId,
  tid: activeTenantId,       // tenant ativo
  rol: 'ADMIN',              // role no tenant ativo
  per: ['charges:write'],    // permissões efetivas
  jti, iat, exp
}
```

Troca de tenant emite novo par de tokens — não é só mudar um header.

### Fluxos

| Fluxo | Regra |
|---|---|
| Cadastro | E-mail verificado por link (24h). Tenant criado no mesmo ato. |
| Login | Rate limit 5 tentativas / 15 min por e-mail **e** por IP |
| Recuperação de senha | Token de uso único, 1h, invalida sessões ativas ao concluir |
| Convite | Token 7 dias, vinculado ao e-mail, define role na criação |
| Sessões ativas | Lista com device, IP, último uso; revogação individual |
| MFA (TOTP) | 🔮 Fase 3 |

⚠️ Resposta de "esqueci a senha" é **sempre idêntica**, exista o e-mail ou não. Evita enumeração de contas.

---

## RBAC

### Papéis

| Papel | Descrição |
|---|---|
| `OWNER` | Criador do tenant. Acesso total, incluindo billing e exclusão da conta. Não removível — só transferível. |
| `ADMIN` | Tudo exceto billing do SaaS e exclusão do tenant |
| `FINANCE` | Cobranças, pagamentos, relatórios financeiros. Sem acesso a integrações |
| `SUPPORT` | Clientes, assinaturas, envio de mensagem. Sem escrita financeira |
| `VIEWER` | Somente leitura |

### Permissões

Formato `recurso:acao`. O papel é um **preset** de permissões; a checagem é sempre sobre a permissão.

```
customers:read|write|delete      subscriptions:read|write|cancel
charges:read|write|void          payments:read|write|refund
dunning:read|write|activate      messages:read|send
integrations:read|write          imports:read|write
reports:read                     users:read|write
settings:read|write              billing:read|write
```

Uso:

```ts
@RequirePermission('charges:write')
@Post('/charges')
create() { ... }
```

⚠️ **Nunca** `if (user.role === 'ADMIN')` espalhado pelo código. Sempre a permissão.

### Regras especiais

- Ninguém escala o próprio papel
- `OWNER` só muda por transferência explícita com confirmação de senha
- Último `OWNER` ativo não pode ser removido nem rebaixado
- Ação de `FINANCE` sobre valor acima de limite configurável exige confirmação de senha 🔮

---

## Auditoria

Toda operação de escrita relevante grava:

```ts
{
  tenantId, userId, action: 'charge.voided',
  entityType: 'Charge', entityId,
  before: {...}, after: {...},     // diff, sem PII desnecessária
  ip, userAgent, requestId, createdAt
}
```

Implementado por interceptor global com decorator `@Audited('charge.voided')`. Registro é **append-only** — sem update, sem delete. Retenção 5 anos.

Sempre auditar: mudanças financeiras, alteração de permissão, conexão/desconexão de integração, importação e rollback, ativação de régua, exportação de dados, login e falha de login.

---

## Segurança da aplicação

| Controle | Implementação |
|---|---|
| Headers | Helmet com CSP restritiva, HSTS, `X-Frame-Options: DENY` |
| CORS | Allowlist explícita — `app.meusaas.com` e localhost em dev |
| Rate limit | Global por IP + por tenant + específico em auth, envio e importação |
| Validação | Zod em todo input via ts-rest. Nada de `any` na borda |
| Idempotência | Header `Idempotency-Key` em toda escrita não-idempotente; ver doc 14 |
| Segredos de integração | Envelope encryption: DEK por tenant, KEK em KMS/env. Rotação documentada |
| Webhooks recebidos | Verificação de assinatura obrigatória + proteção contra replay (timestamp + nonce) |
| SQL cru | Somente TypedSQL ou `$queryRaw` parametrizado. `$queryRawUnsafe` proibido em review |
| Uploads | Tipo e tamanho validados; armazenados fora do webroot; nunca servidos do mesmo domínio da app |
| CSV export | Escapar células iniciadas por `=`, `+`, `-`, `@` (CSV injection) |
| Dependências | `pnpm audit` no CI; Dependabot |

---

## LGPD

### Papéis

O tenant é **controlador** dos dados dos `Customers`. Nós somos **operadores**. Isso precisa estar nos Termos, com DPA disponível.

### Requisitos implementados

| Requisito | Como |
|---|---|
| Base legal | Execução de contrato (cobrança) + consentimento (marketing) |
| Consentimento de canal | `Contact.optInAt`, `optInSource`, `optOutAt`. Sem opt-in não há envio de marketing |
| Opt-out | Palavras-chave (`PARE`, `SAIR`, `CANCELAR`) processadas automaticamente e honradas em **todos** os canais do tenant |
| Direito de acesso | Export do `Customer` em JSON sob solicitação |
| Direito de eliminação | **Anonimização**, não delete — nome, documento e contatos substituídos por hash; registros financeiros preservados por obrigação legal |
| Portabilidade | Export completo do tenant em CSV/JSON |
| Retenção | Financeiro 5 anos · logs de mensagem 12 meses · logs técnicos 90 dias · arquivos de importação 90 dias |
| Incidente | Runbook de notificação em 72h |

⚠️ **Soft delete não satisfaz o direito de eliminação.** `deletedAt` preenchido com dados intactos continua sendo tratamento. Implementar `anonymize()` de verdade.

### Minimização

- Não pedir CPF do `Customer` se não for necessário para o gateway
- Não importar coluna de senha/credencial de sistema de terceiro (ver doc 13)
- Não logar payload de mensagem com conteúdo pessoal em log técnico
