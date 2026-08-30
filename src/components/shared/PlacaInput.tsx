import React from 'react';
import { Input } from '@/components/ui/input';
import { normalizePlaca, validatePlaca } from '@/lib/veiculoValidators';

export const PLACA_INVALIDA_MSG =
  'Placa inválida, não será possível adquirir moto quando necessário.';

interface Props {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

/**
 * Campo de placa (sem <Label>, para encaixar no grid existente dos formularios
 * e pop-ups de moto). Normaliza ao digitar e destaca em vermelho quando a placa
 * esta completa (7 caracteres) e nao bate com nenhum formato valido -- mas nunca
 * bloqueia o salvamento; e apenas um aviso visual.
 */
const PlacaInput: React.FC<Props> = ({ value, onChange, className }) => {
  const norm = normalizePlaca(value);
  const invalida = norm.length === 7 && !validatePlaca(norm).valid;

  return (
    <>
      <Input
        value={value}
        onChange={(e) => onChange(normalizePlaca(e.target.value))}
        placeholder="ABC1D23"
        maxLength={7}
        autoCapitalize="characters"
        aria-invalid={invalida || undefined}
        className={`${invalida ? 'border-destructive focus-visible:ring-destructive' : ''} ${className ?? ''}`.trim() || undefined}
      />
      {invalida && (
        <p className="text-[11px] mt-1 text-destructive">{PLACA_INVALIDA_MSG}</p>
      )}
    </>
  );
};

export default PlacaInput;
