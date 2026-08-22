export function PauseBanner({ paused }: { paused: boolean }) {
  if (!paused) return null;
  return (
    <div className="bg-brand px-4 py-2 text-center text-[13px] font-bold text-background">
      Envios pausados. Nenhuma mensagem automática sai enquanto isso.
    </div>
  );
}
