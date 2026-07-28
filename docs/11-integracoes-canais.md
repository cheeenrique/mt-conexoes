# 11 — Integrações de Canais

## E-mail — ativo por padrão

⚠️ Decisão de produto importante: **e-mail funciona desde o minuto zero, sem configuração.** Enviamos via Resend com remetente `no-reply@meusaas.com` e `reply-to` do tenant.

Motivo: o passo "conectar canal" do onboarding nunca pode travar. Verificação da Meta leva dias; instância Evolution pode não subir. Com e-mail já ativo, o tenant sempre tem um canal funcionando.

Configuração de domínio próprio (SPF/DKIM/DMARC) é passo **opcional** posterior, e aumenta entregabilidade.

```ts
capabilities = {
  freeTextOutsideWindow: true,
  requiresApprovedTemplate: false,
  supportsMedia: true, supportsButtons: false,
  sessionWindowHours: null,
  costModel: 'flat',
}
```

⚠️ Processar bounce e complaint do Resend. Endereço com hard bounce entra em supressão automática.

---

## WhatsApp — três providers, capacidades diferentes

⚠️ Este é o ponto onde a abstração ingênua quebra. Os providers **não são intercambiáveis**. O editor de templates precisa consultar capabilities, senão o operador escreve texto livre e a mensagem falha só na hora do envio, de madrugada, na cobrança.

```ts
export interface ChannelCapabilities {
  freeTextOutsideWindow: boolean;
  requiresApprovedTemplate: boolean;
  supportsMedia: boolean;
  supportsButtons: boolean;
  sessionWindowHours: number | null;
  costModel: 'metered' | 'free';
  officialStatus: 'official' | 'unofficial';
}
```

| | Meta Cloud API | Salvy | Evolution |
|---|---|---|---|
| `freeTextOutsideWindow` | `false` | `false` | `true` |
| `requiresApprovedTemplate` | `true` | `true` | `false` |
| `sessionWindowHours` | 24 | 24 | `null` |
| `costModel` | `metered` | `metered` | `free` |
| `officialStatus` | `official` | `official` | **`unofficial`** |
| Tempo de setup | dias | horas | minutos |
| Risco de banimento | baixo | baixo | **alto** |

---

### Provider: Meta Cloud API

Wizard:

1. Pré-requisitos explicados: conta Meta Business verificada, número **não** vinculado a WhatsApp comum
2. WABA ID + Phone Number ID + token permanente
3. Botão "Testar conexão"
4. Configurar webhook: URL + verify token (mostramos prontos)
5. Enviar mensagem de teste para o número do próprio dono ⚠️
6. Submeter templates padrão para aprovação

⚠️ Estado `PENDING_EXTERNAL`: verificação de negócio pode levar dias. Não é "pendente" nem "concluído" — tem ícone e texto próprios, e conta como desbloqueio parcial (o tenant configura templates enquanto espera). Sem esse estado o usuário acha que travou e abandona.

**Tela de saúde específica:** quality rating (verde/amarelo/vermelho), tier de envio (250 / 1k / 10k / ilimitado), status de cada template, validade do token, mensagens enviadas por categoria.

**Custo:** a Meta cobra por mensagem entregue desde 01/07/2025 (não mais por janela de 24h). No Brasil, `UTILITY` é ordens de grandeza mais barato que `MARKETING`, com desconto por volume mensal em utility e authentication. Mensagens de serviço (resposta dentro de 24h após o customer escrever) são gratuitas.

⚠️ Implicações de produto:
- Templates de cobrança **precisam** ser escritos para aprovar como `UTILITY` (ver doc 09)
- A Meta limita mensagens de marketing por usuário por dia somando todas as empresas — erro `131049`. Régua agressiva bate nisso
- WABA precisa ser brasileira para mensagear números brasileiros
- Exibir custo estimado por mensagem na UI ajuda o tenant a entender por que categoria importa

---

### Provider: Salvy

BSP sobre a Meta — mesmas restrições de template e janela, com setup bem mais simples. **É o caminho que a UI deve destacar como recomendado** para quem quer canal oficial sem lidar com o Business Manager.

Wizard: API key → selecionar/provisionar número → testar conexão → mensagem de teste.

---

### Provider: Evolution API — ⚠️ com aviso permanente

**Modelo BYO obrigatório.** O tenant informa a URL da instância própria e a API key. **Não hospedamos, não provisionamos, não gerenciamos instância.** Isso nos posiciona como integrador, não operador.

#### Avisos — em três lugares, permanentes

Não é só um checkbox no wizard. O aviso persiste enquanto a integração existir:

**1. No wizard, antes de conectar** — bloco destacado, com aceite registrado:

> **Atenção: risco de perda do número**
>
> A Evolution API conecta ao WhatsApp por um método não oficial, o que **viola os Termos de Serviço do WhatsApp**.
>
> - Seu número **pode ser banido a qualquer momento**, sem aviso e sem recurso
> - O risco aumenta com volume de envio, que é exatamente o uso de cobrança
> - Um banimento pode atingir também o número pessoal vinculado
> - **Não oferecemos suporte, SLA nem garantia** para este canal
> - Você é responsável por hospedar e manter a instância
>
> Recomendamos WhatsApp Oficial (Meta) ou Salvy para uso profissional de cobrança.
>
> ☐ Li e assumo o risco de perder este número

Aceite gravado em `Integration.riskAcceptedAt` + `riskAcceptedBy` + IP.

**2. Badge fixo na tela de integrações** — enquanto a integração estiver ativa:

> ⚠️ Canal não oficial — risco de banimento. [Migrar para canal oficial]

**3. Nota no painel de saúde e no rodapé de relatórios de envio** — "canal não oficial, sem garantia de entrega".

#### Comportamento no sistema

- Templates neste canal aceitam texto livre (capability), mas o sistema **avisa** que migrar para canal oficial exigirá reescrita como template aprovado
- Falha de conexão gera alerta mais agressivo, porque desconexão silenciosa é comum
- Se a instância ficar inacessível por > 24h, notificar o operador e sugerir migração

---

## Roteamento e fallback

Ordem de tentativa configurável por passo da régua. Padrão: WhatsApp → e-mail se falhar.

```
Passo D+3 (WhatsApp)
   ↓ falha (sem WhatsApp, número inválido, canal fora)
Fallback e-mail, se contato de e-mail existir e sem opt-out
   ↓ falha
Marca Message.FAILED com motivo legível e mostra na timeline do customer
```

⚠️ Fallback **não** ignora opt-out. Opt-out é global por customer (T5, doc 09).

---

## Recebimento de mensagens

Webhook de entrada (Meta, Salvy, Evolution) alimenta:

- `message.inbound_received` → abre janela de 24h (relevante para custo)
- Detecção de palavras de opt-out (`PARE`, `SAIR`, `CANCELAR`, `DESCADASTRAR`, `STOP`) → `contact.opted_out` ⚠️
- Histórico na timeline do customer

🔮 Fase 3: caixa de entrada unificada com atendimento humano. Fora do MVP — é um produto inteiro (atribuição, status, SLA, notas internas).

---

## Templates e variáveis

```
{{customer.name}}          {{customer.first_name}}
{{charge.amount}}          {{charge.due_date}}        {{charge.days_late}}
{{charge.total_with_fees}} {{subscription.plan_name}}
{{pix.code}}               {{payment.link}}
{{tenant.display_name}}    {{tenant.support_phone}}
{{access.expires_at}}      {{access.days_remaining}}
```

Regras:
- Renderização com escape; variável inexistente falha na validação, não no envio
- Preview com dados reais de um customer escolhido, antes de salvar
- ⚠️ `{{tenant.display_name}}`, nunca razão social — o assinante não deve ver "João da Silva 123.456.789-00 ME"
- Validador alerta sobre linguagem que reprova como `UTILITY` na Meta e sobre linguagem coercitiva (CDC art. 42)
