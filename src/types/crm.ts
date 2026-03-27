export type AppRole = 'vendedor' | 'gestor' | 'avaliador' | 'secretaria';

export type Interesse = 'comprar' | 'vender' | 'trocar';
export type SituacaoShowroom = 'em_aberto' | 'pendente' | 'sinal' | 'perdido' | 'vendido' | 'dispensada';
export type SituacaoAvaliacao = 'sem_avaliar' | 'em_aberto' | 'adquirida' | 'dispensada' | 'perdido';
export type SituacaoNps = 'em_aberto' | 'enviado' | 'respondido';
export type Negociacao = 'compra' | 'consignacao';
export type PosVendaStatus = 'em_aberto' | 'em_andamento' | 'doc_despachante' | 'concluido';
export type PosCompraStatus = 'em_aberto' | 'em_andamento' | 'doc_despachante' | 'pausado' | 'concluido';
export type ConsignacaoStatus = 'em_aberto' | 'contrato_assinado' | 'cadastro_nbs' | 'pausado' | 'concluido';
export type PreparacaoStatus = 'em_aberto' | 'pendente' | 'aguardando_aceite' | 'oficina' | 'servico_externo' | 'aguardando_liberacao_estoque' | 'estoque';
export type IntermediacaoParte1Status = 'em_aberto' | 'em_andamento' | 'autorizacao_pagamento' | 'concluido';
export type IntermediacaoParte2Status = 'em_aberto' | 'em_andamento' | 'doc_despachante' | 'concluido';

export const POS_VENDA_COLUMNS: { value: PosVendaStatus; label: string; hex: string }[] = [
  { value: 'em_aberto', label: 'Em Aberto', hex: '#2EC5FF' },
  { value: 'em_andamento', label: 'Em Andamento', hex: '#F2C94C' },
  { value: 'doc_despachante', label: 'Doc. com Despachante', hex: '#7e6597' },
];

export const INTERMEDIACAO_PARTE1_COLUMNS: { value: IntermediacaoParte1Status; label: string; hex: string }[] = [
  { value: 'em_aberto', label: 'Em Aberto', hex: '#2EC5FF' },
  { value: 'em_andamento', label: 'Em Andamento', hex: '#F2C94C' },
  { value: 'autorizacao_pagamento', label: 'Autorização de Pagamento', hex: '#7e6597' },
];

export const INTERMEDIACAO_PARTE2_COLUMNS: { value: IntermediacaoParte2Status; label: string; hex: string }[] = [
  { value: 'em_aberto', label: 'Em Aberto', hex: '#2EC5FF' },
  { value: 'em_andamento', label: 'Em Andamento', hex: '#F2C94C' },
  { value: 'doc_despachante', label: 'Doc. com Despachante', hex: '#7e6597' },
];

export const INTERMEDIACAO_PARTE1_ETAPAS = [
  'CHECK-LIST',
  'VISTORIA',
  'ENTREGA DA MOTO',
  'CLIENTE CONTACTADO',
  'DATA RECEBIMENTO ATPV',
  'COMUNICADO DE VENDA',
  'AUTORIZAÇÃO DE PAGAMENTO',
  'PREVISÃO DE PAGAMENTO',
];

export const INTERMEDIACAO_PARTE2_ETAPAS = [
  'DOC. FORMALIZADO',
  'DOCUMENTAÇÃO COM DESPACHANTE',
  'DOC. OUTRA UF',
  'PENDENTE (BOLETO)',
  'TRANSFERÊNCIA FINALIZADA',
];

export const POS_COMPRA_COLUMNS: { value: PosCompraStatus; label: string; hex: string }[] = [
  { value: 'em_aberto', label: 'Em Aberto', hex: '#2EC5FF' },
  { value: 'em_andamento', label: 'Em Andamento', hex: '#F2C94C' },
  { value: 'doc_despachante', label: 'Doc. com Despachante', hex: '#7e6597' },
  { value: 'pausado', label: 'Pausado', hex: '#FF8C00' },
];

export const CONSIGNACAO_COLUMNS: { value: ConsignacaoStatus; label: string; hex: string }[] = [
  { value: 'em_aberto', label: 'Em Aberto', hex: '#2EC5FF' },
  { value: 'contrato_assinado', label: 'Contrato Assinado', hex: '#169d53' },
  { value: 'cadastro_nbs', label: 'Cadastro NBS', hex: '#da6220' },
  { value: 'pausado', label: 'Pausado', hex: '#FF8C00' },
];

export const PREPARACAO_COLUMNS: { value: PreparacaoStatus; label: string; hex: string }[] = [
  { value: 'em_aberto', label: 'Em Aberto', hex: '#2EC5FF' },
  { value: 'pendente', label: 'Pendente', hex: '#da6220' },
  { value: 'oficina', label: 'Oficina', hex: '#7e6597' },
  { value: 'servico_externo', label: 'Serviço Externo', hex: '#E91E63' },
  
  { value: 'aguardando_aceite', label: 'Aguardando Aceite', hex: '#FF8C00' },
  { value: 'aguardando_liberacao_estoque', label: 'Aguardando Liberação Estoque', hex: '#607D8B' },
];

export const LOJAS = ['299i', '299s', 'Aventura', 'Ducati'] as const;
export const ORIGENS = ['Brazilian Car','Capital Moto Week','Cliente Repasse','Clientes/Comprador','Clientes/Consignante','Colaborador 299','Ducati','E-commerce','Equipamentos','EuroBike','Facebook','Google','HD (BSB)','Indicação','Instagram','Lava-Moto','Lojistas','Mercado Livre','Olx','Papo de Carona','Parceiros (Outras UF)','Passante na rua','Prospecção Ativa','Prospecção Wpp','Repasse','Sales Force','Site 299','Triumph (GYN)','Vendas','Visita à Loja','Viu na Olx','WebMotors','WhatsApp Pessoal','Wide Chat'] as const;
export const TEMPERATURAS = ['Frio', 'Morno', 'Quente'] as const;
export const INTERESSES: { value: Interesse; label: string }[] = [
  { value: 'comprar', label: 'Comprar' },
  { value: 'vender', label: 'Vender' },
  { value: 'trocar', label: 'Trocar' },
];

export const STATUS_COLORS: Record<SituacaoShowroom, string> = {
  em_aberto: '#2EC5FF',
  pendente: '#da6220',
  sinal: '#7e6597',
  perdido: '#FF3B30',
  vendido: '#169d53',
  dispensada: '#FF8C00',
};

export const SITUACOES_SHOWROOM: { value: SituacaoShowroom; label: string; color: string; hex: string }[] = [
  { value: 'em_aberto', label: 'Em Aberto', color: 'bg-info/15 text-info', hex: '#2EC5FF' },
  { value: 'pendente', label: 'Pendente', color: 'bg-warning/15 text-warning', hex: '#da6220' },
  { value: 'sinal', label: 'Sinal', color: 'bg-sinal/15 text-sinal', hex: '#7e6597' },
  { value: 'dispensada', label: 'Dispensada', color: 'bg-orange-500/15 text-orange-500', hex: '#FF8C00' },
  { value: 'perdido', label: 'Perdido', color: 'bg-destructive/15 text-destructive', hex: '#FF3B30' },
];

export const SITUACOES_NPS: { value: SituacaoNps; label: string; color: string; hex: string }[] = [
  { value: 'em_aberto', label: 'Em Aberto', color: 'bg-info/15 text-info', hex: '#2EC5FF' },
  { value: 'enviado', label: 'Enviado', color: 'bg-sinal/15 text-sinal', hex: '#7e6597' },
  { value: 'respondido', label: 'Respondido', color: 'bg-success/15 text-success', hex: '#169d53' },
];
export const SITUACOES_AVALIACAO: { value: SituacaoAvaliacao; label: string; color: string }[] = [
  { value: 'sem_avaliar', label: 'Sem Avaliar', color: 'bg-muted text-muted-foreground' },
  { value: 'em_aberto', label: 'Em Aberto', color: 'bg-warning/15 text-warning' },
  { value: 'adquirida', label: 'Adquirida', color: 'bg-success/15 text-success' },
  { value: 'dispensada', label: 'Dispensada', color: 'bg-destructive/15 text-destructive' },
  { value: 'perdido', label: 'Perdido', color: 'bg-orange-500/15 text-orange-500' },
];
export const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'] as const;
export const TIPOS_ATENDIMENTO = ['Presencial', 'Online'] as const;
export const SEXOS = ['Masculino', 'Feminino'] as const;

export const MARCAS_MOTO = [
  'Honda', 'Yamaha', 'Suzuki', 'Kawasaki', 'BMW', 'Ducati', 'Harley-Davidson',
  'Triumph', 'KTM', 'Royal Enfield', 'Benelli', 'MV Agusta', 'Aprilia', 'Moto Guzzi',
  'Husqvarna', 'Indian', 'Dafra', 'Shineray', 'Haojue', 'Outra',
] as const;

export const CATEGORIAS_MOTO = [
  'BIG TRAIL','CAFÉ RACER','CROSSOVER','CUSTOM','ESPORTIVA','NAKED','OFF-ROAD','SCOOTER','SPORT - TOURING','STREET','TOURING','TRAIL',
] as const;

export const CORES_MOTO = [
  'AMARELA','AZUL','BEGE','BORDO','BRANCA','BRONZE','CAFÉ','CINZA','COHIBA','DOURADA','FANTASIA','GRAFITE','GRENÁ','LARANJA','MARFIM','MARROM','OYSTER','PRATA','PRETA','ROSA','ROXA','SILVERSTONE','TERRACOTA','VARIAS','VERDE','VERMELHA','VINHO',
] as const;

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

// Generate year options from current year+1 down to 1990
const currentYear = new Date().getFullYear();
export const ANOS_MOTO = Array.from({ length: currentYear + 2 - 1990 }, (_, i) => String(currentYear + 1 - i));

// Generate model options per brand (simplified - common models)
export const MODELOS_POR_MARCA: Record<string, string[]> = {
  Honda: ['CG 160', 'CB 300', 'CB 500F', 'CB 500X', 'CB 650R', 'CB 1000R', 'CBR 650R', 'CBR 1000RR', 'XRE 190', 'XRE 300', 'Africa Twin', 'ADV 150', 'PCX 160', 'Elite 125', 'Biz 125', 'Pop 110i', 'NXR 160 Bros', 'Outro'],
  Yamaha: ['Factor 125', 'Factor 150', 'Fazer 250', 'MT-03', 'MT-07', 'MT-09', 'R3', 'R1', 'XTZ 150', 'XTZ 250', 'Ténéré 700', 'NMAX 160', 'Crosser 150', 'Fluo 125', 'Outro'],
  Suzuki: ['GSX-S750', 'GSX-S1000', 'V-Strom 650', 'V-Strom 1050', 'Hayabusa', 'Burgman 400', 'Intruder 125', 'Outro'],
  Kawasaki: ['Z400', 'Z650', 'Z900', 'Z1000', 'Ninja 400', 'Ninja 650', 'Ninja ZX-6R', 'Ninja ZX-10R', 'Versys 650', 'Versys 1000', 'Vulcan S', 'Outro'],
  BMW: ['G 310 R', 'G 310 GS', 'F 750 GS', 'F 850 GS', 'F 900 R', 'F 900 XR', 'R 1250 GS', 'R 1250 RT', 'S 1000 R', 'S 1000 RR', 'S 1000 XR', 'R nineT', 'Outro'],
  Ducati: ['Monster', 'Multistrada V4', 'Panigale V2', 'Panigale V4', 'Scrambler', 'Streetfighter V4', 'Diavel', 'Hypermotard', 'DesertX', 'Outro'],
  'Harley-Davidson': ['Iron 883', 'Forty-Eight', 'Street Bob', 'Fat Boy', 'Road King', 'Street Glide', 'Road Glide', 'Sportster S', 'Pan America', 'Nightster', 'Outro'],
  Triumph: ['Street Triple', 'Speed Triple', 'Tiger 900', 'Tiger 1200', 'Bonneville T120', 'Scrambler 900', 'Trident 660', 'Rocket 3', 'Outro'],
  KTM: ['Duke 200', 'Duke 390', 'Duke 890', 'Duke 1290', 'Adventure 390', 'Adventure 890', 'Adventure 1290', 'RC 390', 'Outro'],
  'Royal Enfield': ['Classic 350', 'Meteor 350', 'Hunter 350', 'Himalayan', 'Continental GT 650', 'Interceptor 650', 'Super Meteor 650', 'Outro'],
  Benelli: ['TNT 150', 'Leoncino 250', 'Leoncino 500', 'TNT 600', 'TRK 502', 'Outro'],
  'MV Agusta': ['Brutale', 'Dragster', 'F3', 'Superveloce', 'Outro'],
  Aprilia: ['Tuono 660', 'RS 660', 'Tuareg 660', 'RSV4', 'Outro'],
  'Moto Guzzi': ['V7', 'V85 TT', 'V100 Mandello', 'Outro'],
  Husqvarna: ['Svartpilen 401', 'Vitpilen 401', 'Norden 901', 'Outro'],
  Indian: ['Scout', 'Chief', 'Chieftain', 'Challenger', 'Pursuit', 'Outro'],
  Dafra: ['Apache 200', 'NH 190', 'Horizon 250', 'Outro'],
  Shineray: ['Jet 50', 'Phoenix 50', 'Worker 150', 'Outro'],
  Haojue: ['NK 150', 'DR 160', 'DK 150', 'Outro'],
  Outra: ['Outro'],
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
  cnh_url?: string | null;
  valor_sinal?: number | null;
  valor_venda?: number | null;
}

export interface MotoInteresse {
  id: string;
  atendimento_id: string;
  origem: 'estoque' | 'externo';
  marca: string | null;
  modelo: string | null;
  ano: string | null;
  chassi: string | null;
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
  crlv_url?: string | null;
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
  atendimento?: Atendimento;
  moto_avaliacao?: MotoAvaliacao;
  moto_fotos?: MotoFoto[];
}
