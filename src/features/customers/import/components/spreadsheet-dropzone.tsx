'use client';

import { useRef, useState } from 'react';
import { FileSpreadsheet, Upload, X } from 'lucide-react';

/**
 * Área de arrastar-ou-clicar para a planilha da importação.
 *
 * Mora na feature, e não em `components/ui/`, porque tem **um** consumidor. A
 * regra de promoção (`.claude/rules/05-reuso.md`) manda esperar o segundo caso
 * real antes de generalizar — componente que nasce em `ui/` para um uso só vira
 * API genérica demais. Se outra tela precisar de upload, sobe daqui.
 *
 * O `<input type="file">` continua existindo e focável (`sr-only`, nunca
 * `display:none`): é ele que dá teclado e leitor de tela de graça. O visual é
 * uma `<label htmlFor>` ao lado — associada, não aninhada, para o botão de
 * remover não disparar o seletor de arquivo junto.
 */

const EXTENSOES_ACEITAS = ['.xlsx', '.xlsm'] as const;

function temExtensaoAceita(nome: string): boolean {
  const minusculo = nome.toLowerCase();
  return EXTENSOES_ACEITAS.some((extensao) => minusculo.endsWith(extensao));
}

/** Tamanho legível em pt-BR: `28,6 KB`. */
function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1).replace('.', ',')} KB`;
  return `${(kb / 1024).toFixed(1).replace('.', ',')} MB`;
}

export function SpreadsheetDropzone({
  id,
  file,
  onFileChange,
  disabled = false,
}: {
  id: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [recusado, setRecusado] = useState<string | null>(null);

  // `dragenter`/`dragleave` disparam de novo a cada elemento filho que o
  // ponteiro cruza. Sem contar a profundidade, a moldura pisca enquanto o
  // operador atravessa o ícone e o texto lá dentro.
  const profundidade = useRef(0);

  function aceitar(candidato: File | null) {
    if (!candidato) return;
    if (!temExtensaoAceita(candidato.name)) {
      setRecusado(`"${candidato.name}" não é planilha. Aceito: ${EXTENSOES_ACEITAS.join(' ou ')}.`);
      return;
    }
    setRecusado(null);
    onFileChange(candidato);
  }

  function limpar() {
    setRecusado(null);
    onFileChange(null);
    // Zera o input: sem isto, escolher o MESMO arquivo de novo não dispara
    // `change` — o valor não mudou — e a tela fica sem arquivo nenhum.
    if (inputRef.current) inputRef.current.value = '';
  }

  // Tracejado significa "vazio, esperando algo". Depois que o arquivo entra a
  // moldura vira sólida e ganha fundo: deixa de ser convite e passa a ser
  // confirmação do que está ali.
  const molduraPorEstado = recusado
    ? 'border-dashed border-danger'
    : arrastando
      ? 'border-dashed border-brand bg-brand/5'
      : file
        ? 'border-solid border-border bg-surface'
        : 'border-dashed border-border hover:border-border-strong hover:bg-surface-elevated';

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={EXTENSOES_ACEITAS.join(',')}
        disabled={disabled}
        aria-describedby={`${id}-ajuda`}
        onChange={(event) => aceitar(event.target.files?.[0] ?? null)}
        className="sr-only"
      />

      <div
        onDragEnter={(event) => {
          event.preventDefault();
          profundidade.current += 1;
          if (!disabled) setArrastando(true);
        }}
        onDragOver={(event) => {
          // Sem isto o navegador recusa o drop e abre o arquivo numa aba.
          event.preventDefault();
        }}
        onDragLeave={() => {
          profundidade.current -= 1;
          if (profundidade.current <= 0) setArrastando(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          profundidade.current = 0;
          setArrastando(false);
          if (disabled) return;
          // `accept` no input não vale para o que é arrastado — a checagem de
          // extensão aqui é a única que existe nesse caminho.
          aceitar(event.dataTransfer.files?.[0] ?? null);
        }}
        className={`rounded-md border transition-colors focus-within:border-brand-light ${molduraPorEstado} ${
          disabled ? 'opacity-60' : ''
        }`}
      >
        {file ? (
          <div className="flex items-center gap-3 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-muted text-foreground">
              <FileSpreadsheet size={18} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">{file.name}</span>
              <span className="block text-[13px] text-foreground-muted">
                {formatarTamanho(file.size)} · pronto para conferir
              </span>
            </span>
            <label
              htmlFor={id}
              className="cursor-pointer rounded-sm px-2.5 py-1 text-[13px] font-semibold text-foreground-muted hover:text-foreground"
            >
              Trocar
            </label>
            <button
              type="button"
              onClick={limpar}
              disabled={disabled}
              aria-label={`Remover ${file.name}`}
              className="flex size-8 items-center justify-center rounded-sm text-foreground-muted hover:bg-muted hover:text-foreground"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <label htmlFor={id} className="flex cursor-pointer flex-col items-center gap-2 px-6 py-9 text-center">
            <span
              className={`flex size-11 items-center justify-center rounded-full transition-colors ${
                arrastando ? 'bg-brand text-background' : 'bg-muted text-foreground-muted'
              }`}
            >
              <Upload size={20} aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold text-foreground">
              {arrastando ? 'Solte a planilha aqui' : 'Arraste a planilha aqui'}
            </span>
            <span className="text-[13px] text-foreground-muted">
              ou <span className="font-semibold text-foreground">clique para escolher</span>
            </span>
          </label>
        )}
      </div>

      <p id={`${id}-ajuda`} className={`text-[13px] ${recusado ? 'text-danger' : 'text-foreground-muted'}`}>
        {recusado ?? `Um arquivo por fornecedor, em ${EXTENSOES_ACEITAS.join(' ou ')}.`}
      </p>
    </div>
  );
}
