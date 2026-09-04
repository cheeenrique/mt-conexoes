import type { ChannelAdapter } from './types';

/**
 * Contrato **opcional** de pareamento. Fica fora de `ChannelAdapter` de propósito:
 * a Meta Cloud não parea por QR, e obrigá-la a implementar `beginPairing()` só para
 * lançar quebraria LSP e ISP (`~/.claude/rules/01-solid.md`) — um consumidor que
 * chamasse o método pelo supertipo receberia exceção em vez de comportamento.
 *
 * Quem declara que existe caminho de pareamento é o **descritor**
 * (`ChannelConnectionMethod.kind === 'PAIRING'`), não um `if (provider === ...)`.
 * `isPairable()` é a ponte entre as duas declarações e tem **um** consumidor:
 * o service de pareamento, que falha alto se elas divergirem.
 */

export type PairingState = 'DISCONNECTED' | 'AWAITING_SCAN' | 'CONNECTING' | 'CONNECTED';

/**
 * O desafio que o operador precisa resolver no celular.
 *
 * ⚠️ Não é persistido em lugar nenhum: nasce na Server Action, vai por prop até o
 * `<img>` e morre com o diálogo. Mesma disciplina da revelação da senha do assinante.
 * QR do WhatsApp expira em menos de um minuto — guardar seria guardar lixo com cara
 * de credencial. Nem `qrBase64` nem `pairingCode` entram em log.
 */
export type PairingChallenge = {
  /** PNG em data-URI, pronto para o `src` de um `<img>`. */
  qrBase64?: string;
  /** Código de 8 caracteres — alternativa ao QR para quem está no desktop sem a câmera na mão. */
  pairingCode?: string;
  state: PairingState;
};

/**
 * O que o **painel** decide e o canal obedece na hora de provisionar. Nada aqui é
 * digitado pelo operador: nome de instância e token de webhook são gerados por nós,
 * e a URL do webhook sai da configuração do deploy.
 */
export type PairingProvisionOptions = {
  instanceName: string;
  /** Nosso segredo, entregue ao provider como header do webhook. É o que faz T5 funcionar. */
  webhookToken: string;
  webhookUrl: string;
};

/**
 * O que `beginPairing` devolve: o desafio pro operador **e** o que persistir em
 * `ChannelConfig.credentials` além de `instanceName`/`webhookToken` (esses dois quem gera é
 * `pairing.service.ts`, que já os manda em `options`). O adapter decide o resto porque só ele
 * sabe se algum campo — endereço do servidor, chave de API — vem de variável de ambiente em
 * vez do que o operador digitou (Evolution: os dois vêm de `EVOLUTION_BASE_URL`/`EVOLUTION_API_KEY`,
 * não da tela — ver `channels/evolution/pairing.ts`).
 */
export type PairingProvisionResult = {
  challenge: PairingChallenge;
  credentials: Record<string, unknown>;
};

export interface PairableChannel {
  /** Provisiona do zero e devolve o primeiro desafio. */
  beginPairing(credentials: unknown, options: PairingProvisionOptions): Promise<PairingProvisionResult>;
  /**
   * Pede um desafio novo — o anterior expirou, ou o operador só quer reabrir a tela. Já
   * devolve `CONNECTED` quando a sessão abriu, então não existe um `pairingState()` separado:
   * seria uma indireção sem consumidor, e "o canal está de pé?" já é `healthCheck()`.
   */
  refreshChallenge(credentials: unknown): Promise<PairingChallenge>;
  /** Desconecta o telefone sem apagar o que já foi provisionado. */
  unpair(credentials: unknown): Promise<void>;
  /**
   * Troca só o número — reusa endereço e chave já salvos, nunca pede de novo. É o que
   * faz o operador leigo não precisar redigitar credencial nenhuma só porque trocou de
   * chip: o painel já sabe onde falar e com qual chave, só falta o número novo.
   *
   * O adapter decide como por trás (na Evolution: apagar a sessão antiga e recriar —
   * ela não tem "trocar número" de uma instância existente). Quem chama não sabe disso.
   */
  changeNumber(credentials: unknown, newPairingNumber: string, webhookUrl: string): Promise<PairingChallenge>;
}

export function isPairable(adapter: ChannelAdapter): adapter is ChannelAdapter & PairableChannel {
  const candidate = adapter as Partial<PairableChannel>;
  return (
    typeof candidate.beginPairing === 'function' &&
    typeof candidate.refreshChallenge === 'function' &&
    typeof candidate.unpair === 'function' &&
    typeof candidate.changeNumber === 'function'
  );
}
