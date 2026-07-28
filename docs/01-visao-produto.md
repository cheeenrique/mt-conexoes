# 01 — Visão de Produto

## Problema

Pequenos negócios que vendem assinatura recorrente controlam a operação em planilha. O ciclo diário é:

1. Abrir a planilha e ver quem vence hoje
2. Copiar nome e valor, montar a mensagem, mandar no WhatsApp um por um
3. Conferir o extrato do banco para saber quem pagou
4. Atualizar a planilha na mão
5. Perseguir quem não pagou

O resultado é previsível: inadimplência alta por esquecimento (não por falta de dinheiro), horas por dia em trabalho manual, e nenhuma visibilidade de receita.

## Proposta de valor

> Cobrar sozinho, receber sem conferir extrato, e nunca mais abrir a planilha.

Três pilares, nesta ordem de importância:

1. **Régua de cobrança automática** — a mensagem certa, na hora certa, sem intervenção
2. **Conciliação automática** — pagamento confirmado pelo gateway dá baixa sozinho
3. **Visibilidade** — MRR, inadimplência, receita em risco, sem planilha

## Posicionamento

**Núcleo genérico, go-to-market vertical.**

O produto é um SaaS de gestão de assinaturas e cobrança recorrente para PMEs. O domínio não contém nada específico de um segmento. A entrada no mercado, porém, é vertical: onboarding, templates e réguas pré-configurados para um nicho por vez, começando por provedores de assinatura digital.

**Por que genérico no núcleo:** o mesmo motor serve provedor de internet regional, escola de idiomas, academia, clínica, agência e software house. Verticalizar o código fecha o TAM sem ganho técnico.

**Por que vertical na venda:** "sistema de cobrança" não vende. "O sistema que cobra seus assinantes no WhatsApp e dá baixa sozinha no Pix" vende.

### Contra quem estamos

Superlógica, Vindi, Iugu, Asaas, Kobana, Cobre Fácil. Todos maiores e mais bem financiados.

**Onde há espaço:** operações de 100 a 2.000 assinantes, que acham os incumbentes caros e complexos demais, e cuja cobrança acontece no WhatsApp — não por boleto. A profundidade de automação de mensagem e a simplicidade de operação são o diferencial, não a feature list.

## ICP (perfil de cliente ideal)

| Dimensão | Descrição |
|---|---|
| Porte | 100–2.000 assinantes ativos |
| Estrutura | 1 a 5 pessoas operando; frequentemente o dono sozinho |
| Ferramenta atual | Excel/Google Sheets + WhatsApp pessoal |
| Modelo | Assinatura mensal, vencimento individual por cliente, preço negociado |
| Recebimento | Pix na maioria; cartão minoritário |
| Dor principal | Tempo gasto cobrando + inadimplência por esquecimento |
| Sensibilidade a preço | Alta — ticket alvo R$ 50–300/mês |

**Anti-ICP:** empresas com >5.000 assinantes (querem ERP e integração contábil), operações B2B com contrato e NF por cliente, e qualquer negócio cujo faturamento não seja recorrente.

## ⚠️ Riscos declarados

Registrados aqui porque afetam decisões de produto, não só de negócio.

### R1 — Legalidade da atividade do cliente (crítico)

Parte relevante do nicho inicial opera à margem de licenciamento de conteúdo. Consequências práticas:

- **Gateways de pagamento** (Mercado Pago, PagBank, Asaas, Stripe) listam a atividade como vedada. Contas conectadas serão encerradas em algum momento.
- **Meta/WhatsApp** exige verificação de negócio. Operações irregulares não passam, ou passam e são derrubadas.
- **Exposição própria:** hospedar a base de assinantes e automatizar a cobrança de uma operação ilícita cria risco de responsabilização.

**Mitigações adotadas no produto:**

- **BYO credentials** — o tenant usa a conta dele no gateway e no canal. Não intermediamos dinheiro nem mensagem. Somos ferramenta, não operador. *(Ver ADR-009.)*
- **Sem corte técnico de acesso no MVP** — não integramos com painel de streaming. Suspensão é status interno. *(Ver ADR-010.)*
- **AUP e Termos de Uso** que proíbem uso para atividade ilícita, com direito de encerramento.
- **Ausência de dependência de gateway no onboarding** — Pix manual permite operar sem terceiro que possa recusar o cliente.

### R2 — Banimento de número de WhatsApp

Canal não-oficial (Evolution) viola os Termos do WhatsApp; banimento é questão de quando, não se. Canal oficial tem quality rating que despenca com denúncia de spam.

**Mitigações:** aviso permanente na UI com aceite registrado, modelo BYO de instância, limite de envio para tenant novo, e modo de revisão da régua pós-importação. *(Ver 09 e 11.)*

### R3 — Concentração de mercado

O nicho inicial é volátil e churna muito. Depender dele é frágil.

**Mitigação:** núcleo genérico desde o dia 1; segundo vertical validado até o mês 9.

## Métricas de sucesso

**Do produto (o que provamos ao cliente):**

- Taxa de recuperação de inadimplência — % de cobranças vencidas que são pagas após a régua
- Tempo até primeira cobrança automática enviada (meta: < 30 min do cadastro)
- Redução de dias médios de atraso (DSO) do tenant

**Do negócio:**

- Ativação: % de tenants que completam os 6 passos mínimos em 7 dias (meta: >60%)
- Retenção no dia 30 e churn mensal
- MRR e ARPU

**Anti-métricas** (não colocar em dashboard, não celebrar): mensagens enviadas, fluxos executados, número de features.

## Objetivo do MVP

Ao final da primeira versão, um operador deve conseguir, sozinho e sem suporte:

1. Criar sua conta (PF ou PJ)
2. Importar a planilha dele e ver a base dentro do sistema
3. Configurar recebimento (Pix manual ou gateway)
4. Conectar um canal de mensagem
5. Revisar e ativar a régua de cobrança
6. Acompanhar receita, inadimplência e vencimentos por dashboard
7. Parar de usar a planilha

## Não-objetivos (explícitos)

Coisas que **não** faremos, e por quê:

| Não faremos | Motivo |
|---|---|
| Motor visual de workflow tipo n8n | 6–12 meses de trabalho; a régua parametrizável entrega 90% do valor. 🔮 Fase 4 |
| Marketplace de fluxos | Otimização prematura antes de PMF |
| Emissão de nota fiscal | Domínio inteiro à parte; integrar com terceiro depois |
| Hierarquia de sub-revenda | Cada revenda é um tenant independente *(ADR-011)* |
| Multi-moeda / multi-idioma | BRL e PT-BR apenas |
| App mobile nativo | Painel responsivo cobre o caso de uso |
| Integração com painel de streaming | Risco R1; sem uplift proporcional |
