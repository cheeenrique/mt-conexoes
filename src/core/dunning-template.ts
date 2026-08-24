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

/**
 * Ordem posicional das variáveis do template aprovado na Meta — {{1}}, {{2}}...
 * seguem a ordem de **primeira aparição** de cada variável conhecida em
 * `templateBody`, sem repetir. Existe porque a Meta valida parâmetro por
 * posição, e o texto que o operador escreve (e presumivelmente submeteu pra
 * aprovação na Meta, com {{1}}/{{2}} no lugar de {{cliente.primeiro_nome}}) já
 * é a única fonte de verdade da ordem — pedir pro operador declarar a ordem
 * de novo, num campo à parte, é o tipo de duplicação que diverge sozinha.
 *
 * Chamado ao salvar o passo (`features/dunning/service.ts`), nunca na hora de
 * enviar — é isso que vira `DunningStep.metaTemplateParams`.
 */
export function orderedTemplateParamKeys(text: string): TemplateVariable[] {
  const seen = new Set<TemplateVariable>();
  const ordered: TemplateVariable[] = [];
  for (const variable of extractTemplateVariables(text)) {
    if (KNOWN_VARIABLES.has(variable) && !seen.has(variable as TemplateVariable)) {
      seen.add(variable as TemplateVariable);
      ordered.push(variable as TemplateVariable);
    }
  }
  return ordered;
}

/**
 * Resolve os valores posicionais (`{"1": "João", "2": "R$ 60,00"}`) que vão em
 * `SendInput.templateRef.params` — chaves numéricas em string, que é o que o
 * adapter da Meta espera (`Object.values` num objeto com chaves inteiras sai
 * na ordem numérica, não na ordem de inserção). Chamado na avaliação, com o
 * mesmo `context` que também renderiza o corpo — os dois nunca podem divergir.
 */
export function resolveTemplateParams(paramKeys: readonly TemplateVariable[], context: TemplateContext): Record<string, string> {
  const params: Record<string, string> = {};
  paramKeys.forEach((key, index) => {
    params[String(index + 1)] = context[key];
  });
  return params;
}

/**
 * Valor de exemplo de cada variável, exibido no chip do editor de template
 * (handoff `telas/07-reguas.md` §"Texto da mensagem"). Fica aqui, junto de
 * `TEMPLATE_VARIABLES`, para que uma variável nova nunca apareça na tela sem
 * exemplo — o `Record` completo quebra o typecheck se alguém esquecer.
 *
 * ⚠️ A senha de acesso do assinante não é, e não passa a ser, variável de
 * template — ver CLAUDE.md §Segurança.
 */
export const TEMPLATE_VARIABLE_EXAMPLES: Record<TemplateVariable, string> = {
  'cliente.primeiro_nome': 'João',
  'cliente.nome': 'João Silva',
  'cobranca.valor': 'R$ 120,00',
  'cobranca.vencimento': '10/08',
  'cobranca.dias_atraso': '3',
  'pix.chave': '62998133400',
  'negocio.nome': 'MT Conexões',
};
