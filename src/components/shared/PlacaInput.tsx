import React from 'react';
import { Input } from '@/components/ui/input';
import { normalizePlaca } from '@/lib/veiculoValidators';

interface Props {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  disabled?: boolean;
}

/**
 * Campo de placa (sem <Label>, para encaixar no grid dos formularios e pop-ups
 * de moto). Aceita ate 7 caracteres alfanumericos, em caixa alta. Sem validacao
 * de formato -- placas do padrao antigo (LLLNNNN) e Mercosul convivem.
 */
const PlacaInput: React.FC<Props> = ({ value, onChange, className, disabled }) => (
  <Input
    value={value}
    onChange={(e) => onChange(normalizePlaca(e.target.value))}
    placeholder="ABC1D23"
    maxLength={7}
    autoCapitalize="characters"
    disabled={disabled}
    className={className || undefined}
  />
);

export default PlacaInput;
