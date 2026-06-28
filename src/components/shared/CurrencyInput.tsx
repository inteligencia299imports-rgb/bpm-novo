import React, { useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";

interface CurrencyInputProps {
  value: number; // valor em centavos (ex: 15000 = R$ 150,00)
  onChange: (valueInCents: number) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
}

const MAX_CENTS = 999999999; // limite seguro para evitar overflow

function formatCurrency(value: number): string {
  if (!value && value !== 0) return "";
  const reais = Math.floor(value / 100);
  const centavos = value % 100;
  const centavosStr = centavos.toString().padStart(2, "0");
  const reaisStr = reais.toLocaleString("pt-BR");
  return `${reaisStr},${centavosStr}`;
}

function parseCurrency(input: string): number {
  const digits = input.replace(/\D/g, "");
  if (!digits) return 0;
  return Math.min(parseInt(digits, 10), MAX_CENTS);
}

export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value,
  onChange,
  placeholder = "0,00",
  className = "",
  disabled = false,
  id,
  name,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const numericCents = parseCurrency(raw);
      onChange(numericCents);
    },
    [onChange]
  );

  const displayValue = value ? formatCurrency(value) : "";

  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none select-none font-medium">
        R$
      </span>
      <Input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className="pl-10 text-right"
        autoComplete="off"
      />
    </div>
  );
};
