import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

const PERSON_NAME_CONNECTORS = new Set(["da", "de", "do", "das", "dos", "e"]);

const capitalizeNameToken = (token: string) =>
  token
    .split("-")
    .map((part) =>
      part
        .split("'")
        .map((segment) => segment ? segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase() : "")
        .join("'"),
    )
    .join("-");

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPersonName(name: string | null | undefined): string {
  if (!name) return "";

  return name
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((token, index) => {
      const normalizedToken = token.toLowerCase();
      if (index > 0 && PERSON_NAME_CONNECTORS.has(normalizedToken)) return normalizedToken;
      return capitalizeNameToken(normalizedToken);
    })
    .join(" ");
}

export function formatPersonNameInput(name: string | null | undefined): string {
  if (!name) return "";

  const hasTrailingSpace = /\s$/.test(name);
  const formatted = formatPersonName(name);

  return formatted ? `${formatted}${hasTrailingSpace ? " " : ""}` : "";
}

/** Remove hyphens from license plate and uppercase */
export function formatPlaca(placa: string | null | undefined): string | null {
  if (!placa) return null;
  return placa.replace(/-/g, '').toUpperCase();
}

/** Abbreviate name: "João Silva" → "João S." */
export function abbreviateName(name: string): string {
  if (!name) return '';
  const parts = formatPersonName(name).split(/\s+/);
  if (parts.length <= 1) return formatPersonName(name);
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/** Uppercase model name */
export function formatModelo(modelo: string | null | undefined): string {
  if (!modelo) return '';
  return modelo.toUpperCase();
}

/** Format integer with thousands separator */
export function fmtInt(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('pt-BR');
}
