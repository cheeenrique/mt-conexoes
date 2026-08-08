import { describe, expect, it } from 'vitest';
import { extractTemplateVariables, assertKnownVariables, renderTemplate } from './dunning-template';

describe('extractTemplateVariables', () => {
  it('extrai zero variáveis de texto sem {{}}', () => {
    expect(extractTemplateVariables('Olá! Sua cobrança venceu.')).toEqual([]);
  });

  it('extrai uma variável', () => {
    expect(extractTemplateVariables('Olá {{cliente.primeiro_nome}}!')).toEqual(['cliente.primeiro_nome']);
  });

  it('extrai múltiplas variáveis, preservando repetição', () => {
    const text = '{{cliente.nome}} deve {{cobranca.valor}}, use {{pix.chave}}. Confirma, {{cliente.nome}}?';
    expect(extractTemplateVariables(text)).toEqual([
      'cliente.nome', 'cobranca.valor', 'pix.chave', 'cliente.nome',
    ]);
  });

  it('chaves aninhadas {{a{{b}}c}} casam só o par interno mais próximo', () => {
    expect(extractTemplateVariables('{{a{{b}}c}}')).toEqual(['b']);
  });

  it('chaves vazias {{}} não casam — nome de variável vazio não é match', () => {
    expect(extractTemplateVariables('X={{}}')).toEqual([]);
  });

  it('chave não fechada não casa', () => {
    expect(extractTemplateVariables('{{cliente.nome')).toEqual([]);
  });
});

describe('assertKnownVariables', () => {
  it('aceita as 7 variáveis da whitelist', () => {
    const text = `{{cliente.primeiro_nome}} {{cliente.nome}} {{cobranca.valor}}
      {{cobranca.vencimento}} {{cobranca.dias_atraso}} {{pix.chave}} {{negocio.nome}}`;
    expect(() => assertKnownVariables(text)).not.toThrow();
  });

  it('rejeita variável desconhecida', () => {
    expect(() => assertKnownVariables('Olá {{cliente.apelido}}')).toThrow(/cliente.apelido/);
  });

  it('rejeita {{assinatura.senha}} — nunca pode existir como variável válida', () => {
    expect(() => assertKnownVariables('Sua senha é {{assinatura.senha}}')).toThrow(/assinatura.senha/);
  });

  it('texto sem variável nenhuma passa', () => {
    expect(() => assertKnownVariables('Texto fixo sem chave.')).not.toThrow();
  });
});

describe('renderTemplate', () => {
  const context = {
    'cliente.primeiro_nome': 'João',
    'cliente.nome': 'João Silva',
    'cobranca.valor': 'R$ 60,00',
    'cobranca.vencimento': '10/08',
    'cobranca.dias_atraso': '3',
    'pix.chave': 'chave-pix-exemplo',
    'negocio.nome': 'MT Conexões',
  } as const;

  it('substitui uma ocorrência', () => {
    expect(renderTemplate('Olá {{cliente.primeiro_nome}}!', context)).toBe('Olá João!');
  });

  it('substitui todas as ocorrências repetidas da mesma variável', () => {
    expect(renderTemplate('{{cliente.nome}}, {{cliente.nome}}!', context)).toBe('João Silva, João Silva!');
  });

  it('substitui múltiplas variáveis diferentes', () => {
    const text = 'Olá {{cliente.primeiro_nome}}! Sua renovação de {{cobranca.valor}} vence {{cobranca.vencimento}}. Pix: {{pix.chave}}';
    expect(renderTemplate(text, context)).toBe('Olá João! Sua renovação de R$ 60,00 vence 10/08. Pix: chave-pix-exemplo');
  });

  it('texto sem variável retorna igual', () => {
    expect(renderTemplate('Texto fixo.', context)).toBe('Texto fixo.');
  });

  it('não vaza propriedade herdada do prototype — {{constructor}} fica literal', () => {
    expect(renderTemplate('{{constructor}}', context)).toBe('{{constructor}}');
  });
});
