import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  normalizeChassi,
  normalizeRenavam,
  validateChassi,
  validateRenavam,
} from '@/lib/veiculoValidators';

interface Props {
  chassi: string;
  renavam: string;
  onChassiChange: (v: string) => void;
  onRenavamChange: (v: string) => void;
  className?: string;
}

/**
 * Par de campos Chassi + RENAVAM usado nos pop-ups "Editar Dados da Moto".
 * Normaliza o valor a cada digitacao (o estado do pai ja fica limpo) e so
 * sinaliza erro quando o campo tem tamanho suficiente para ser julgado --
 * enquanto o usuario digita, mostra apenas o contador de caracteres.
 */
const ChassiRenavamFields: React.FC<Props> = ({
  chassi,
  renavam,
  onChassiChange,
  onRenavamChange,
  className,
}) => {
  const chassiNorm = normalizeChassi(chassi);
  const renavamNorm = normalizeRenavam(renavam);

  const chassiCompleto = chassiNorm.length === 17;
  const renavamCompleto = renavamNorm.length >= 9;

  const chassiCheck = validateChassi(chassiNorm);
  const renavamCheck = validateRenavam(renavamNorm);

  const chassiErro = chassiCompleto && !chassiCheck.valid;
  const renavamErro = renavamCompleto && !renavamCheck.valid;

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${className ?? ''}`}>
      <div>
        <Label>Chassi</Label>
        <Input
          value={chassi}
          onChange={(e) => onChassiChange(normalizeChassi(e.target.value))}
          placeholder="17 caracteres"
          maxLength={17}
          autoCapitalize="characters"
          className={chassiErro ? 'border-destructive focus-visible:ring-destructive' : undefined}
        />
        <p className={`text-[11px] mt-1 ${chassiErro ? 'text-destructive' : 'text-muted-foreground'}`}>
          {chassiErro ? chassiCheck.message : `${chassiNorm.length}/17`}
        </p>
      </div>
      <div>
        <Label>RENAVAM</Label>
        <Input
          value={renavam}
          onChange={(e) => onRenavamChange(normalizeRenavam(e.target.value))}
          placeholder="11 dígitos"
          maxLength={11}
          inputMode="numeric"
          className={renavamErro ? 'border-destructive focus-visible:ring-destructive' : undefined}
        />
        <p className={`text-[11px] mt-1 ${renavamErro ? 'text-destructive' : 'text-muted-foreground'}`}>
          {renavamErro ? renavamCheck.message : `${renavamNorm.length}/11`}
        </p>
      </div>
    </div>
  );
};

export default ChassiRenavamFields;
