import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";
import { PopoverCloseContext } from "@/components/ui/popover-close-context";

/**
 * Root do Radix + estado de aberto próprio quando ninguém controla (`open`
 * ausente), pra que filhos (ex.: Calendar) consigam fechar o popover via
 * PopoverCloseContext — inclusive nos popovers não controlados.
 */
const Popover = ({ open: openProp, defaultOpen, onOpenChange, ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) => {
  const [openInterno, setOpenInterno] = React.useState(defaultOpen ?? false);
  const controlado = openProp !== undefined;
  const open = controlado ? openProp : openInterno;
  const setOpen = React.useCallback(
    (v: boolean) => {
      if (!controlado) setOpenInterno(v);
      onOpenChange?.(v);
    },
    [controlado, onOpenChange],
  );
  const fechar = React.useCallback(() => setOpen(false), [setOpen]);
  return (
    <PopoverCloseContext.Provider value={fechar}>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen} {...props} />
    </PopoverCloseContext.Provider>
  );
};

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent };
