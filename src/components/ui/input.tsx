import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

type InputProps = React.ComponentProps<"input"> & {
  /** Ícone decorativo à esquerda. Não recebe foco nem clique. */
  startIcon?: React.ReactNode
  /** Slot à direita para conteúdo interativo (ex.: alternar visibilidade da senha). */
  endSlot?: React.ReactNode
}

function Input({ className, type, startIcon, endSlot, ...props }: InputProps) {
  const field = (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        startIcon && "pl-9",
        endSlot && "pr-10",
        className
      )}
      {...props}
    />
  )

  // Sem adorno: nada de wrapper. Mantém o DOM idêntico para os chamadores atuais.
  if (!startIcon && !endSlot) return field

  return (
    <div className="relative w-full">
      {startIcon && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 flex w-9 items-center justify-center text-muted-foreground [&_svg]:size-4"
        >
          {startIcon}
        </span>
      )}
      {field}
      {endSlot && (
        <span className="absolute inset-y-0 right-0 flex w-10 items-center justify-center">
          {endSlot}
        </span>
      )}
    </div>
  )
}

export { Input }
