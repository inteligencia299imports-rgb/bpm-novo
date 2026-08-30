import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, onClick, children, ...props }, ref) => {
    // Enquanto o onClick assíncrono (que retorna Promise) não termina, o botão
    // fica desabilitado e mostra um spinner. Isso evita o duplo clique
    // disparar a mesma ação duas vezes enquanto o sistema ainda processa.
    const [pending, setPending] = React.useState(false);
    const mounted = React.useRef(true);
    // Guarda síncrona: um segundo clique disparado antes do re-render (o caso
    // clássico de duplo clique) enxerga o ref já marcado e é ignorado.
    const runningRef = React.useRef(false);
    React.useEffect(() => () => { mounted.current = false; }, []);

    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        if (runningRef.current) return;
        const result = onClick?.(e) as unknown;
        if (result && typeof (result as { then?: unknown }).then === "function") {
          runningRef.current = true;
          setPending(true);
          Promise.resolve(result).finally(() => {
            runningRef.current = false;
            if (mounted.current) setPending(false);
          });
        }
      },
      [onClick],
    );

    if (asChild) {
      // Slot só aceita um único filho — não dá para injetar o spinner com
      // segurança. Mantém o comportamento original.
      return (
        <Slot
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          onClick={onClick}
          {...props}
        >
          {children}
        </Slot>
      );
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }), pending && "relative")}
        ref={ref}
        aria-busy={pending || undefined}
        {...props}
        onClick={handleClick}
        disabled={props.disabled || pending}
      >
        {pending && (
          <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <Loader2 className="h-4 w-4 animate-spin" />
          </span>
        )}
        <span className={cn("inline-flex items-center gap-2", pending && "invisible")}>
          {children}
        </span>
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
