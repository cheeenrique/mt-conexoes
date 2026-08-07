const CHANNELS = [
  { name: 'Meta Cloud API', type: 'oficial' },
  { name: 'Evolution API', type: 'não oficial, servidor próprio' },
  { name: 'Salvy', type: 'não oficial, nuvem' },
];

export function ChannelsTab() {
  return (
    <div className="flex flex-col gap-3">
      {CHANNELS.map((channel) => (
        <div
          key={channel.name}
          className="grid grid-cols-[minmax(0,1fr)_132px_236px] items-center gap-4 rounded border border-border bg-surface px-4 py-3.5"
        >
          <div className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
            <div>
              <p className="text-sm font-bold text-foreground">{channel.name}</p>
              <p className="text-xs text-foreground-muted">{channel.type}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-foreground-muted">Situação</p>
            <span className="text-xs font-bold text-foreground-muted">Não configurado</span>
          </div>
          <div className="flex justify-end">
            <span title="Disponível na Etapa 3">
              <button
                type="button"
                aria-disabled="true"
                disabled
                className="h-9 rounded-sm border border-border px-3 text-xs font-semibold text-foreground-muted opacity-50"
              >
                Configurar
              </button>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
