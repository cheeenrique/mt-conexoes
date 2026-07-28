# 15 — Billing do Próprio SaaS

> ⚠️ Erro clássico: construir um sistema de cobrança e esquecer de cobrar. Limites que não são aplicados no código não existem.

## Modelo

**Valor fixo por plano de recursos.** Sem cobrança por uso, sem excedente, sem medição de mensagem — o tenant usa as credenciais dele nos providers (ADR-009) e paga o WhatsApp direto à Meta/Salvy.

Vantagens: previsibilidade para o cliente, simplicidade de implementação, sem risco de fatura surpresa. Desvantagem: cliente grande e cliente pequeno no mesmo plano têm margens diferentes — mitigado pelos limites de plano.

---

## Planos

| | **Starter** | **Pro** | **Business** |
|---|---|---|---|
| Clientes ativos | até 300 | até 1.500 | até 5.000 |
| Usuários | 2 | 5 | 15 |
| Canais de WhatsApp | 1 | 2 | 5 |
| Réguas de cobrança | 2 | 10 | ilimitadas |
| Templates | 10 | ilimitados | ilimitados |
| Gateways conectados | 1 | 3 | ilimitados |
| Fornecedores | 1 | 5 | ilimitados |
| Campos personalizados | 3 | 10 | ilimitados |
| Relatório de margem e LTV | — | ✓ | ✓ |
| Importações/mês | 5 | 30 | ilimitadas |
| Retenção de histórico | 12 meses | 36 meses | 60 meses |
| Relatórios avançados | — | ✓ | ✓ |
| Portal do assinante 🔮 | — | ✓ | ✓ |
| Domínio próprio 🔮 | — | — | ✓ |
| API pública 🔮 | — | — | ✓ |
| Suporte | e-mail | e-mail prioritário | WhatsApp |

**Contagem de "cliente ativo":** `Customer` com pelo menos uma `Subscription` em `TRIALING`, `ACTIVE`, `PAST_DUE` ou `SUSPENDED`. Clientes arquivados ou com assinatura `CANCELED`/`EXPIRED` não contam. ⚠️ Definir isso com precisão desde o início — é a métrica que gera disputa de cobrança.

**Trial:** 14 dias, sem cartão, no plano Pro. Ao fim, cai para Starter se não houver assinatura — **não bloqueia**, apenas limita.

---

## Enforcement

⚠️ Limite não aplicado é limite inexistente. Implementação por guard:

```ts
@Injectable()
export class PlanLimitGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext) {
    const { tenantId } = ctx.switchToHttp().getRequest();
    const limit = this.reflector.get<LimitKey>(PLAN_LIMIT, ctx.getHandler());
    if (!limit) return true;

    const { current, max } = await this.limits.check(tenantId, limit);
    if (current >= max) {
      throw new PlanLimitExceededException({ limit, current, max });
    }
    return true;
  }
}
```

```ts
@CheckPlanLimit('activeCustomers')
@Post('/customers')
create() { ... }
```

### Comportamento ao atingir o limite

**Não bloquear operação existente.** Regras:

| Situação | Comportamento |
|---|---|
| Tentar criar acima do limite | Bloqueia com `PLAN_LIMIT_EXCEEDED` + CTA de upgrade |
| Já está acima (downgrade ou crescimento) | ⚠️ **Não desliga nada.** Banner persistente + e-mail; bloqueia apenas novas criações |
| Importação que ultrapassaria | Avisa no preview, antes de executar, com o número exato |
| Retenção excedida | Dados antigos ficam inacessíveis na UI, **não são apagados** enquanto houver assinatura ativa |

Cortar acesso a dados de quem já pagou gera dano reputacional muito maior que a receita do upgrade.

---

## Ciclo de cobrança do SaaS

Usamos **um gateway externo** (Stripe ou Asaas) para o nosso próprio billing. Não dogfooding aqui: nosso produto é BYO e não intermedia dinheiro; usá-lo para cobrar a nós mesmos seria forçar arquitetura.

- Mensal ou anual (anual com desconto de 2 meses)
- Cartão ou Pix
- Cobrança automática no gateway; nossa base só reflete o estado

Estados do tenant: `trialing` → `active` → `past_due` → `suspended` → `canceled`.

**Régua do nosso próprio billing:** D-3 aviso · D0 cobrança · D+3 falha de pagamento · D+7 aviso de suspensão · D+10 suspender · D+30 encerrar.

⚠️ "Suspender" no nosso billing = **somente leitura**, nunca deleção. O tenant vê os dados, exporta tudo, mas não opera. Deleção só após 90 dias de cancelamento, com aviso prévio e link de export.

---

## Dogfooding parcial

O que **sim** usamos do próprio produto:
- Régua de e-mails de onboarding (`onboarding.stalled` → nudge)
- Eventos e jobs internos
- Relatórios de MRR e churn — sobre nossos próprios tenants

Isso testa o motor com dados reais e sem risco.

---

## Métricas do negócio

| Métrica | Definição |
|---|---|
| MRR | Soma dos planos ativos, anual normalizado por 12 |
| Churn de receita | MRR perdido ÷ MRR do início do mês |
| Churn logo | Tenants cancelados ÷ tenants ativos |
| Ativação | % que completa os 6 passos mínimos em 7 dias (meta > 60%) |
| Time-to-value | Horas entre cadastro e primeira cobrança automática enviada |
| Expansão | MRR de upgrades |
| NRR | (MRR inicial − churn + expansão) ÷ MRR inicial |

⚠️ Instrumentar `time-to-value` desde o dia 1. É a métrica que mais correlaciona com retenção em SaaS de PME, e é impossível reconstruir retroativamente.

---

## Precificação — nota crítica

Os valores dos planos ficam fora deste documento propositalmente: dependem de validação com clientes reais, e mudar preço em documento técnico é ruído.

Duas recomendações:

1. **Não ancorar barato demais.** O ICP paga R$ 50–300/mês sem dor se o produto devolve horas e reduz inadimplência. Preço muito baixo atrai o cliente que mais dá suporte e menos fica.
2. **Cobrar desde o primeiro cliente.** Free tier em SaaS de cobrança atrai quem não tem operação. Trial de 14 dias basta.
