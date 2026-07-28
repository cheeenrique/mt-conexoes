# 12 — Onboarding

## Princípios

**Checklist persistente, não wizard bloqueante.** O operador entra, vê o produto com empty states úteis, e tem um painel de setup sempre acessível. Wizard modal de 8 passos tem abandono alto e impede avaliar o produto antes de investir esforço.

**Progresso derivado do estado real.** ⚠️ Nunca flag marcada manualmente:

```ts
// ERRADO — desincroniza no primeiro rollback de import ou correção de suporte
await tenant.update({ onboarding: { clientsImported: true } });

// CERTO — resolver consulta o estado
const STEPS = {
  import_customers: {
    weight: 25,
    group: 'required',
    isComplete: async (t) => (await countCustomers(t)) > 0,
    dependsOn: ['create_plan'],
  },
};
```

Se o tenant desfizer a importação, o passo volta a pendente sozinho.

**Dois marcos, não um.** Uma barra só gera a dúvida "preciso de 100% para usar?".

**Escopo é o tenant, não o usuário.** Se o Owner convida a atendente, ela não vê "configure sua empresa". `tenant_onboarding` (setup, compartilhado) é separado de `user_tour` (tour de interface, por usuário).

---

## Passos

### Mínimo operacional — barra principal

| # | Código | Passo | Peso | Depende de |
|---|---|---|---|---|
| 1 | `profile` | Perfil: PF/PJ, nome de exibição, fuso, logo | 10 | — |
| 2 | `create_plan` | Criar ao menos um plano | 10 | `profile` |
| 3 | `import_customers` | Importar clientes (planilha ou manual) | 25 | `create_plan` |
| 4 | `payment_method` | Configurar recebimento (Pix manual ou gateway) | 20 | `profile` |
| 5 | `connect_channel` | Conectar WhatsApp (e-mail já ativo) | 20 | `profile` |
| 6 | `activate_dunning` | Revisar e ativar régua + autoteste | 15 | 3, 4, 5 |

Ao completar: badge **"Pronto para operar"**.

### Recomendado — segunda seção, sem pressão

| # | Código | Passo |
|---|---|---|
| 7 | `invite_team` | Convidar equipe |
| 8 | `customize_templates` | Personalizar templates |
| 9 | `late_fees` | Ajustar multa e juros |
| 10 | `customer_portal` | 🔮 Ativar portal do assinante (fase 3) |
| 11 | `custom_domain` | 🔮 Domínio próprio (plano superior) |

---

## Ordem — e por que ela é assim

**Importar clientes (3) vem antes de conectar WhatsApp (5).** Deliberado:

- Importação gera o momento "uau" — ele vê a base dele dentro do sistema em 5 minutos
- Não depende de terceiro. Verificação da Meta pode levar dias
- Se o passo 2 fosse "conectar WhatsApp", a taxa de abandono dispararia

**Perfil (1) não pede documento.** CPF/CNPJ é opcional aqui e obrigatório só no passo 4, quando o gateway exige. Não travar a primeira tela pedindo documento de quem só quer olhar.

---

## Passo 1 — Perfil

⚠️ O tenant pode ser **pessoa física**. Rótulos adaptativos:

| Campo | PF | PJ |
|---|---|---|
| Título da tela | "Seus dados" | "Dados da empresa" |
| Nome legal | Nome completo | Razão social |
| Documento | CPF (opcional) | CNPJ (opcional) |

**`displayName` é o campo que importa** — é ele que aparece em `{{tenant.display_name}}`, no portal e nas mensagens. Razão social nunca aparece para o assinante.

⚠️ Validar CPF e CNPJ por dígito verificador. Aceitar **CNPJ alfanumérico** — regex de `\d{14}` quebra no formato novo.

---

## Passo 6 — Revisar e ativar (o passo mais importante)

Não é "criar régua". A régua padrão já existe em `DRAFT` desde o primeiro acesso. Este passo é:

1. **Resumo da configuração** — o que está conectado, quantos clientes, quantas cobranças em aberto
2. **Autoteste** executado ao vivo:
   - ✓ Envia mensagem de teste para o número do operador
   - ✓ Gera cobrança de teste e valida o Pix/link
   - ✓ Testa cada integração conectada
3. **Preview de impacto** ⚠️:
   ```
   Ao ativar, 247 mensagens seriam enviadas hoje.
   [Ver lista]  [Ativar e enviar]  [Ativar ignorando retroativos]  [Manter em revisão]
   ```
4. Ativação

Isso conecta com as travas T1–T4 do doc 09. Nada sai automaticamente antes de uma confirmação consciente.

---

## Detalhes de implementação

**Estado `pending_external`.** Verificação da Meta pode ficar dias em análise. Não é "pendente" nem "concluído" — ícone e texto próprios, e conta como desbloqueio parcial. Sem esse estado, o usuário acha que travou.

**Pesos, não contagem.** Importar 400 clientes não vale o mesmo que subir um logo.

**Pular com registro.** Botão "pular por agora" grava `skippedAt`. Se 60% pulam o passo 4, o passo 4 está mal desenhado — e você só descobre isso medindo.

**Empty states apontam para o passo.** Tela de Clientes vazia não mostra "nenhum registro"; mostra "Importe sua planilha para começar" com o botão do passo 3. O onboarding vive dentro do produto.

**Dogfooding.** Cada passo emite evento (`onboarding.step_completed`, `onboarding.stalled`). A própria régua manda o e-mail de "vi que você parou no passo 4". Testa o motor e reduz churn de ativação ao mesmo tempo.

**Métricas obrigatórias.** `firstViewedAt` e `completedAt` por passo. Onde as pessoas empacam é a informação mais valiosa dos primeiros 6 meses.

**Cache.** Recalcular 10 resolvers a cada page load é desperdício. Cache em `TenantOnboarding.cachedProgress` com invalidação por evento e TTL curto.

---

## API

```
GET  /onboarding                  → { progress, requiredSteps[], recommendedSteps[], isReady }
POST /onboarding/steps/:code/skip
POST /onboarding/dismiss
POST /onboarding/self-test        → executa autoteste e retorna diagnóstico
```

Resposta:

```json
{
  "progress": { "required": 65, "recommended": 20, "isReady": false },
  "requiredSteps": [
    { "code": "profile",          "status": "completed", "weight": 10 },
    { "code": "create_plan",      "status": "completed", "weight": 10 },
    { "code": "import_customers", "status": "completed", "weight": 25 },
    { "code": "payment_method",   "status": "completed", "weight": 20 },
    { "code": "connect_channel",  "status": "pending_external", "weight": 20,
      "detail": "Aguardando verificação da Meta (enviado há 2 dias)" },
    { "code": "activate_dunning", "status": "blocked", "weight": 15,
      "blockedBy": ["connect_channel"] }
  ]
}
```
