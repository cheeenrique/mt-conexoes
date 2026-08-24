"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

/**
 * Provedor único do delay em grupo: uma vez aberto um tooltip, os vizinhos
 * abrem na hora enquanto o mouse se move entre eles (mecanismo de
 * `FloatingDelayGroup` do base-ui). Monta **uma vez** perto da raiz —
 * `AppShell` — nunca por tooltip individual, ou o agrupamento não funciona.
 */
function TooltipProvider({
  delay = 300,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} {...props} />
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 8,
  side = "top",
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, "sideOffset" | "side" | "align">) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        data-slot="tooltip-positioner"
        className="z-50"
        sideOffset={sideOffset}
        side={side}
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "max-w-64 rounded-md bg-popover px-2.5 py-1.5 text-xs text-popover-foreground ring-1 ring-foreground/10 shadow-md duration-100 data-instant:duration-0 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow
            data-slot="tooltip-arrow"
            className="h-2.5 w-2.5 rotate-45 bg-popover data-[side=bottom]:-top-[5px] data-[side=left]:-right-[5px] data-[side=right]:-left-[5px] data-[side=top]:-bottom-[5px]"
          />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
