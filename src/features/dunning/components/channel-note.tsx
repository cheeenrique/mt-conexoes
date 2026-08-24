/**
 * Cartão de nota sobre o canal em uso, no fim do detalhe da régua.
 *
 * ⚠️ Nenhuma credencial chega aqui, nem mascarada — só o nome do canal e o que
 * a escolha dele significa para os passos.
 *
 * ⚠️ O texto descreve o que o código **faz hoje**: passo `SEND_MESSAGE` sem
 * `metaTemplateName`, num canal `requiresApprovedTemplate`, vira execução
 * `SKIPPED` (motivo `template_not_approved`) em `dunning-evaluate` — nunca
 * chega a virar `Message`. Com o template preenchido, o envio por template já
 * sai de verdade **quando o cliente tem uma cobrança só**; cliente com mais de
 * uma cobrança vencida no mesmo passo (consolidação, T7) ainda não tem
 * template de consolidação aprovado, e o passo vira `SKIPPED` (motivo
 * `consolidation_template_missing`) em vez de tentar um envio parcial. Ver
 * `docs/projeto/tecnico/06-regua-e-canais.md`.
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
            ? 'Este canal só entrega template aprovado fora de conversa iniciada pelo cliente. Passo sem um template aprovado marcado é pulado automaticamente — não tenta um texto livre que a Meta recusaria. Cliente com mais de uma cobrança vencida no mesmo dia (mensagem consolidada) ainda é pulado mesmo com template marcado, até existir um template de consolidação aprovado.'
            : 'Aceita texto livre. Trocar para a Meta Cloud muda isso — lá, fora da janela de 24 horas, só template aprovado chega, e passo sem template marcado é pulado em vez de tentar sair.'}
      </p>
    </section>
  );
}
