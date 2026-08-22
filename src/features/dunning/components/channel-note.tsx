/**
 * Cartão de nota sobre o canal em uso, no fim do detalhe da régua.
 *
 * ⚠️ Nenhuma credencial chega aqui, nem mascarada — só o nome do canal e o que
 * a escolha dele significa para os passos.
 *
 * ⚠️ O texto descreve o que o código **faz hoje**. O handoff diz que passo sem
 * template aprovado "fica pulado com o motivo template não aprovado"; esse
 * `SKIPPED` não existe: `meta-cloud/adapter.ts` devolve
 * `{ ok: false, retryable: false }` e a mensagem termina como `FAILED` com esse
 * motivo, visível na tela de Mensagens. Prometer "pulado" aqui faria o operador
 * procurar um estado que nunca aparece.
 *
 * O comportamento é decidido por `requiresApprovedTemplate`, não por
 * `if (provider === ...)`: quem entende de template é o adapter.
 */
export function ChannelNote({
  channel,
}: {
  channel: { label: string; requiresApprovedTemplate: boolean } | null;
}) {
  return (
    <section className="flex flex-col gap-2.5 rounded border border-border bg-surface p-4">
      <span className="text-xs font-bold uppercase tracking-[.08em] text-foreground-muted">
        Canal padrão: {channel?.label ?? 'nenhum configurado'}
      </span>
      <p className="leading-relaxed text-foreground-muted">
        {!channel
          ? 'Sem canal ativo, nenhum passo de mensagem chega ao cliente. Configure um canal em Ajustes antes de ativar a régua.'
          : channel.requiresApprovedTemplate
            ? 'Este canal só entrega template aprovado fora de conversa iniciada pelo cliente. Passo com texto livre não chega: o envio volta como falha, com o motivo do provedor, na tela de Mensagens.'
            : 'Aceita texto livre. Trocar para a Meta Cloud muda isso — lá, fora da janela de 24 horas, só template aprovado chega, e passo sem template volta como falha em vez de sair.'}
      </p>
    </section>
  );
}
