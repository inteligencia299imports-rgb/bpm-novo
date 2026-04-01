import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Remove hyphens from license plate and uppercase */
export function formatPlaca(placa: string | null | undefined): string | null {
  if (!placa) return null;
  return placa.replace(/-/g, '').toUpperCase();
}

/** Abbreviate name: "João Silva" → "João S." */
export function abbreviateName(name: string): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/** Uppercase model name */
export function formatModelo(modelo: string | null | undefined): string {
  if (!modelo) return '';
  return modelo.toUpperCase();
}
