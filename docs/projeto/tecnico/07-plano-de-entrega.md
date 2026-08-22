# 07 — Plano de entrega

> Cinco etapas, dez semanas. Ao final de cada uma o cliente usa o que ficou pronto e dá o retorno.
> Escopo contratado em [`../comercial/02-precificacao.md`](../comercial/02-precificacao.md).

## Etapa 0 — Fundação (dias 1–3)

Não é etapa de entrega, é o que sustenta as outras. Antes de qualquer tela:

- [x] Next.js + TypeScript + Tailwind + shadcn/ui
- [x] Prisma + Neon, primeira migration
- [x] `src/core/` com `money.ts` e `dates.ts` — **testes primeiro**
- [x] Autenticação: login, sessão em cookie, middleware, troca de senha
- [x] `lib/crypto.ts` com AES-256-GCM e teste de ida e volta
- [x] Vitest configurado; Postgres real (container) para os testes de integração
- [ ] Deploy no Cloud Run funcionando ponta a ponta, com o banco de dev
- [x] Logs em JSON, `/api/health`

**Critério de pronto:** aplicação no ar, login funcionando, `pnpm test` verde, e o cálculo de vencimento por data de pagamento (com clamp de fim de mês) passando todos os casos de [`03-datas-e-ciclos.md`](./03-datas-e-ciclos.md).

⚠️ Nada de tela antes do `core/` testado. Cálculo financeiro descoberto errado na semana 6 custa dez vezes mais que na semana 1.

---

## Etapa 1 — Cadastro e base (até a semana 2)

- [x] `Settings` — nome do negócio, fuso, quiet hours, chave Pix, limite de margem
- [x] CRUD de `Supplier` com custo padrão
- [x] CRUD de `Plan` com preço e custo sugeridos
- [x] CRUD de `Customer`
- [x] CRUD de `Subscription`: plano, fornecedor, preço, custo, ciclo, desconto recorrente. Vencimento não é campo do formulário — nasce calculado (`startedAt + ciclo` na criação, `dataPagamento + ciclo` a cada renovação)
- [x] Credencial de acesso: usuário em claro, senha criptografada, mascarada, com revelar auditado
- [x] Margem calculada e exibida na hora, no formulário
- [x] Lista de clientes com busca por nome, telefone e usuário de acesso
- [x] Ficha do cliente com as assinaturas
- [x] **Importação da base atual** — script de seed a partir da planilha, com relatório do que entrou e do que foi recusado

**Critério de pronto:** a base real do cliente está dentro do sistema, ele abre a ficha de cinco clientes que conhece de cor e os números batem com a planilha dele.

### Sobre a importação

Não é o pipeline de 9 fases do spec original. É um script rodado uma vez, com a planilha real na mão — `scripts/import-customers.ts`, um arquivo por fornecedor.

A planilha real do cliente (`.xlsm`) não bateu com o resumo em vídeo que guiou o desenho inicial — nenhuma das 28 linhas tinha WhatsApp preenchido. Isso mudou duas decisões de modelo, registradas em [`docs/superpowers/specs/2026-08-07-etapa-1c-importacao-design.md`](../../superpowers/specs/2026-08-07-etapa-1c-importacao-design.md):

- **`Customer.phone` é opcional**, não obrigatório. Telefone ausente não é motivo de recusa — o operador completa depois. Dedupe usa telefone quando presente; sem telefone, cada linha vira um `Customer` novo. `@@unique([phone])` continua válido: Postgres trata `NULL` como distinto em índice único, sem precisar de índice parcial.
- **O vencimento vem direto da planilha**, não de `nextDueDate(últimoPagamento, cycle, tz)`. A origem não tem "data do último pagamento", só o vencimento que o cliente já controla na mão — é um bootstrap único desta importação. A partir do primeiro pagamento registrado no sistema novo (Etapa 2), a regra normal (pagamento → próximo vencimento calculado) passa a valer.

O que o script faz, e que dá errado se for ignorado:

- **Normalizar telefone para E.164** quando presente. A planilha pode ter `(11) 99999-8888`, `11999998888`, `+5511999998888` e `9999-8888` sem DDD. O último não dá para normalizar — fica sem telefone, sem recusar a linha.
- **Consolidar duplicata por telefone**, quando há telefone em mais de uma linha para o mesmo cliente (ex.: mesmo cliente em duas planilhas de fornecedores diferentes).
- **Idempotência checada antes de tocar em `Customer`** — telefone nulo não serve de chave de upsert. A checagem é por `Subscription` existente com o mesmo `accessUsername` + fornecedor; só depois disso o script resolve o `Customer`.
- **Recusar em vez de chutar.** Nome vazio, vencimento ausente/impossível ou valor negativo saem no relatório de recusa. Dado errado importado em silêncio é pior que linha faltando.
- **Relatório ao fim** (`tmp/import-report-<timestamp>.txt`): quantas entraram, quantas foram puladas por já existir, quantas foram recusadas e por quê, quais entraram com ressalva de telefone inválido, soma dos valores para conferir contra a planilha.

⚠️ Até 4 horas de tratamento estão no contrato. Passou disso, é R$ 150/hora — combinado antes de começar, não depois.

---

## Etapa 2 — Cobrança (até a semana 3)

- [x] Emissão de cobrança na criação da assinatura e no pagamento total (não é job — é evento na transação), idempotente
- [x] Job `charges-mark-overdue` de marcação de atraso
- [x] Painel de vencimentos: vencem hoje, próximos dias, em atraso, recebido no mês
- [x] Lista de cobranças com filtro por status, cliente, fornecedor e período
- [x] Registro manual de pagamento, total e parcial
- [x] Cancelamento de cobrança — bloqueado se houver pagamento registrado
- [x] Histórico de cobranças e pagamentos na ficha do cliente
- [ ] Cloud Scheduler configurado com autenticação OIDC

**Critério de pronto:** criar assinatura gera a primeira cobrança, registrar pagamento parcial e depois total gera a próxima com o vencimento certo, e o status e os totais baterem em todos os casos. Registrar o mesmo pagamento duas vezes (dupla submissão) não duplica cobrança nem pagamento.

---

## Etapa 3 — WhatsApp (até a semana 5)

- [ ] Interface `ChannelAdapter` + modelo de capabilities
- [ ] Adapter Meta Cloud API, com template aprovado
- [ ] Adapter Evolution API
- [ ] Tela de configuração de canal, com teste de conexão e aviso de risco no Evolution
- [ ] Editor de template com variáveis e prévia usando dados reais
- [ ] Envio manual assistido, individual e em lote, com prévia e confirmação acima de 100
- [ ] Timeline de mensagens na ficha do cliente
- [ ] Recebimento de resposta e processamento de palavra-chave de opt-out

**Critério de pronto:** mensagem real chega no WhatsApp de um número de teste, pelos canais que o cliente conseguiu habilitar, com nome e valor corretos.

⚠️ **Esta é a etapa com risco de prazo fora da sua mão.** Meta Cloud API exige verificação de negócio, que leva de dias a semanas e pode ser reprovada. Evolution exige uma VPS provisionada pelo cliente. A entrega é o adapter funcionando contra credencial válida — obter a credencial é responsabilidade dele, e o prazo desta etapa conta a partir da entrega de cada uma.

---

## Etapa 4 — Régua e lucro (até a semana 7)

- [ ] Modelo de régua e passos, com editor
- [ ] Régua padrão pré-paga criada em `REVIEW`
- [ ] Job `dunning-evaluate` com consolidação por cliente
- [ ] Job `messages-dispatch` com lote, retry e reagendamento
- [ ] Travas T5, T6, T7, T8 — **todas, com teste**
- [ ] Modo revisão com prévia e as três opções de ativação
- [ ] Ação `SUSPEND` e notificação ao operador
- [ ] Painel de lucro por cliente
- [ ] Painel do mês com faturamento, custo, lucro, margem, em aberto e margem em risco
- [ ] Quebra por fornecedor e por plano
- [ ] Alertas de margem negativa e abaixo do limite
- [ ] Reajuste em lote ao mudar o custo do fornecedor
- [ ] Export CSV com escape de fórmula
- [ ] Backup diário configurado e **restore testado**

**Critério de pronto:** cobrança vence, a mensagem sai sozinha no horário certo, o pagamento cancela os passos seguintes, o kill switch para tudo na hora, e o lucro do mês fecha com a soma dos lucros por cliente.

---

## Etapa 5 — Site de captação (semanas 8 a 10)

Aplicação separada. Spec completa em [`08-site.md`](./08-site.md).

- [ ] Astro + Tailwind + Cloudflare Pages, domínio apontado
- [ ] 8 páginas fixas com conteúdo real + 3 páginas locais + 6 posts de blog
- [ ] JSON-LD: `Organization`, `BreadcrumbList`, `FAQPage`, `Article`, `Product`
- [ ] Sitemap, robots, canonical, Open Graph, RSS
- [ ] CTAs de WhatsApp com texto pré-preenchido por origem, e UTM distinto por CTA
- [ ] Formulário com Turnstile, com fallback para WhatsApp se o endpoint falhar
- [ ] **No sistema:** endpoint público `/api/leads`, tabela `Lead`, tela de leads, converter lead em cliente
- [ ] Cloudflare Web Analytics + Search Console verificado

**Critério de pronto:** site no ar e indexável, formulário gera um `Lead` visível no painel, e o PageSpeed Insights mobile passa em LCP, INP e CLS.

⚠️ **Posição em busca não é critério de pronto.** Ranquear leva de 3 a 6 meses e depende de fatores fora do controle de quem constrói. Entrega-se um site tecnicamente correto e indexável, não uma posição. Isso precisa estar escrito no contrato — é a expectativa que mais gera atrito neste tipo de projeto.

⚠️ **Domínio e hospedagem do site são separados dos do sistema.** Contas diferentes, sem DNS em comum. Se o domínio de captação for penalizado ou derrubado, o painel continua no ar.

---

## Testes — onde é obrigatório

TDD, vermelho antes de verde:

| Área | Por quê |
|---|---|
| `src/core/**` | Vencimento por data de pagamento (clamp de fim de mês), ciclo, desconto, arredondamento, margem |
| Travas T5–T8 | É o que separa sistema útil de número banido |
| Idempotência de cada job | Rodar duas vezes tem que dar o mesmo resultado |
| Criptografia de credencial | Ida e volta, e falha explícita com chave errada |

Fora dessas áreas: teste junto ou depois, sem cerimônia. Formulário e tela de CRUD não precisam de red-green.

**Como testar:**

- Integração contra **Postgres real** (container). Índice parcial e `CHECK` não existem em SQLite — testar sem eles é testar outro sistema.
- Relógio injetado por parâmetro, nunca mockado globalmente.
- Não mockar `core/` — é puro e roda em milissegundos.
- Adapter de canal tem um *fake* do **nosso** adapter, não um mock da API da Meta.
- Valores que já quebraram sistema: `0`, `1` centavo, R$ 33,33 dividido em três, 31/01 → fevereiro, ano bissexto.

---

## Entrega final

- [ ] Deploy no projeto Google Cloud **do cliente**, com o banco na conta dele
- [ ] Contas de canal, nuvem e banco no nome dele — nenhuma no seu cartão
- [ ] Segredos no Secret Manager
- [ ] Base real importada e conferida com ele na tela
- [ ] Régua entregue em `REVIEW`, ativada por ele na sua frente
- [ ] Backup diário rodando e restore testado uma vez
- [ ] Repositório transferido — código-fonte é dele
- [ ] Treinamento de 2 horas, gravado
- [ ] Runbook curto: canal caiu · número banido · restaurar backup · trocar credencial · pausar envios

**Garantia de 3 meses começa aqui.** Cobre comportamento diferente do especificado nestes documentos. Não cobre mudança de política de terceiro, banimento de canal, alteração de plano de hospedagem nem funcionalidade nova — essas são R$ 150/hora.

---

## Riscos de execução

| Risco | Sinal | Resposta |
|---|---|---|
| Verificação da Meta reprovada ou lenta | Passou de 2 semanas sem aprovação | Entrega a etapa 3 com a Evolution funcionando; Meta fica pendente da credencial dele, documentado |
| Cliente não provisiona a VPS do Evolution | Semana 4 sem servidor | Mesma resposta: adapter pronto, entrega condicionada à credencial |
| Planilha pior que o esperado | Passou de 4 horas de tratamento | Para, mostra o relatório de recusa, orça o excedente antes de continuar |
| Pedido novo no meio ("só mais uma coisinha") | Qualquer item fora dos documentos | R$ 150/hora, orçado e aprovado antes. Combinado no início justamente para não virar negociação caso a caso |
| Cálculo financeiro descoberto errado tarde | Divergência na conferência da etapa 2 | Não avança para a etapa 3 com a 2 incompleta |
| Conteúdo do site sem fim | Pedido de página ou post além do combinado | 8 páginas fixas + 3 locais + 6 posts. Além disso, R$ 150/hora. Site de conteúdo sem teto é trabalho infinito |
| Cobrança por posição em busca | "Não estamos em primeiro no Google" | Critério de pronto é site indexável e verde no PageSpeed, não posição. Escrito no contrato desde o início |
