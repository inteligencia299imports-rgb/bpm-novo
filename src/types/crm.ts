export type AppRole = 'vendedor' | 'gestor' | 'avaliador';

export type Interesse = 'comprar' | 'vender' | 'trocar';
export type SituacaoShowroom = 'em_aberto' | 'pendente' | 'sinal' | 'perdido' | 'vendido';
export type SituacaoAvaliacao = 'sem_avaliar' | 'em_aberto' | 'adquirida';
export type Negociacao = 'compra' | 'consignacao';

export const LOJAS = ['299i', '299s', 'Aventura', 'Ducati'] as const;
export const INTERESSES: { value: Interesse; label: string }[] = [
  { value: 'comprar', label: 'Comprar' },
  { value: 'vender', label: 'Vender' },
  { value: 'trocar', label: 'Trocar' },
];
export const SITUACOES_SHOWROOM: { value: SituacaoShowroom; label: string; color: string }[] = [
  { value: 'em_aberto', label: 'Em Aberto', color: 'bg-info/15 text-info' },
  { value: 'pendente', label: 'Pendente', color: 'bg-warning/15 text-warning' },
  { value: 'sinal', label: 'Sinal', color: 'bg-primary/15 text-primary' },
  { value: 'perdido', label: 'Perdido', color: 'bg-destructive/15 text-destructive' },
  { value: 'vendido', label: 'Vendido', color: 'bg-success/15 text-success' },
];
export const SITUACOES_AVALIACAO: { value: SituacaoAvaliacao; label: string; color: string }[] = [
  { value: 'sem_avaliar', label: 'Sem Avaliar', color: 'bg-muted text-muted-foreground' },
  { value: 'em_aberto', label: 'Em Aberto', color: 'bg-warning/15 text-warning' },
  { value: 'adquirida', label: 'Adquirida', color: 'bg-success/15 text-success' },
];
export const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'] as const;
export const TIPOS_ATENDIMENTO = ['Presencial', 'Online'] as const;
export const SEXOS = ['Masculino', 'Feminino', 'Outro'] as const;

export const TIPOS_FOTO = [
  'lateral_direita', 'frente', 'pneu_frontal', 'lateral_esquerda',
  'traseira', 'pneu_traseiro', 'painel', 'detalhe_1', 'detalhe_2', 'detalhe_3'
] as const;

export const TIPOS_FOTO_LABELS: Record<string, string> = {
  lateral_direita: 'Lateral Direita',
  frente: 'Frente',
  pneu_frontal: 'Pneu Frontal',
  lateral_esquerda: 'Lateral Esquerda',
  traseira: 'Traseira',
  pneu_traseiro: 'Pneu Traseiro',
  painel: 'Painel',
  detalhe_1: 'Detalhe 1',
  detalhe_2: 'Detalhe 2',
  detalhe_3: 'Detalhe 3',
};

export interface Atendimento {
  id: string;
  vendedor_id: string;
  loja: string;
  nome_cliente: string;
  telefone: string;
  sexo: string;
  uf: string;
  tipo_atendimento: string;
  origem: string | null;
  temperatura: string | null;
  observacoes: string | null;
  interesse: Interesse;
  situacao: SituacaoShowroom;
  created_at: string;
  updated_at: string;
  vendedor_nome?: string;
  moto_interesse?: MotoInteresse;
  moto_avaliacao?: MotoAvaliacao;
  avaliacao?: Avaliacao;
}

export interface MotoInteresse {
  id: string;
  atendimento_id: string;
  origem: 'estoque' | 'externo';
  marca: string | null;
  modelo: string | null;
  ano: string | null;
  estoque_moto_id: string | null;
}

export interface MotoAvaliacao {
  id: string;
  atendimento_id: string;
  marca: string;
  modelo: string;
  ano_fabricacao: string | null;
  ano_modelo: string | null;
  categoria: string | null;
  cor: string | null;
  placa: string | null;
  km: string | null;
  observacoes: string | null;
  enviada_avaliacao: boolean;
}

export interface MotoFoto {
  id: string;
  moto_avaliacao_id: string;
  tipo: string;
  url: string;
}

export interface Avaliacao {
  id: string;
  atendimento_id: string;
  moto_avaliacao_id: string;
  valor_fipe: number | null;
  menor_valor: number | null;
  maior_valor: number | null;
  quanto_pede: number | null;
  quanto_vende: number | null;
  quanto_vende_errado: number | null;
  avaliacao_consignacao: number | null;
  avaliacao_compra: number | null;
  previsao_custos_loja: number | null;
  previsao_custos_cliente: number | null;
  negociacao: Negociacao | null;
  observacao_avaliador: string | null;
  situacao: SituacaoAvaliacao;
  avaliador_id: string | null;
  created_at: string;
  updated_at: string;
  // joined
  atendimento?: Atendimento;
  moto_avaliacao?: MotoAvaliacao;
  moto_fotos?: MotoFoto[];
}
