# Casos de teste manuais — painel

Roteiro de verificação pelo navegador. Base: `pnpm db:seed` + `pnpm db:seed:demo` no
Postgres de dev (5442). Login: `admin@mtconexoes.com.br` / `devlocal123`.

⚠️ **WhatsApp não configurado** (`channel_configs` vazio). Consequências esperadas, não bugs:
- Régua e envio manual **enfileiram** `Message` `PENDING`; nada sai.
- `messages-dispatch` não entrega — o corpo montado fica visível em Mensagens.
- Envio manual **é bloqueado antes de enfileirar**: `sendManualBatch` exige canal padrão ativo
  (`NO_DEFAULT_CHANNEL`). Para testar o corpo montado do envio manual é preciso um canal salvo.
- `META_CLOUD` recusa todo envio (nada preenche `templateRef`) — ver CLAUDE.md §Estado atual.

Legenda: **P** pré-condição · **A** ação · **E** esperado.

---

## 1. Auth (`/login`, `/conta`)

| # | Caso | P / A / E |
|---|---|---|
| A1 | Login válido | A: email+senha do seed → E: redireciona pro dashboard, cookie de sessão |
| A2 | Senha errada | A: senha inválida → E: erro em pt-BR, sem revelar se o email existe, sem stack |
| A3 | Rota protegida sem sessão | A: abrir `/charges` deslogado → E: redireciona pro login |
| A4 | Trocar senha | `/conta` → A: senha atual + nova → E: sucesso; senha antiga deixa de logar |
| A5 | Trocar senha com atual errada | E: erro de campo, senha não muda |
| A6 | Logout | E: volta pro login; voltar no histórico não reabre tela autenticada |

## 2. Dashboard (`/`)

| # | Caso | P / A / E |
|---|---|---|
| D1 | KPIs carregam | E: receita/lucro/margem do mês, sem `NaN`, sem `R$ 0,00` genérico com base populada |
| D2 | Cobranças em aberto | E: lista mostra vencidas em destaque, ordenadas por vencimento |
| D3 | Kill switch visível | E: controle de pausa de envio no dashboard, não escondido em Ajustes |
| D4 | Gaveta do cliente abre do dashboard | A: clicar num nome → E: ficha abre em gaveta, URL leva `?cliente=` |
| D5 | Dinheiro formatado | E: `R$ 1.234,56` em toda parte; nenhuma tela mostra centavos crus |

## 3. Clientes (`/customers`)

| # | Caso | P / A / E |
|---|---|---|
| C1 | Lista com todos os estados | E: seed demo mostra ativo, inadimplente, sem assinatura, opt-out, sem telefone |
| C2 | Filtro por situação | A: filtrar → E: filtro vai pro `searchParams`, link compartilhável, voltar funciona |
| C3 | Busca por nome/telefone | E: resultado coerente; vazio mostra empty state com ação |
| C4 | Novo cliente | A: cadastrar → E: aparece na lista; telefone salvo em E.164 e exibido formatado |
| C5 | Telefone duplicado | A: cadastrar telefone que já existe → E: erro de negócio claro, não erro 500 |
| C6 | Ficha em gaveta | A: abrir cliente → E: dados, assinaturas, cobranças, mensagens e lucro na mesma gaveta |
| C7 | Modo edição da ficha | A: editar nome/telefone → salvar → E: lista atualiza sem F5 |
| C8 | Cliente sem telefone | E: ficha sinaliza que não recebe mensagem; não quebra |
| C9 | Opt-out | E: ficha mostra opt-out; cliente não entra em envio nenhum (ver M4) |
| C10 | Voltar da ficha | A: fechar gaveta → E: volta pra lista mantendo filtro |

## 4. Assinaturas (dentro de `/customers/[id]`)

| # | Caso | P / A / E |
|---|---|---|
| S1 | Criar assinatura | A: plano + preço + início → E: cobrança do 1º ciclo nasce em `startedAt + ciclo` |
| S2 | Credencial mascarada | E: senha aparece `••••••••`; nunca em texto puro na listagem |
| S3 | Revelar credencial | A: clicar revelar → E: valor aparece **e** grava `credential_reveals`; some ao fechar |
| S4 | Margem em risco | P: preço < custo do fornecedor → E: banner de margem, não erro |
| S5 | Editar assinatura | A: mudar preço → E: cobranças **já emitidas** não mudam de valor (`costCents` congelado) |
| S6 | Desconto | A: aplicar desconto → E: valor final arredondado round half up, uma vez, no fim |
| S7 | Ciclo mensal x anual | E: próximo vencimento coerente com o ciclo escolhido |

## 5. Cobranças (`/charges`)

| # | Caso | P / A / E |
|---|---|---|
| B1 | Todos os status | E: `OPEN`, `OVERDUE`, `PARTIALLY_PAID`, `PAID`, `CANCELLED` com badge distinto |
| B2 | Filtro por status + período | E: intervalo de datas rotulado, tudo em `searchParams` |
| B3 | Registrar pagamento total | A: valor cheio → E: status `PAID`, `paidAt` gravado, mensagens `PENDING` da cobrança viram `CANCELLED` |
| B4 | Próxima cobrança nasce do pagamento | P: B3 → E: novo vencimento = **data do pagamento + ciclo** (não dia fixo) |
| B5 | Pagamento parcial | A: valor menor → E: `PARTIALLY_PAID`, **nenhuma** cobrança nova gerada |
| B6 | Pagamento em duas parcelas fecha | A: dois parciais somando o total → E: `PAID` e aí sim gera a próxima |
| B7 | Duplo clique em registrar | E: um único `Payment`; botão desabilita durante a mutation |
| B8 | Cancelar cobrança | A: cancelar `OPEN` → E: exige confirmação; some das em aberto |
| B9 | Cancelar cobrança com pagamento | E: **bloqueado** com mensagem de domínio, não 500 |
| B10 | Valor 1 centavo e valor com dízima | E: soma bate; sem `float` aparecendo como `12.340000000001` |
| B11 | Cobrança vencida | P: rodar cron `charges-mark-overdue` → E: `OPEN` vencida vira `OVERDUE` |
| B12 | Rodar o cron duas vezes | E: mesmo resultado, sem duplicata (idempotência) |

## 6. Régua (`/dunning`)

| # | Caso | P / A / E |
|---|---|---|
| R1 | Mestre-detalhe | E: lista de réguas à esquerda, detalhe à direita, padrão marcada |
| R2 | Criar régua | A: nova régua → E: nasce `DRAFT`; motor não avalia |
| R3 | Criar passo | A: offset + canal + template → E: passo no eixo, ordenado por offset |
| R4 | Preview do template | A: usar `{{cliente.primeiro_nome}}`, `{{cobranca.valor}}` → E: preview renderiza com dado de exemplo |
| R5 | Variável desconhecida | A: `{{foo.bar}}` → E: erro nomeando a variável, salvamento bloqueado |
| R6 | Editar/excluir passo | E: eixo atualiza; excluir pede confirmação |
| R7 | `DRAFT → REVIEW` | E: calcula tudo, **não envia nada**; banner explica o estado |
| R8 | Revisão antes de ativar | A: ativar em `REVIEW` → E: diálogo mostra a lista real do que sairia hoje |
| R9 | Ativar régua certa | P: duas réguas; revisar a B → A: ativar → E: ativa **a B** (id da tela), nunca a padrão por engano |
| R10 | Trocar régua padrão | E: só uma padrão (índice único); a antiga perde o selo |
| R11 | Pausar régua ativa | E: volta pra estado sem envio; mensagens já `PENDING` seguem a regra do despacho |
| R12 | Aviso de canal | E: com canal não configurado, a tela avisa que nada sai |
| R13 | Ativar sem descartar revisão | E: **não** dispara retroativo (`UNIQUE(chargeId, stepId)`); rótulo do botão não promete envio |

## 7. Mensagens (`/messages`) — o foco com WhatsApp off

| # | Caso | P / A / E |
|---|---|---|
| M1 | Gerar fila da régua | A: `POST /api/cron/dunning-evaluate` (bearer dev) → E: `Message` `PENDING` para cobrança vencida elegível |
| M2 | Corpo montado visível | A: abrir a mensagem no log → E: gaveta mostra **corpo final renderizado** (nome, valor, vencimento, dias de atraso, chave pix), sem `{{ }}` sobrando |
| M3 | Agrupamento por dia | E: log agrupa por dia, status legível (`PENDING`, `CANCELLED`, motivo) |
| M4 | T5 opt-out | P: cliente opt-out vencido → E: **nenhuma** mensagem criada pra ele |
| M5 | T6 quiet hours | P: rodar despacho fora de 08–20h → E: **reagenda**, não descarta; `scheduledFor` na próxima janela |
| M6 | T7 uma por cliente/dia | P: cliente com duas cobranças vencidas → E: **uma** mensagem consolidada no dia |
| M7 | T8 kill switch | A: pausar envios → E: despacho não envia nada, mensagens seguem `PENDING` |
| M8 | T8 stale | P: mensagem `PENDING` há >24h → E: vira `CANCELLED` motivo `stale` |
| M9 | Despacho sem canal | A: `POST /api/cron/messages-dispatch` → E: `sent: 0`, mensagens continuam `PENDING` (recuperável), sem `FAILED` em massa |
| M10 | Pagamento cancela mensagem | P: mensagem `PENDING` de cobrança X → A: registrar pagamento → E: mensagem `CANCELLED` motivo pagamento |
| M11 | Envio manual sem canal | A: selecionar clientes → enviar → E: erro `Configure um canal padrão em Canais antes de enviar.` |
| M12 | Envio manual com variável de cobrança | E: recusa nomeando as variáveis `cobranca.*` |
| M13 | Confirmação em massa | A: seleção > 100 → E: exige digitar o número |
| M14 | Sem conteúdo em log técnico | E: nenhum corpo de mensagem no stdout do dev server |

## 8. Canais (`/settings?aba=canais`)

| # | Caso | P / A / E |
|---|---|---|
| N1 | Grade de canais | E: Meta Cloud e Evolution listados; Salvy **não** aparece |
| N2 | Métodos de conexão | E: Evolution oferece QR (`PAIRING`) e credencial manual; Meta só manual |
| N3 | Testar conexão sem credencial | E: erro sanitizado, sem stack, sem credencial na tela |
| N4 | Salvar credencial | A: salvar dados falsos → E: teste falha com mensagem clara; nada volta pro front, nem mascarado |
| N5 | Canal configurado | E: mostra "configurado em DD/MM" + botão de substituir; nunca o valor |
| N6 | Pareamento por QR | A: iniciar → E: QR aparece no diálogo, some ao fechar, nunca aparece em log/DB |
| N7 | Desconectar canal | E: exige confirmação |
| N8 | Canal padrão único | E: marcar outro como padrão desmarca o anterior |

## 9. Leads (`/leads`)

| # | Caso | P / A / E |
|---|---|---|
| L1 | Lista com todos os status | E: novo, em contato, convertido, perdido com badges |
| L2 | `POST /api/leads` público | A: curl com corpo válido → E: 201, lead aparece na tela |
| L3 | Corpo inválido | A: campo extra / tipo errado → E: 400 do Zod estrito, sem 500 |
| L4 | Corpo > 8 KB | E: recusado |
| L5 | Rate limit por IP | A: repetir o POST acima do teto → E: bloqueia, registra em `lead_attempts` |
| L6 | Novo lead pela tela | E: aparece na lista |
| L7 | Mudar status | E: badge muda, sem recarregar página |
| L8 | Converter em cliente | A: converter com assinatura → E: cliente + assinatura + 1ª cobrança criados; lead marcado convertido |
| L9 | Converter lead de telefone existente | E: tela avisa do cliente existente, não duplica telefone |
| L10 | Lead já convertido | E: aviso na gaveta, sem botão de converter de novo |

## 10. Planos (`/plans`) e Fornecedores (`/suppliers`)

| # | Caso | P / A / E |
|---|---|---|
| P1 | Criar plano | A: nome + preço + ciclo → E: aparece na tabela, preço formatado |
| P2 | Editar plano | E: assinaturas existentes não têm preço reescrito retroativamente |
| P3 | Criar fornecedor | E: custo por plano registrado |
| P4 | Reajuste em massa — preview | A: abrir diálogo → E: mostra quantas assinaturas e o delta antes de aplicar |
| P5 | Reajuste em massa — aplicar | E: aplica; **cobranças já emitidas não mudam** |
| P6 | Reajuste que zera margem | E: avisa antes de aplicar |

## 11. Relatórios (`/reports`)

| # | Caso | P / A / E |
|---|---|---|
| T1 | Resumo do mês | E: receita, custo, lucro, margem; soma dos lucros por cliente **bate** com o total |
| T2 | Tendência mensal | E: meses no fuso do negócio, sem mês fantasma na virada UTC |
| T3 | Breakdown por cliente | E: ordenação e totais coerentes com `/charges` |
| T4 | Export CSV | A: `/api/reports/export` → E: baixa; célula iniciada por `=`,`+`,`-`,`@` vem escapada |
| T5 | Mês sem dado | E: empty state, não erro |

## 12. Ajustes (`/settings`)

| # | Caso | P / A / E |
|---|---|---|
| G1 | Aba Negócio | A: mudar nome, fuso, chave pix → salvar → E: reflete no preview de template (R4) |
| G2 | Quiet hours | A: mudar janela → E: valida início < fim; despacho passa a respeitar a nova janela |
| G3 | Barra de alterações não salvas | A: editar sem salvar → E: barra aparece; sair avisa |
| G4 | Pausar envios | E: kill switch reflete no dashboard (D3) e no despacho (M7) |

## 13. Transversais

| # | Caso | E |
|---|---|---|
| X1 | Loading / erro / vazio | Toda lista trata os três; skeleton por rota, não spinner de tela cheia |
| X2 | Teclado | Diálogo e gaveta navegáveis por Tab, `Esc` fecha, foco visível |
| X3 | Idioma | Zero string em inglês na UI |
| X4 | Console limpo | Sem erro de hidratação, sem `console.log` no browser |
| X5 | Cron sem token | `POST` sem bearer → 401 em todas as 4 rotas |
| X6 | `/api/health` | 200 com o banco de pé |

---

# Resultado da 1ª passada — 24/08/2026

Executado no navegador contra `localhost:3000`, base de dev (5442) com `seed` + `seed:demo`.
Não cobri: pareamento por QR real (N6), ação em massa > 100 (M13), anonimização, `/conta`,
fornecedores/planos além da leitura, T2/T5 de relatório.

## Passou

| Área | Casos |
|---|---|
| Auth | A2 (erro genérico, não revela email), A3 (rota protegida redireciona), A1 |
| Dashboard | D1, D2, D3 (kill switch no rodapé da barra lateral, em toda tela), D5 |
| Cobranças | B1 (5 status), B2 (filtro em `searchParams`), B5, B6, B11, B12 |
| **B3/B4** | Pagamento total → `PAGA` + **nova cobrança vencendo 24/09** = data do pagamento + ciclo. Regra do CLAUDE.md conferida na tela |
| Régua | R1, R4 (prévia com cliente e cobrança reais), R5, R12 (aviso de canal sem configuração) |
| Mensagens | M1, **M2** (gaveta "Texto que seria enviado" com o corpo montado), M3, M9, M11, M12 |
| Canais | N1 (Salvy ausente), N2 (QR + manual, risco com aceite obrigatório), N4-parcial (nada gravado quando o teste falha) |
| Leads | L2, L3 (400 no campo extra), L4 (413 acima de 8 KB), L5 (429 no 11º envio), L8, L10 |
| Relatórios | T1 — soma por plano fecha com o total: 300+160+105+73,33 = 638,33 |
| Cron | X5 (401 sem bearer), idempotência de `dunning-evaluate` (2ª passada: `queued: 0`) |
| Transversal | X4 (console limpo), a11y de tabela (`aria-label` em ícone e em botão desabilitado) |

## Falhou — todos corrigidos e reconferidos no navegador em 24/08/2026

### 1. Campo de dinheiro perde dígito — `components/ui/currency-input.tsx`

Digitando `1`,`2`,`3`,`4` em "Registrar pagamento", o campo para em `R$ 1,00`
(uma passada anterior parou em `R$ 12,00` — o resultado varia). Confirmado lendo
`input.value` a cada tecla: continua `"R$ 1,00"` depois do 2º e do 3º dígito.

Causa provável: o `IMaskInput` é controlado por `value={centsToDecimalString(value)}` e
`padFractionalZeros: true` já materializa `,00` na 1ª tecla; o round-trip pelo estado do
pai devolve o cursor pro fim, e o dígito seguinte cai depois da vírgula, onde `scale: 2`
o descarta.

Efeito: **não dá pra digitar um valor arbitrário**. Registrar R$ 12,34 é impossível pelo
teclado — só sobra o valor pré-preenchido. O próprio `currency-input.test.tsx` avisa que
"digitação real é verificação de navegador"; é exatamente esse o buraco.

**Corrigido.** O campo deixou de ser máscara controlada e virou acumulador de centavos sobre um
`<input>` comum (`digitsToCents` em `core/money.ts`). Digitar `1`,`2`,`3`,`4` agora dá `R$ 12,34` —
conferido no navegador e coberto por teste de digitação, que a versão mascarada não permitia.
`parseDecimalStringToCents` e `centsToDecimalString` saíram junto: ninguém mais os chamava.

⚠️ **Muda a digitação de todos os 10 campos de dinheiro do painel**: o dígito entra pela direita,
como em maquininha. `35` agora é R$ 0,35, não R$ 35,00.

### 2. Erro do provider chega cru na tela — canal Evolution

Salvar credencial apontando pra um host inexistente mostra o toast **`fetch failed`**.
Inglês, jargão de rede, sem dizer o que fazer. `service.ts:48` devolve
`redactSecrets(health.reason, …)` — o segredo sai (correto), a mensagem não é traduzida.
Viola "erro do provider sanitizado" e "`message` em pt-BR, sem jargão".

**Corrigido.** `providerFailureReason` (`channels/provider-error.ts`) manda o detalhe técnico para o
log estruturado e devolve uma frase em pt-BR. Os quatro `catch` dos adapters e o do pareamento
passaram a usá-lo. A tela agora diz "Não foi possível alcançar o servidor Evolution. Confira o
endereço e se ele está no ar."

### 3. Erro de validação Zod cru na tela — `Invalid UUID`

Envio manual para os clientes de demonstração mostra o toast **`Invalid UUID`**.
`sendManualMessagesSchema` usa `z.uuid()` sem `error:` custom, e `actions.ts` devolve
`parsed.error.issues[0]?.message` direto. Vale pra qualquer action: schema sem mensagem
própria vaza o texto em inglês do Zod.

**Corrigido.** `z.uuid('Cliente inválido.')` no schema de envio manual, e mensagem própria nos
`z.enum` de leads e réguas que ainda dependiam do texto padrão do Zod.

### 4. `seed-demo` cria ids que não são UUID

`demo-customer-01`…`08`. Fere a convenção "IDs `uuid` v7" e, na prática, **torna o envio
manual intestável** com a base de demonstração — é o caminho pelo qual o item 3 aparece.

**Corrigido.** `demoId(slug)` deriva um UUID estável do slug (SHA-1 + nibbles de versão/variante).
O arquivo continua legível por slug e o `upsert` por `id` continua idempotente.

### 5. `seed-demo` escreve data em ISO no corpo da mensagem

`seed-demo.ts:560` monta `dueDateLabel` com `.toISOString().slice(0,10)`; a mensagem
semeada mostra `vence dia 2026-08-26`. O renderizador de verdade formata `29/08/2026`
(confirmado na mensagem gerada pelo cron). Só dado de demonstração — mas quem abre a tela
pra "conferir por olho" vê o formato errado.

**Corrigido.** Usa a mesma expressão do renderizador de verdade
(`localDateOnly(...).toLocaleDateString('pt-BR', { timeZone: 'UTC' })`) — a mensagem semeada mostra
`26/08/2026`.

### 6. Diálogo de pagamento guarda o valor depois de cancelar

Digitar um valor → Cancelar → reabrir: volta com o valor digitado, não com o saldo da
cobrança. Numa cobrança de R$ 35,00 o diálogo reabriu com `R$ 1,00`. Depois de um
pagamento gravado ele remonta certo (mostrou o saldo de R$ 34,00) — o vazamento é só no
cancelar.

**Corrigido.** A `key` do formulário passou a incluir a contagem de aberturas do diálogo. `charge.id`
sozinha não bastava porque o conteúdo continua montado durante a animação de saída — o que também
reaproveitava o `idempotencyKey` e faria um segundo pagamento na mesma cobrança ser descartado como
repetido.

## Não confirmado

- Toast fica na tela por vários minutos. Provavelmente o `sonner` pausando o timer com a
  aba sem foco (automação), não bug do app. Reconferir com a janela em primeiro plano.

## Sujeira deixada na base de dev

`RL 1`…`RL 7` e `Lead Teste Manual` (convertido em cliente + assinatura + cobrança),
e um pagamento de R$ 35,00 no cliente `Teste Lead`. `pnpm db:seed:demo` é idempotente e
não limpa isso — apagar à mão ou recriar o banco se atrapalhar.

As linhas de demonstração com o id antigo (`demo-...`) foram apagadas do banco de dev e
recriadas com o id novo ao rodar `pnpm db:seed:demo` depois da correção nº 4. Quem tiver
outro banco de dev com a leva antiga precisa fazer o mesmo: o `upsert` é por `id`, então
sem apagar as antigas ficam as duas levas lado a lado.

---

# Resultado da 2ª passada — 25/08/2026

Executada com Playwright contra `localhost:3000`, banco de dev (5442), com **dado
cadastrado à mão pela tela** em vez de semeado: a base de demonstração cobre estado de
tela, não realidade — nome rotulado com o cenário, um exemplar de cada coisa, sem volume.

Foco nas seções que a 1ª passada não tocou. Releitura da lista de aprovados de 24/08
mostra que **as seções 3 (Clientes, C1–C10) e 4 (Assinaturas, S1–S7) não tiveram um único
caso executado** — 17 casos, dois deles de credencial, que é segurança. O texto anterior
não deixava isso explícito.

## Falhou — todos corrigidos e reconferidos no navegador

### 1. Campo de dinheiro erra 1000× com o cursor fora do fim

Digitar `1250` no custo de um fornecedor novo, sem clicar no campo antes, dava
`R$ 10.002,50`. Com o campo em `R$ 0,00`, tecla `Home` e depois `7`, dava `R$ 70,00` em vez
de `R$ 0,07`.

`CurrencyInput` lia os dígitos de `event.target.value` — a string inteira —, então o `0,00`
já exibido entrava na conta como escala:

| Tecla | String vira | Dígitos lidos | Valor |
|---|---|---|---|
| `1` | `1R$ 0,00` | `1000` | R$ 10,00 |
| `2` | `R$ 10,002` | `10002` | R$ 100,02 |
| `5` | `R$ 100,025` | `100025` | R$ 1.000,25 |
| `0` | `R$ 1.000,250` | `1000250` | R$ 10.002,50 |

⚠️ Segunda quebra deste campo pela mesma raiz — tratá-lo como texto. A primeira foi a
máscara controlada que perdia dígito (corrigida em `103e83d`), e a correção de lá cobriu só
o cursor no fim.

**Corrigido** (`ef8939f`). A tecla virou evento sobre o número: `appendDigit` e
`dropLastDigit` em `core/money.ts`, com teste, e `onKeyDown` barrando as teclas de edição
que num acumulador não significam nada. Colar segue pelo `onChange`, único caso em que a
string é a intenção do operador. Reconferido nos três caminhos: `R$ 12,50`, `R$ 0,07` e
backspace zerando.

### 2. `/api/health` responde `ok` sem tocar no banco

Era `return NextResponse.json({ status: 'ok' })`, sem query nenhuma. Com o Postgres de dev
parado havia 22 horas, o endpoint seguia devolvendo 200. No Cloud Run isso mantém no
balanceador uma instância que não atende requisição nenhuma.

Caso X6 ("200 com o banco de pé") nunca tinha sido conferido — o banco sempre estava de pé
quando alguém olhou.

**Corrigido** (`2eadf92`). Reconferido parando o container: `503 {"status":"degraded"}`,
sem vazar o erro do Postgres; religado, volta a `200 {"status":"ok"}` sozinho.

### 3. Percentual com ponto decimal em interface pt-BR

`Margem: 74.9%` no formulário de assinatura. Doze lugares formatavam à mão, sete com
`toFixed(0)` e cinco com `toFixed(1)`; os de uma casa mostravam ponto. Na ficha do cliente
dava para ver `margem 75%` no cabeçalho e `74.9%` no formulário logo abaixo, na mesma tela.

**Corrigido** (`373c118`). `formatPercent` em `lib/format.ts`, ao lado de `formatCents`
porque é apresentação. Mantida a precisão de cada site — mudar as casas dos relatórios
alteraria número na tela do cliente, o que não é o objetivo do fix. Reconferido:
`74,9%` na ficha, `59,8%` em fornecedores, `64,2%` no plano novo.

## Passou

| Área | Casos |
|---|---|
| Auth | **A4** (troca de senha: hash muda, `sessionVersion` 1→2, senha antiga deixa de valer, sessão própria sobrevive), **A5** (senha atual errada: erro ancorado no campo, hash e `sessionVersion` intactos) |
| Clientes | **C3** (busca por nome, filtro em `searchParams`), **C5** (telefone duplicado recusado, nada gravado), **C10** (Esc fecha a gaveta mantendo o filtro) |
| Assinaturas | **S1** (`nextDueAt` = `startedAt + ciclo`, gravado 23:59:59 local), **S2** (usuário **e** senha em `••••••••`, copiar desabilitado), **S3** (revelar audita em `credential_reveals` com data, IP, usuário e cliente; valor confere; remascara ao reabrir **sem** gravar revelação falsa) |
| Cobranças | **B1** (cadastro gera a primeira cobrança: 3990 centavos, custo congelado, vence 25/09) |
| Relatórios | **T4** (export CSV escapa fórmula: cliente renomeado para `=cmd\|'/C calc'!A0` saiu como `'=cmd...`; endpoint sem sessão devolve 307), **T5** (mês sem dado: tudo `R$ 0,00`, margem `—`, empty state, sem erro) |
| Ajustes | **F5** ponta a ponta — limite de margem de 30% para 80% levou o alerta do Início de 2 para 9 assinaturas |
| Planos e Fornecedores | criação dos dois pela tela, com valores conferidos no banco |

## Achados sem correção — decisão de produto

### Não existe logout

A barra lateral tem dez links e "Pausar envios". `/conta` tem só o formulário de senha.
`clearSessionCookie` existe em `lib/auth.ts` e **não tem um único chamador**. O caso A6
("Logout → volta pro login") não tem como passar. Numa máquina compartilhada o cookie fica.

### `/conta` é inalcançável por clique

A rota existe e funciona; link nenhum aponta para ela. Só digitando a URL.

### Troca de senha sem confirmação da nova

O formulário tem "Senha atual" e "Nova senha", sem repetir a nova. A tela de login diz que
"redefinição é feita no servidor, com o dono do sistema" — ou seja, um erro de digitação
aqui tranca o dono fora do próprio painel, sem caminho de recuperação pela interface.

### Fornecedor no formulário de plano não puxa o custo padrão

Escolher fornecedor no cadastro de plano deixa o custo em `R$ 0,00` e exibe
`Margem sugerida: 100,0%`. O formulário de assinatura, ao escolher o plano, puxa o custo
sozinho. Duas telas que escolhem fornecedor com comportamento diferente.

### Telefone duplicado mostra duas mensagens

Erro de domínio no topo do formulário ("Já existe um cliente com esse telefone.") e aviso
inline sob o campo ("Já existe um cliente com esse WhatsApp: <nome>."), ao mesmo tempo,
com palavras diferentes para a mesma coisa. O inline é melhor: nomeia quem é.

### Banco fora do ar e senha errada dão a mesma mensagem no login

"Não foi possível entrar. Tente de novo." Não revelar se o e-mail existe está certo; mandar
tentar de novo quando o banco está fora faz o operador repetir para sempre.

## Ainda sem cobertura

M13 (ação em massa > 100), N3–N6 (canais, incluindo pareamento por QR real), a régua
(R2, R3, R6–R11), Mensagens além do que a 1ª passada viu, C1/C2/C4/C7/C8/C9, S4–S7,
B7–B10, T2 na virada de ano, e a anonimização — que
[não existe](../superpowers/specs/2026-08-25-anonimizacao-lgpd-design.md).

## Sujeira deixada na base de dev

Somada à da 1ª passada: cliente `Ana Beatriz Nogueira Ramalho` com assinatura mensal de
R$ 39,90 e cobrança vencendo 25/09; fornecedor `Star Play Servidor` (R$ 12,50); plano
`Premium 4 Telas` (R$ 69,90 / R$ 25,00). `Demo · Vence Hoje` foi renomeado para testar o
escape de CSV e **devolvido ao nome original**; o limite de margem foi a 80% e **voltou a
30%**; a senha do painel foi trocada e **devolvida a `devlocal123`** (conferido com o
`verify` do argon2, não só pela tela).

---

# Resultado da 3ª passada — 25/08/2026

Régua, crons e travas. Fecha a seção 6, que tinha só quatro casos conferidos.

## Falhou — corrigido e reconferido

### A gaveta de passo guardava o formulário entre aberturas

`step-axis.tsx` montava a gaveta com `key={editing?.id ?? 'new'}`. Duas aberturas seguidas de
"Novo passo" recebem a mesma chave: o React reusa a instância e o react-hook-form devolve o
passo anterior **inteiro** — dias, direção e texto.

Dois sintomas, o segundo pior que o primeiro:

| Ação | Mostrava |
|---|---|
| Salvar um passo D-3, clicar "Adicionar passo" | `D-3 · antes do vencimento`, dias `3`, texto do passo salvo |
| Abrir um passo, editar, cancelar com Esc, reabrir | o rascunho descartado, como se fosse o salvo |

O segundo faz o operador acreditar que o texto que ele decidiu não salvar é o que está
gravado. ⚠️ Terceira ocorrência da família "conteúdo segue montado durante a animação de
fechamento" — a primeira foi o diálogo de pagamento (`103e83d`).

**Corrigido** (`d99f699`). A chave passa a incluir a contagem de aberturas. Três testes de
componente novos, conferidos nos dois sentidos: com a chave antiga, dois deles falham.

O `textarea` do texto também ganhou `aria-label`: o rótulo visível é o cabeçalho da
`DrawerSection`, um `span` sem `htmlFor`, então quem usa leitor de tela chegava no campo sem
nome. Foi o que impediu o teste de encontrá-lo pelo rótulo.

## Passou

| # | Caso | Como foi conferido |
|---|---|---|
| R2 | Criar régua | Nasce `DRAFT`, não vira padrão, e a padrão de hoje não muda. Rótulo do botão é "Criar em rascunho" |
| R3 | Criar passo | D-3 criado **depois** do D+1 aparece **antes** no eixo — ordena por offset, não por criação |
| R4 | Prévia do template | Com cliente real: `Oi Ana, sua renovação de R$ 39,90 venceu em 25/09/2026. Pix 12312312300 — MT Conexões.` |
| R5 | Variável desconhecida | `{{foo.bar}}` → "Variável de template desconhecida: foo.bar", campo marcado, **nada gravado** |
| R6 | Excluir passo | Confirmação nomeia o passo: "O passo D+1 deixa de existir nesta régua. Não dá para desfazer." |
| R7 | `DRAFT → REVIEW` | Status vira `REVIEW`, **zero** mensagens criadas, banner explica |
| R8 | Revisão antes de ativar | Diálogo traz a contagem real e as três opções |
| R9 | Ativar a régua certa | Com duas réguas, ativou **a da tela**, não a padrão. `isDefault` intocado |
| R10 | Trocar régua padrão | Confirmação nomeia as duas e o impacto ("9 assinaturas passam a ser avaliadas"). Troca atômica |
| R11 | Pausar régua | Vira `PAUSED`, e a tela distingue pausa da régua do kill switch global |
| R12 | Aviso de canal | Presente nas duas réguas |
| — | Índice `dunning_rules_single_default` | `UPDATE` forçando duas padrão no psql: **o banco recusa** |
| — | Índice `messages_dunning_daily_dedupe` | Existe como índice único parcial, com `WHERE kind='DUNNING' AND status<>'CANCELLED'` |
| — | Cron sem token | 401 em `dunning-evaluate` |
| — | Idempotência do `dunning-evaluate` | 1ª passada `queued: 1`; 2ª e 3ª `queued: 0` |
| — | Régua padrão pausada | Cron devolve `queued: 0` — o motor respeita |
| — | `messages-dispatch` sem canal | Sai em `no_default_channel`, tudo zero, mensagem fica `PENDING` |

## Achado sem correção — decisão de produto

### Régua padrão pausada para a cobrança inteira, sem aviso

Com a padrão em `PAUSED`, `dunning-evaluate` devolve `queued: 0`. Correto — mas a tela não
diz em lugar nenhum que o sistema deixou de cobrar. Pior: uma régua **`ACTIVE` que não é a
padrão** fica ao lado, e o operador lê "Ativa" e conclui que está tudo rodando. O kill
switch da barra lateral tem banner próprio; este estado não tem nenhum.

## Não exercitável neste ambiente

**T5 no despacho** (opt-out conferido também no envio). Marquei `optedOut` num cliente com
mensagem `PENDING` e o despacho devolveu `cancelledOptedOut: 0` — porque sem canal padrão
ele sai antes, em `no_default_channel`. A checagem existe e roda **antes** da de canal
(`scheduled-dispatch.ts`: "Roda depois de stale/quiet-hour/opt-out/pago: esses continuam
valendo mesmo com o canal caído") e tem teste de integração dedicado
(`scheduled-dispatch.integration.test.ts:186`). Falta a observação com canal real.

## Ainda sem cobertura

M13 (ação em massa > 100), N3–N6 (canais, incluindo pareamento por QR real), R13
(ativar sem descartar revisão, com retroativos de verdade), C1/C2/C4/C7/C8/C9, S4–S7,
B7–B10, T2 na virada de ano, e a anonimização — que não existe.

## Sujeira e restauração

Deixado: `Ana Beatriz Nogueira Ramalho`, fornecedor `Star Play Servidor`, plano
`Premium 4 Telas`, e **uma mensagem `PENDING`** de `Demo · Vence Hoje` gerada pelo cron
(vira `CANCELLED` por `stale` depois de 24h, pela trava T8).

Restaurado: régua `Cobrança suave (teste)` e seus passos **apagados**; `Régua padrão` de
volta a padrão; `optedOut` de `Demo · Vence Hoje` desfeito; limite de margem em 30%; senha
do painel em `devlocal123`.
