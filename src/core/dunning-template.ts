export const TEMPLATE_VARIABLES = [
  'cliente.primeiro_nome',
  'cliente.nome',
  'cobranca.valor',
  'cobranca.vencimento',
  'cobranca.dias_atraso',
  'pix.chave',
  'negocio.nome',
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];
export type TemplateContext = Record<TemplateVariable, string>;

const VARIABLE_PATTERN = /\{\{([^{}]+)\}\}/g;
const KNOWN_VARIABLES = new Set<string>(TEMPLATE_VARIABLES);

export function extractTemplateVariables(text: string): string[] {
  return [...text.matchAll(VARIABLE_PATTERN)].map((match) => match[1].trim());
}

export function assertKnownVariables(text: string): void {
  const unknown = extractTemplateVariables(text).filter((v) => !KNOWN_VARIABLES.has(v));
  if (unknown.length > 0) {
    throw new Error(`Variável de template desconhecida: ${[...new Set(unknown)].join(', ')}`);
  }
}

export function renderTemplate(text: string, context: TemplateContext): string {
  return text.replace(VARIABLE_PATTERN, (match, rawVariable) => {
    const variable = rawVariable.trim();
    return KNOWN_VARIABLES.has(variable) ? context[variable as TemplateVariable] : match;
  });
}
