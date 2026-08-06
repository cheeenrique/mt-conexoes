# 08 — Site de captação

> Aplicação **separada** do sistema de gestão: outro repositório, outro deploy, outro domínio.
> Objetivo único: transformar busca orgânica em contato — WhatsApp ou formulário.

## Por que separado

⚠️ SEO no nicho de assinatura digital é espaço adversarial. Deindexação por DMCA e queda de ranking por conteúdo pirata-adjacente acontecem sem que você tenha feito nada errado.

Se o domínio de captação for penalizado ou derrubado, **o painel de gestão precisa continuar no ar**. Isso exige:

- Domínios distintos, sem subdomínio compartilhado
- Contas de hospedagem distintas (Cloudflare Pages para o site, Cloud Run para o sistema)
- Nenhum registro DNS em comum
- A única ligação entre os dois é uma chamada HTTP de captura de lead, que degrada sem quebrar nada

## Stack

| Camada | Escolha | Motivo |
|---|---|---|
| Framework | **Astro** | Envia ~0 KB de JS por padrão. Numa página que é texto, isso é a diferença de LCP que o Next só alcança com trabalho |
| Conteúdo | Content Collections + MDX | Blog e FAQ como arquivos tipados, versionados no git. Sem CMS, sem banco |
| Estilo | Tailwind | Mesma linguagem visual do painel |
| Hospedagem | **Cloudflare Pages** | Gratuito, HTML estático servido de PoP em GRU. Sem cold start, sem função |
| Analytics | **Cloudflare Web Analytics** | Sem cookie, sem banner de consentimento, sem custo de bundle. GA4 aqui seria peso e passivo de LGPD sem contrapartida |
| Formulário | Astro Action → API do sistema | Ver abaixo |

Interatividade é ilha (`client:visible`), nunca página inteira. O menu mobile e o formulário são as **únicas** ilhas previstas.

---

## Conversão

O erro central do site de referência: **todos os CTAs apontam para o mesmo link encurtado**. Hero, três planos, seção de WhatsApp, pós-depoimento e FAQ vão para o mesmo destino. O resultado é otimizar no escuro — não dá para saber qual seção converte, qual plano vende, se o blog traz cliente.

### Dois caminhos, os dois rastreados

**1. WhatsApp** — deeplink com texto pré-preenchido que identifica a origem:

```
https://wa.me/55DDNNNNNNNNN?text=Ol%C3%A1%21%20Vim%20pela%20p%C3%A1gina%20de%20planos%20e%20quero%20o%20plano%20trimestral.
```

Cada página e cada seção usa um texto diferente. Quando a mensagem chega, o dono já sabe de onde veio e o que a pessoa quer — sem ferramenta nenhuma.

**2. Formulário** — para quem não quer abrir o WhatsApp, e para não perder o lead na rolagem da conversa:

```
Nome · WhatsApp · Plano de interesse · Cidade (opcional)
```

Envia para um endpoint público do sistema de gestão, que grava um `Lead` e notifica o dono. O lead vira `Customer` com um clique no painel.

```ts
// no sistema de gestão: app/api/leads/route.ts
// @Public — sem sessão, com Turnstile e rate limit por IP
```

⚠️ Este endpoint é público e escreve no banco. Exige: token do Cloudflare Turnstile validado no servidor, rate limit por IP, validação Zod estrita, e `CHECK` de tamanho nos campos. Sem isso, é formulário de spam com acesso ao seu banco.

⚠️ Se o endpoint estiver fora do ar, o formulário **cai para o WhatsApp**, não para uma tela de erro. O site nunca depende do sistema para converter.

### Rastreamento

Todo CTA carrega `?utm_source`, `utm_medium`, `utm_campaign` e um `data-cta` distinto. Cloudflare Web Analytics registra o evento. Sem isso, a próxima decisão de conteúdo é chute.

---

## Arquitetura de conteúdo

Uma intenção de busca por página. **Duas páginas mirando a mesma query competem entre si** — é o que acontece no site de referência, onde a home cobre tudo que `/planos` também cobre.

| Página | Intenção | Alvo de palavra-chave |
|---|---|---|
| `/` | Comercial, marca + termo principal | termo principal + "melhor" + ano |
| `/planos` | Transacional | "[serviço] preço", "[serviço] quanto custa" |
| `/teste-gratis` | Transacional, alta intenção | "teste grátis [serviço]" |
| `/canais` | Investigativa | "lista de canais [serviço]" |
| `/como-funciona` | Informacional, topo de funil | "o que é [serviço]", "como funciona" |
| `/perguntas-frequentes` | Informacional, cauda longa | perguntas literais |
| `/[cidade]` | Local | "[serviço] em [cidade]" |
| `/blog/[slug]` | Informacional, cauda longa | uma pergunta por post |
| `/sobre`, `/contato` | Confiança / E-E-A-T | marca |
| `/termos`, `/privacidade` | Obrigatório | — |

### Escopo fechado

**8 páginas fixas + 3 páginas locais + 6 posts de blog.** Página ou post além disso é R$ 150/hora, orçado antes.

Sem teto, site de conteúdo é trabalho infinito — e é justamente o que consome um projeto de preço fechado.

### Regras de conteúdo

- **Um `<h1>` por página**, contendo o alvo. `h2`/`h3` em hierarquia real, não por tamanho de fonte.
- Página comercial: mínimo 600 palavras. Página informacional: 1.200+. Post: 1.000+.
- **Link interno com âncora descritiva.** "Veja nossos planos" e não "clique aqui". Toda página informacional linka para `/planos` ou `/teste-gratis`.
- FAQ tem página própria **e** blocos de 3 a 5 perguntas nas páginas relevantes — as da página própria não se repetem literalmente nas outras.
- ❌ Densidade forçada de palavra-chave. O site de referência repete o termo 30+ vezes; hoje isso não ajuda e sinaliza conteúdo de baixa qualidade.

### E-E-A-T — o que não copiar do referência

| Antipadrão no referência | O que fazer |
|---|---|
| Endereço genérico (Av. Paulista, 1000) | Endereço real ou nenhum. Endereço falso é risco jurídico e sinal negativo |
| Depoimentos só com iniciais | Depoimento real com autorização, ou nenhum. Print de conversa com o rosto borrado vale mais que "J.S. — São Paulo" |
| Nenhuma identificação do responsável | Página `/sobre` com quem opera, há quanto tempo, como falar |

Depoimento fabricado é exatamente o padrão que o sistema de conteúdo útil do Google penaliza — e é o tipo de coisa que derruba um site inteiro, não uma página.

---

## SEO técnico

### Dados estruturados (JSON-LD)

| Schema | Onde |
|---|---|
| `Organization` | Todas as páginas, no layout |
| `WebSite` + `SearchAction` | Home |
| `BreadcrumbList` | Todas exceto a home |
| `FAQPage` | `/perguntas-frequentes` e páginas com bloco de FAQ |
| `Article` | Posts do blog, com `datePublished` e `author` |
| `Product` + `Offer` | `/planos`, um por plano, com `price` e `priceCurrency` |
| `LocalBusiness` | Páginas de cidade, **só se o endereço for real** |

⚠️ `FAQPage` é o de maior retorno: 17 perguntas prontas sem schema, como no referência, é rich result deixado na mesa.

### Obrigatórios

- [ ] `sitemap.xml` gerado no build (`@astrojs/sitemap`), submetido no Search Console
- [ ] `robots.txt` apontando o sitemap
- [ ] `<link rel="canonical">` absoluto em toda página
- [ ] Title único, 50–60 caracteres, com o alvo à esquerda
- [ ] Meta description única, 140–160 caracteres, escrita para clique — não é fator de rank, é fator de CTR
- [ ] Open Graph e Twitter Card com imagem 1200×630 por página
- [ ] RSS do blog
- [ ] 404 com busca e links para as páginas principais
- [ ] `lang="pt-BR"` no `<html>`
- [ ] URLs em kebab-case, sem data, sem id, sem `.html`
- [ ] Redirect 301 de qualquer URL que mudar — nunca deixar 404

### Core Web Vitals

Orçamento, medido em 4G simulado, não em desktop com fibra:

| Métrica | Alvo |
|---|---|
| LCP | < 1,8 s |
| INP | < 200 ms |
| CLS | < 0,1 |
| JS enviado por página | < 20 KB comprimido |
| Peso total da home | < 500 KB |

Como se chega lá:

- **Imagem:** `<Image />` do Astro, AVIF com fallback WebP, `width`/`height` sempre declarados (CLS), `loading="lazy"` exceto na do hero, que é `fetchpriority="high"`.
- **Fonte:** self-hosted woff2 com subset latino, `font-display: swap`, `preload` na do hero. ❌ Google Fonts por CDN — é requisição de terceiro no caminho crítico e passivo de LGPD.
- **JS:** nenhum por padrão. Ilha só onde há interação.
- **Terceiros:** nenhum script de terceiro bloqueante. Pixel de anúncio, se entrar, vai depois do `load`.
- **CSS:** crítico inline, resto adiado.

⚠️ CWV é conferido no **PageSpeed Insights com dado de campo**, não no Lighthouse local. Lighthouse local passa e campo reprova o tempo todo.

---

## Entrega

Etapa 5 do [plano](./07-plano-de-entrega.md), semanas 8 a 10.

- [ ] Astro + Tailwind + Cloudflare Pages, domínio apontado
- [ ] 8 páginas fixas com conteúdo real (não lorem)
- [ ] 3 páginas locais
- [ ] Blog com 6 posts
- [ ] JSON-LD em todas as páginas aplicáveis
- [ ] Sitemap, robots, canonical, OG, RSS
- [ ] Formulário com Turnstile → endpoint de lead no sistema, com fallback para WhatsApp
- [ ] CTAs com UTM e `data-cta` distintos
- [ ] Cloudflare Web Analytics ativo
- [ ] Search Console verificado, sitemap submetido
- [ ] PageSpeed Insights verde nas três métricas, em mobile

**Critério de pronto:** o site está no ar, indexado, o formulário gera um `Lead` visível no painel, e o PageSpeed Insights mobile passa em LCP, INP e CLS.

⚠️ **Posição em busca não é critério de pronto.** Ranquear leva de 3 a 6 meses e depende de fatores fora do controle de quem constrói. O que se entrega é o site tecnicamente correto e indexável — não uma posição.

Isso precisa estar escrito no contrato. É a expectativa que mais gera atrito em projeto de site com SEO.
