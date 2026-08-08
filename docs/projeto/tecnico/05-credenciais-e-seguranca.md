# 05 — Credenciais e segurança

> Cobre a senha de acesso do assinante ao serviço, as credenciais dos canais de WhatsApp, autenticação, logs e LGPD.

## O que mudou em relação ao spec original

O spec do SaaS exige *envelope encryption* — DEK por tenant, KEK em KMS. Aqui não há tenants: uma chave mestra única, guardada no Secret Manager e montada como variável de ambiente no Cloud Run, cobre o mesmo risco com uma peça a menos.

O que **não** mudou: credencial criptografada em repouso, mascarada na tela, auditada ao ser revelada, e fora de log, export e mensagem.

---

## Criptografia

AES-256-GCM, IV aleatório por operação, tag de autenticação verificada na leitura.

```ts
// src/lib/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

const KEY = Buffer.from(requireEnv('CREDENTIAL_KEY'), 'base64');   // 32 bytes
if (KEY.length !== 32) throw new Error('CREDENTIAL_KEY deve ter 32 bytes em base64');

/** Formato: v1:<iv>:<ciphertext>:<tag>, tudo em base64. */
export function encrypt(plain: string, purpose: CryptoPurpose): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  cipher.setAAD(Buffer.from(purpose));
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv, ct, cipher.getAuthTag()].map(toB64).join(':');
}

export function decrypt(payload: string, purpose: CryptoPurpose): string { /* espelho */ }

type CryptoPurpose = 'subscription.accessPassword' | 'channel.credentials';
```

Notas de projeto:

- **Prefixo de versão (`v1`)** permite rotacionar a chave depois: `v2` passa a ser escrito, `v1` continua legível durante a migração.
- **AAD por finalidade** impede que um ciphertext de credencial de canal seja colado num campo de senha de assinante e decifre. Não impede troca entre dois registros do *mesmo* campo — para o risco deste sistema, o custo de amarrar ao id não se paga.
- **A chave nunca vai para o repositório.** `.env.local` em desenvolvimento, Secret Manager em produção.
- Falha de decifragem é erro explícito, nunca string vazia silenciosa.

### Rotação de chave

Procedimento, para constar no runbook de entrega: gera chave nova, publica como `CREDENTIAL_KEY_V2`, roda o script que relê cada registro com a chave antiga e regrava com a nova, e só então remove a antiga. Nada disso é automático — é operação manual e rara.

---

## Senha de acesso do assinante

`Subscription.accessPasswordEnc`. É a razão pela qual o operador fecha a planilha: se a credencial não estivesse aqui, ele manteria as duas abertas.

| Item | Decisão |
|---|---|
| `accessUsername` | **Em claro.** É identificador, e o operador precisa buscar por ele. Sozinho, não dá acesso. |
| `accessPasswordEnc` | **Criptografado.** Nunca trafega para o cliente sem ação explícita. |
| `accessServer`, `screens`, `accessNotes` | Em claro. |

### Regras

1. **Mascarada por padrão.** A ficha mostra `••••••••` e um botão "revelar".
2. **Revelar é uma Server Action dedicada** que grava `CredentialReveal` (assinatura, usuário, timestamp, IP) **antes** de devolver o texto. Sem gravação, sem retorno.
3. **Nunca em log, em Sentry, em mensagem de erro, em template de WhatsApp nem em export CSV.**
4. O DTO padrão de assinatura **não inclui** o campo. Só a action de revelar o devolve.
5. A senha não fica em estado de cliente além do necessário — some ao fechar o diálogo ou navegar.

⚠️ Um `console.log(subscription)` numa Server Action derruba tudo isso. Regra do projeto: `console.log` não passa em review; log é `logger.info({ subscriptionId })`, com ids, nunca objetos inteiros.

---

## Credenciais de canal

`ChannelConfig.credentials` guarda um JSON criptografado, com forma diferente por provider:

```ts
type MetaCloudCredentials  = { phoneNumberId: string; accessToken: string; wabaId: string };
type EvolutionCredentials  = { baseUrl: string; apiKey: string; instance: string };
type SalvyCredentials      = { apiKey: string };
```

- Nunca voltam para o cliente, nem mascaradas. A tela mostra "configurado em DD/MM" e um botão de substituir.
- O teste de conexão roda no servidor e devolve só `ok` ou a mensagem de erro **do provider**, sem eco da credencial.
- ⚠️ Erro do provider pode conter o token na URL. O adapter sanitiza antes de gravar em `lastError`.

---

## Autenticação

Um usuário, sem OAuth, sem convite, sem recuperação por e-mail.

- **Senha:** argon2id, parâmetros padrão da `@node-rs/argon2`. Nunca bcrypt com custo baixo, nunca SHA.
- **Sessão:** JWT assinado com `SESSION_SECRET` (HS256), em cookie `httpOnly`, `secure`, `sameSite=lax`, `path=/`, validade 30 dias com renovação deslizante.
- **Middleware** protege tudo em `(app)/`. Fora: `(auth)/login` e `/api/cron/*`.
- **Rate limit no login:** 5 tentativas por IP em 15 minutos, contadas em tabela. Sem Redis.
- **Troca de senha** exige a senha atual e invalida as sessões existentes (bump de um `sessionVersion` no `User`, conferido no middleware).

---

## Endpoints de cron

Cloud Scheduler chama com token OIDC. O handler valida emissor e audiência com `google-auth-library`; token ausente ou inválido devolve 401 sem corpo.

`CRON_OIDC_AUDIENCE` precisa bater byte a byte com a audiência configurada no job do Cloud Scheduler (URL completa do endpoint, barra final incluída ou não conforme o job) — divergência de um caractere derruba a verificação e vira 401.

```ts
// src/app/api/cron/dunning-evaluate/route.ts
export async function POST(req: Request) {
  await assertCloudSchedulerToken(req);   // 401 se falhar
  const result = await evaluateDunning({ now: new Date() });
  return Response.json(result);
}
```

⚠️ Estes endpoints escrevem no banco e disparam mensagem. Sem autenticação, qualquer um na internet dispara a régua inteira. Não existe versão "por enquanto sem auth".

---

## Export CSV

⚠️ Célula que começa com `=`, `+`, `-` ou `@` é fórmula quando o arquivo abre no Excel. Prefixar com `'`.

```ts
export function csvCell(value: string): string {
  const escaped = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${escaped.replace(/"/g, '""')}"`;
}
```

Senha de acesso **não entra em export**, com ou sem opção.

---

## Logs

JSON estruturado em `stdout` — o Cloud Run agrega sozinho.

Cada linha carrega: `requestId`, `userId`, `route`, `durationMs`, `status`.

Nunca carrega: senha, token, credencial, corpo de mensagem enviada, telefone completo, documento.

---

## LGPD

A base tem nome, telefone e credencial de centenas de pessoas.

**Durante o desenvolvimento:** dados anonimizados. A base real entra só no ambiente do cliente, no fim do projeto. Se for preciso dado real para depurar, autorização por escrito e descarte ao terminar.

**Direito de eliminação:** função `anonymizeCustomer(id)` que substitui nome, telefone, e-mail, documento e credenciais por valores neutros e marca o registro. **Não é `deletedAt`.** O histórico financeiro (cobranças e pagamentos) é preservado — obrigação fiscal —, mas deixa de ser vinculável a uma pessoa.

**Retenção:** mensagens enviadas guardam o corpo por 12 meses; depois, só metadado (data, canal, status). Isso reduz a superfície de um vazamento sem perder a timeline.

---

## Backup

Neon faz *point-in-time recovery* no plano free com janela curta. Além dele:

- Dump diário via job para um bucket do Cloud Storage na conta do cliente, retenção de 30 dias.
- ⚠️ **Restore testado antes da entrega final.** Backup nunca testado é backup que não existe — isso entra no critério de pronto da etapa 4.

---

## Checklist de segurança da entrega

- [ ] `CREDENTIAL_KEY` e `SESSION_SECRET` no Secret Manager, nunca no repositório
- [ ] `.env*` no `.gitignore`, verificado no primeiro commit
- [ ] Senha de acesso não aparece em nenhum DTO padrão — verificado por busca no código
- [ ] Revelar credencial grava `CredentialReveal` antes de devolver
- [ ] Endpoints de cron rejeitam requisição sem token OIDC
- [ ] Export CSV escapa `=`, `+`, `-`, `@` e não contém senha
- [ ] Nenhum `console.log` no código de produção
- [ ] Erro de provider sanitizado antes de gravar em `lastError`
- [ ] Restore de backup executado com sucesso pelo menos uma vez
- [ ] Contas de nuvem, banco e canais criadas no nome do cliente, não no seu
