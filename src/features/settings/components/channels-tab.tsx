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
          className="grid items-center gap-4 rounded border border-border bg-surface px-4 py-3.5"
          style={{ gridTemplateColumns: 'minmax(0,1fr) 132px 200px 236px' }}
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
          <div />
          <div className="flex justify-end">
            <button
              type="button"
              disabled
              title="Disponível na Etapa 3"
              className="h-9 rounded-sm border border-border px-3 text-xs font-semibold text-foreground-muted opacity-50"
            >
              Configurar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
