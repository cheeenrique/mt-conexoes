/**
 * Vocabulário de paginação das listas: quantos itens a tabela mostra e como o
 * `searchParams` vira esse número.
 *
 * Mora em `components/ui/` porque é de lá que o `DataTable` precisa dele, e
 * `components/ui/` não pode importar de `core/`, `lib/` nem `features/`
 * (`.claude/rules/01-arquitetura.md` §Matriz de import). `app/` e `features/`
 * podem importar daqui — a seta aponta nessa direção.
 *
 * ⚠️ Existe porque a lista `[8, 12, 20]` estava copiada em seis arquivos e o
 * tipo `8 | 12 | 20` escrito à mão em mais de doze — cinco páginas, os
 * componentes de tabela e as queries. Trocar o padrão de 8 para 10 exigia
 * acertar todos; esquecer um dava tela com paginação diferente das outras, sem
 * erro nenhum acusando. Agora o tipo é derivado da lista: acrescentar ou tirar
 * uma opção não deixa nada para trás.
 */

export const PER_PAGE_OPTIONS = [10, 12, 20] as const;

export type PerPage = (typeof PER_PAGE_OPTIONS)[number];

/** O que a tabela mostra quando o endereço não pede outra coisa. */
export const DEFAULT_PER_PAGE: PerPage = 20;

/** Traduz `?perPage=` do endereço. Valor ausente, quebrado ou fora da lista cai no padrão. */
export function resolvePerPage(raw: string | undefined): PerPage {
  const value = Number(raw);
  return (PER_PAGE_OPTIONS as readonly number[]).includes(value) ? (value as PerPage) : DEFAULT_PER_PAGE;
}
