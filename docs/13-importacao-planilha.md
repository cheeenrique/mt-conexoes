# 13 — Importação de Planilha

> ⚠️ Provavelmente a feature mais importante do produto. Importação ruim é o motivo nº 1 de um SaaS de cobrança perder o cliente na primeira semana. Ele sobe a planilha, o resultado sai errado, e ele volta para o Excel.

## Pipeline

```
Upload → Análise → Mapeamento de colunas → Mapeamento de VALORES
   → Transformações → Validação (dry-run) → Preview → Execução → Relatório → Desfazer
```

Cada fase é um estado persistido em `ImportBatch`. O operador pode sair e voltar sem perder trabalho.

---

## Fase 1 — Upload

Formatos: `.xlsx`, `.xls`, `.csv`, `.tsv`. Limite 20 MB / 50.000 linhas no MVP.

⚠️ **Guardar o arquivo original** (R2/S3). Necessário para reprocessar e para investigar suporte. TTL 90 dias (LGPD).

Parse no **backend**, não no browser: uma verdade só, arquivos grandes, e o resultado precisa ser persistido de qualquer forma. `ExcelJS` com streaming reader — `.xlsx` grande estoura memória em parser síncrono.

---

## Fase 2 — Análise automática

Metade do trabalho está aqui.

**Qual aba?** Planilha real tem "Clientes", "Financeiro", "Plan1", "jan", "fev". Heurística: aba com mais linhas estruturadas. O operador pode trocar.

**Onde está o cabeçalho?** Raramente na linha 1 — há título mesclado, logo, linhas vazias. Heurística: primeira linha onde ≥60% das células são texto curto não-numérico e as linhas seguintes têm tipos consistentes. Permitir ajuste manual.

**Descartar rodapé:** linhas com "TOTAL", "SOMA", ou vazias no fim.

**Inferir tipo por coluna** amostrando 50 linhas: CPF/CNPJ, telefone, e-mail, data, moeda, texto, booleano.

Para responder rápido, a análise inicial lê só as primeiras ~200 linhas.

---

## Fase 3 — Mapeamento de colunas

Sugestão automática combinando **duas fontes de sinal**:

**1. Nome da coluna** — normalizar (minúsculas, sem acento, sem espaço) e comparar contra dicionário PT-BR com fuzzy match:

```
name        ← nome, cliente, nome do cliente, assinante, razao social, contratante
phone       ← telefone, celular, whatsapp, zap, fone, contato, tel, numero
email       ← email, e-mail, correio
document    ← cpf, cnpj, documento, doc
dueDate     ← vencimento, venc, data venc, proximo vencimento, renovacao, validade
amount      ← valor, mensalidade, preco, valor mensal, plano r$, mensal
plan        ← plano, pacote, tipo, servico, produto
status      ← status, situacao, ativo, condicao
startDate   ← inicio, data cadastro, cadastro, entrada, adesao
city        ← cidade, municipio, local
notes       ← obs, observacao, anotacao, comentario
```

**2. Conteúdo da coluna** — regex/validação na amostra. Coluna chamada "Obs" cheia de `(62) 9xxxx-xxxx` é telefone, não observação.

**UI:** para cada coluna, mostrar nome original, **3 valores reais de exemplo**, destino sugerido e nível de confiança (alta/média/baixa, com destaque nas de baixa). Opções: mapear, ignorar, ou guardar como campo personalizado.

---

## Fase 4 — Mapeamento de valores

⚠️ O passo que quase todo mundo esquece — e que causa o pior erro do sistema.

Mapear a coluna `Status` não basta. A planilha tem:

```
ATIVO / Ativo / ativo / A / Pago / Em dia / OK / ✔  →  ?
VENCIDO / Atrasado / Devendo / Pendente / X          →  ?
CANCELADO / Cancelou / Saiu / Inativo / Teste        →  ?
```

Tela dedicada: **para cada valor distinto encontrado, para qual valor do sistema ele vai.** Agrupa automaticamente o que der (case-insensitive, sem acento); o resto o operador decide.

Vale para: `status`, `plan` (cria plano novo ou mapeia para existente) e `paymentMethod`.

Sem isso, você importa 300 clientes com status errado e a régua manda cobrança para quem já pagou.

---

## Fase 5 — Transformações

Configuráveis por campo, com preview ao vivo.

**Data** ⚠️ `dd/mm/yyyy` vs `mm/dd/yyyy` é ambíguo e perigoso: `03/04/2026` é 3 de abril ou 4 de março? Detectar pela amostra (se existir algum dia > 12, resolve); quando ambíguo, **perguntar explicitamente**. Tratar também serial numérico do Excel (`45678`) e datas armazenadas como texto.

**Moeda** — `R$ 1.234,56`, `1234,56`, `1,234.56`, `25`. Detectar separador decimal pela amostra. Converter para **centavos inteiros**.

**Telefone** — máscara, com/sem DDD, com/sem `+55`, com/sem 9º dígito, dois números na mesma célula separados por `/` ou `,`. Normalizar para E.164. ⚠️ Quando houver mais de um, criar **contato secundário**, não descartar.

**Texto** — trim, colapsar espaços, opção de converter CAIXA ALTA para Nome Próprio (com preview).

---

## Fase 6 — Validação (dry-run)

Separar **erro** (bloqueia a linha) de **aviso** (importa, mas sinaliza):

| Tipo | Exemplos |
|---|---|
| Erro | Sem telefone e sem e-mail · valor não numérico · data inválida · nome vazio |
| Aviso | CPF com dígito inválido · vencimento no passado · plano não cadastrado (será criado) · duplicado · valor zero |

**Duplicados internos** — mesmo cliente em 3 linhas é comum, porque cada linha costuma ser uma renovação. **Duplicados contra a base** — já existe no sistema.

Chave de dedupe escolhível: telefone (padrão), e-mail, documento, ou nome+telefone. Para cada duplicado: criar mesmo assim · atualizar existente · ignorar.

---

## Fase 7 — Preview

```
✓ 312 clientes serão criados
✓ 298 assinaturas serão criadas
✓   3 planos novos: "Premium", "Full HD", "Teste 3 dias"
⚠  12 linhas duplicadas (serão atualizadas)
⚠   8 vencimentos já passaram
✗   4 linhas com erro (serão ignoradas)   [ver detalhes]

☐ Ignorar cobranças retroativas — considerar apenas vencimentos a partir de hoje
```

Mais uma tabela com as primeiras 20 linhas **já transformadas**, do jeito que vão ficar no sistema — não os dados crus. É isso que dá confiança para clicar em importar.

---

## Fase 8 — Execução

Job assíncrono em lotes de ~500 linhas, cada lote em transação própria. Progresso por polling. ⚠️ Nunca uma transação única para 5.000 linhas.

Toda entidade criada carrega `importBatchId`.

---

## Fase 9 — Relatório e desfazer

Relatório com: criados, atualizados, ignorados, e CSV de erros para correção.

**Desfazer** disponível por 7 dias, com contagem do que será removido. Remove por `importBatchId`. ⚠️ Se houver pagamento registrado após a importação, o rollback é bloqueado (não se apaga histórico financeiro) — o operador é avisado com a lista.

Sem rollback, o primeiro import errado vira ticket de suporte e limpeza manual no banco — e o operador nunca mais tenta.

---

## ⚠️ Trava de segurança pós-importação

Cenário real: importa 400 clientes, 180 com vencimento atrasado. A régua acorda e dispara **180 mensagens de cobrança** para gente que já pagou — porque o status estava errado, ou porque a planilha só tinha histórico.

Resultado: número de WhatsApp com quality rating no chão ou banido, e cancelamento no mesmo dia.

**Regra obrigatória:** `import.completed` → régua entra em modo `REVIEW` (T1, doc 09). Complementos: limite de 50 mensagens/dia nas primeiras 48h (T2), confirmação em duas etapas acima de 100 mensagens (T3), e opção "ignorar retroativos" no próprio preview (T4).

Isso está no mesmo nível de prioridade que RLS. Não corte por prazo.

---

## Armadilhas específicas do nicho

| Situação | Tratamento |
|---|---|
| **Uma aba/arquivo por fornecedor** (Tubarão, Club TV…) | Wizard pergunta o fornecedor do lote e vincula a `Supplier` (doc 17) |
| **Uma aba por mês** (`jan`, `fev`, `mar`) | Detectar e oferecer importar múltiplas, ou avisar que só uma será lida |
| **Formato wide** — colunas `Jan\|Fev\|Mar` com "pago/não pago" | Detectar (várias colunas com nome de mês) e oferecer modo "converter meses em histórico de pagamentos" |
| **Cor como significado** — vermelho = inadimplente | Perde-se na importação. ⚠️ Avisar explicitamente na análise, senão ele acha que o sistema errou |
| **Células mescladas** e linhas vazias no meio | Ignorar e reportar |
| **Uma linha = cliente + assinatura + pagamento** | Modo de importação: só clientes · clientes + assinaturas · + histórico |
| **CSV com `;` e encoding latin1** | Detectar separador e encoding. Não assumir UTF-8 |
| **Login/senha de painel de terceiro numa coluna** | Mapear para campo personalizado tipo `SECRET` (doc 17). ⚠️ Opt-in explícito, criptografado, acesso auditado, fora de export e log |
| **Valores por extenso** ("cinquenta reais") | Marcar como erro; não tentar adivinhar |

---

## Extras de alto retorno

**Salvar o mapeamento como template.** Ele vai importar de novo — mês que vem, outra aba. "Usar mapeamento da importação anterior" transforma 10 minutos em 30 segundos, e é trivial porque `columnMap` já está persistido.

**Sugestão por IA como fallback.** Para planilhas caóticas onde a heurística falha, enviar **apenas cabeçalho + 5 linhas de amostra** (nunca a planilha inteira — custo e privacidade) para o modelo sugerir o mapeamento. ⚠️ Sempre como sugestão revisável, nunca aplicado automaticamente. Registrar consentimento no primeiro uso.

---

## Modelo de importação manual

Nem todo mundo tem planilha. O passo 3 do onboarding aceita também:

- Cadastro manual de um cliente (formulário rápido)
- Colar dados de uma planilha (paste de tabela direto na tela)

Ambos satisfazem o passo. O objetivo é ter dados no sistema, não usar uma ferramenta específica.
