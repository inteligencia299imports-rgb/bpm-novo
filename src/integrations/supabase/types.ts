export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      atendimentos: {
        Row: {
          cnh_url: string | null
          created_at: string
          id: string
          interesse: string
          intermediacao_parte1_status: string
          intermediacao_parte2_status: string
          loja: string
          nome_cliente: string
          nps_enviado_at: string | null
          nps_respondido_at: string | null
          nps_status: string
          observacoes: string | null
          origem: string | null
          pos_venda_observacoes: string | null
          pos_venda_status: string
          sexo: string
          situacao: string
          telefone: string
          temperatura: string | null
          tipo_atendimento: string
          uf: string
          updated_at: string
          valor_sinal: number | null
          valor_venda: number | null
          vendedor_id: string
        }
        Insert: {
          cnh_url?: string | null
          created_at?: string
          id?: string
          interesse: string
          intermediacao_parte1_status?: string
          intermediacao_parte2_status?: string
          loja: string
          nome_cliente: string
          nps_enviado_at?: string | null
          nps_respondido_at?: string | null
          nps_status?: string
          observacoes?: string | null
          origem?: string | null
          pos_venda_observacoes?: string | null
          pos_venda_status?: string
          sexo: string
          situacao?: string
          telefone: string
          temperatura?: string | null
          tipo_atendimento: string
          uf: string
          updated_at?: string
          valor_sinal?: number | null
          valor_venda?: number | null
          vendedor_id: string
        }
        Update: {
          cnh_url?: string | null
          created_at?: string
          id?: string
          interesse?: string
          intermediacao_parte1_status?: string
          intermediacao_parte2_status?: string
          loja?: string
          nome_cliente?: string
          nps_enviado_at?: string | null
          nps_respondido_at?: string | null
          nps_status?: string
          observacoes?: string | null
          origem?: string | null
          pos_venda_observacoes?: string | null
          pos_venda_status?: string
          sexo?: string
          situacao?: string
          telefone?: string
          temperatura?: string | null
          tipo_atendimento?: string
          uf?: string
          updated_at?: string
          valor_sinal?: number | null
          valor_venda?: number | null
          vendedor_id?: string
        }
        Relationships: []
      }
      avaliacoes: {
        Row: {
          atendimento_id: string
          avaliacao_compra: number | null
          avaliacao_consignacao: number | null
          avaliador_id: string | null
          classificacao: string | null
          consignacao_observacoes: string | null
          consignacao_status: string
          created_at: string
          id: string
          maior_valor: number | null
          menor_valor: number | null
          moto_avaliacao_id: string
          negociacao: string | null
          nps_enviado_at: string | null
          nps_respondido_at: string | null
          nps_status: string
          observacao_avaliador: string | null
          pos_compra_observacoes: string | null
          pos_compra_status: string
          preparacao_status: string
          previsao_custos_cliente: number | null
          previsao_custos_loja: number | null
          quanto_pede: number | null
          quanto_vende: number | null
          quanto_vende_errado: number | null
          situacao: string
          tipo_aquisicao: string | null
          updated_at: string
          valor_fechamento: number | null
          valor_fipe: number | null
        }
        Insert: {
          atendimento_id: string
          avaliacao_compra?: number | null
          avaliacao_consignacao?: number | null
          avaliador_id?: string | null
          classificacao?: string | null
          consignacao_observacoes?: string | null
          consignacao_status?: string
          created_at?: string
          id?: string
          maior_valor?: number | null
          menor_valor?: number | null
          moto_avaliacao_id: string
          negociacao?: string | null
          nps_enviado_at?: string | null
          nps_respondido_at?: string | null
          nps_status?: string
          observacao_avaliador?: string | null
          pos_compra_observacoes?: string | null
          pos_compra_status?: string
          preparacao_status?: string
          previsao_custos_cliente?: number | null
          previsao_custos_loja?: number | null
          quanto_pede?: number | null
          quanto_vende?: number | null
          quanto_vende_errado?: number | null
          situacao?: string
          tipo_aquisicao?: string | null
          updated_at?: string
          valor_fechamento?: number | null
          valor_fipe?: number | null
        }
        Update: {
          atendimento_id?: string
          avaliacao_compra?: number | null
          avaliacao_consignacao?: number | null
          avaliador_id?: string | null
          classificacao?: string | null
          consignacao_observacoes?: string | null
          consignacao_status?: string
          created_at?: string
          id?: string
          maior_valor?: number | null
          menor_valor?: number | null
          moto_avaliacao_id?: string
          negociacao?: string | null
          nps_enviado_at?: string | null
          nps_respondido_at?: string | null
          nps_status?: string
          observacao_avaliador?: string | null
          pos_compra_observacoes?: string | null
          pos_compra_status?: string
          preparacao_status?: string
          previsao_custos_cliente?: number | null
          previsao_custos_loja?: number | null
          quanto_pede?: number | null
          quanto_vende?: number | null
          quanto_vende_errado?: number | null
          situacao?: string
          tipo_aquisicao?: string | null
          updated_at?: string
          valor_fechamento?: number | null
          valor_fipe?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "avaliacoes_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avaliacoes_moto_avaliacao_id_fkey"
            columns: ["moto_avaliacao_id"]
            isOneToOne: false
            referencedRelation: "motos_avaliacao"
            referencedColumns: ["id"]
          },
        ]
      }
      consignacao_processos: {
        Row: {
          avaliacao_id: string
          concluida: boolean
          created_at: string
          data_conclusao: string | null
          etapa: string
          id: string
          updated_at: string
        }
        Insert: {
          avaliacao_id: string
          concluida?: boolean
          created_at?: string
          data_conclusao?: string | null
          etapa: string
          id?: string
          updated_at?: string
        }
        Update: {
          avaliacao_id?: string
          concluida?: boolean
          created_at?: string
          data_conclusao?: string | null
          etapa?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consignacao_processos_avaliacao_id_fkey"
            columns: ["avaliacao_id"]
            isOneToOne: false
            referencedRelation: "avaliacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos: {
        Row: {
          atendimento_id: string
          cpf_cnpj: string | null
          created_at: string
          data_sinal: string | null
          data_vencimento_sinal: string | null
          id: string
          ipva_cotas: string | null
          ipva_tipo: string | null
          ipva_valor: number | null
          observacoes_contrato: string | null
          observacoes_internas: string | null
          transferencia_tipo: string | null
          transferencia_valor: number | null
          updated_at: string
          valor_fechamento: number | null
          valor_quitacao: number | null
        }
        Insert: {
          atendimento_id: string
          cpf_cnpj?: string | null
          created_at?: string
          data_sinal?: string | null
          data_vencimento_sinal?: string | null
          id?: string
          ipva_cotas?: string | null
          ipva_tipo?: string | null
          ipva_valor?: number | null
          observacoes_contrato?: string | null
          observacoes_internas?: string | null
          transferencia_tipo?: string | null
          transferencia_valor?: number | null
          updated_at?: string
          valor_fechamento?: number | null
          valor_quitacao?: number | null
        }
        Update: {
          atendimento_id?: string
          cpf_cnpj?: string | null
          created_at?: string
          data_sinal?: string | null
          data_vencimento_sinal?: string | null
          id?: string
          ipva_cotas?: string | null
          ipva_tipo?: string | null
          ipva_valor?: number | null
          observacoes_contrato?: string | null
          observacoes_internas?: string | null
          transferencia_tipo?: string | null
          transferencia_valor?: number | null
          updated_at?: string
          valor_fechamento?: number | null
          valor_quitacao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_consignacao: {
        Row: {
          avaliacao_id: string
          cep: string | null
          cpf_cnpj: string | null
          created_at: string
          data_contrato: string | null
          email: string | null
          endereco: string | null
          id: string
          observacoes_contrato: string | null
          observacoes_internas: string | null
          updated_at: string
          valor_fechamento: number | null
          valor_quitacao: number | null
        }
        Insert: {
          avaliacao_id: string
          cep?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          data_contrato?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          observacoes_contrato?: string | null
          observacoes_internas?: string | null
          updated_at?: string
          valor_fechamento?: number | null
          valor_quitacao?: number | null
        }
        Update: {
          avaliacao_id?: string
          cep?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          data_contrato?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          observacoes_contrato?: string | null
          observacoes_internas?: string | null
          updated_at?: string
          valor_fechamento?: number | null
          valor_quitacao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_consignacao_avaliacao_id_fkey"
            columns: ["avaliacao_id"]
            isOneToOne: false
            referencedRelation: "avaliacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_consignante: {
        Row: {
          atendimento_id: string
          cpf_cnpj: string | null
          created_at: string
          dados_bancarios: string | null
          data_contrato: string | null
          id: string
          nome_consignante: string | null
          observacoes_contrato: string | null
          observacoes_internas: string | null
          telefone_consignante: string | null
          titular_conta: string | null
          updated_at: string
          valor_fechamento: number | null
          valor_repasse: number | null
        }
        Insert: {
          atendimento_id: string
          cpf_cnpj?: string | null
          created_at?: string
          dados_bancarios?: string | null
          data_contrato?: string | null
          id?: string
          nome_consignante?: string | null
          observacoes_contrato?: string | null
          observacoes_internas?: string | null
          telefone_consignante?: string | null
          titular_conta?: string | null
          updated_at?: string
          valor_fechamento?: number | null
          valor_repasse?: number | null
        }
        Update: {
          atendimento_id?: string
          cpf_cnpj?: string | null
          created_at?: string
          dados_bancarios?: string | null
          data_contrato?: string | null
          id?: string
          nome_consignante?: string | null
          observacoes_contrato?: string | null
          observacoes_internas?: string | null
          telefone_consignante?: string | null
          titular_conta?: string | null
          updated_at?: string
          valor_fechamento?: number | null
          valor_repasse?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_consignante_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      custos_oficina: {
        Row: {
          avaliacao_id: string
          created_at: string
          detalhes: string | null
          id: string
          numero_os: string | null
          responsavel: string
          tipo: string
          updated_at: string
          valor_executado: number | null
          valor_previsto: number | null
        }
        Insert: {
          avaliacao_id: string
          created_at?: string
          detalhes?: string | null
          id?: string
          numero_os?: string | null
          responsavel: string
          tipo: string
          updated_at?: string
          valor_executado?: number | null
          valor_previsto?: number | null
        }
        Update: {
          avaliacao_id?: string
          created_at?: string
          detalhes?: string | null
          id?: string
          numero_os?: string | null
          responsavel?: string
          tipo?: string
          updated_at?: string
          valor_executado?: number | null
          valor_previsto?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "custos_oficina_avaliacao_id_fkey"
            columns: ["avaliacao_id"]
            isOneToOne: false
            referencedRelation: "avaliacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      custos_operacionais: {
        Row: {
          contrato_consignante_id: string
          created_at: string
          descricao: string | null
          id: string
          responsavel: string
          tipo: string
          valor: number | null
        }
        Insert: {
          contrato_consignante_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          responsavel: string
          tipo: string
          valor?: number | null
        }
        Update: {
          contrato_consignante_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          responsavel?: string
          tipo?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "custos_operacionais_contrato_consignante_id_fkey"
            columns: ["contrato_consignante_id"]
            isOneToOne: false
            referencedRelation: "contratos_consignante"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque: {
        Row: {
          ano_fabricacao: string | null
          ano_modelo: string | null
          atendimento_venda_id: string | null
          avaliacao_id: string | null
          categoria: string | null
          cilindrada: string | null
          classificacao: string | null
          cor: string | null
          created_at: string
          data_entrada: string
          data_venda: string | null
          empresa: string | null
          id: string
          km: string | null
          marca: string
          modelo: string
          moto_avaliacao_id: string | null
          observacoes: string | null
          placa: string | null
          preco: number | null
          preco_acao: number | null
          status: string
          tipo: string
          updated_at: string
          valor_sinal: number | null
          valor_venda: number | null
        }
        Insert: {
          ano_fabricacao?: string | null
          ano_modelo?: string | null
          atendimento_venda_id?: string | null
          avaliacao_id?: string | null
          categoria?: string | null
          cilindrada?: string | null
          classificacao?: string | null
          cor?: string | null
          created_at?: string
          data_entrada?: string
          data_venda?: string | null
          empresa?: string | null
          id?: string
          km?: string | null
          marca: string
          modelo: string
          moto_avaliacao_id?: string | null
          observacoes?: string | null
          placa?: string | null
          preco?: number | null
          preco_acao?: number | null
          status?: string
          tipo?: string
          updated_at?: string
          valor_sinal?: number | null
          valor_venda?: number | null
        }
        Update: {
          ano_fabricacao?: string | null
          ano_modelo?: string | null
          atendimento_venda_id?: string | null
          avaliacao_id?: string | null
          categoria?: string | null
          cilindrada?: string | null
          classificacao?: string | null
          cor?: string | null
          created_at?: string
          data_entrada?: string
          data_venda?: string | null
          empresa?: string | null
          id?: string
          km?: string | null
          marca?: string
          modelo?: string
          moto_avaliacao_id?: string | null
          observacoes?: string | null
          placa?: string | null
          preco?: number | null
          preco_acao?: number | null
          status?: string
          tipo?: string
          updated_at?: string
          valor_sinal?: number | null
          valor_venda?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "estoque_atendimento_venda_id_fkey"
            columns: ["atendimento_venda_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_avaliacao_id_fkey"
            columns: ["avaliacao_id"]
            isOneToOne: false
            referencedRelation: "avaliacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_moto_avaliacao_id_fkey"
            columns: ["moto_avaliacao_id"]
            isOneToOne: false
            referencedRelation: "motos_avaliacao"
            referencedColumns: ["id"]
          },
        ]
      }
      formas_pagamento: {
        Row: {
          contrato_id: string
          created_at: string
          financeira: string | null
          id: string
          numero_parcelas: number | null
          tipo: string
          valor_entrada: number | null
          valor_financiado: number | null
          valor_parcelas: number | null
          valor_total: number | null
        }
        Insert: {
          contrato_id: string
          created_at?: string
          financeira?: string | null
          id?: string
          numero_parcelas?: number | null
          tipo: string
          valor_entrada?: number | null
          valor_financiado?: number | null
          valor_parcelas?: number | null
          valor_total?: number | null
        }
        Update: {
          contrato_id?: string
          created_at?: string
          financeira?: string | null
          id?: string
          numero_parcelas?: number | null
          tipo?: string
          valor_entrada?: number | null
          valor_financiado?: number | null
          valor_parcelas?: number | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "formas_pagamento_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      marcas_motos: {
        Row: {
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      modelos_motos: {
        Row: {
          created_at: string
          id: string
          marca_id: string
          nome: string
        }
        Insert: {
          created_at?: string
          id?: string
          marca_id: string
          nome: string
        }
        Update: {
          created_at?: string
          id?: string
          marca_id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "modelos_motos_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "marcas_motos"
            referencedColumns: ["id"]
          },
        ]
      }
      moto_fotos: {
        Row: {
          created_at: string
          id: string
          moto_avaliacao_id: string
          tipo: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          moto_avaliacao_id: string
          tipo: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          moto_avaliacao_id?: string
          tipo?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "moto_fotos_moto_avaliacao_id_fkey"
            columns: ["moto_avaliacao_id"]
            isOneToOne: false
            referencedRelation: "motos_avaliacao"
            referencedColumns: ["id"]
          },
        ]
      }
      motos_avaliacao: {
        Row: {
          ano_fabricacao: string | null
          ano_modelo: string | null
          atendimento_id: string
          categoria: string | null
          cilindrada: string | null
          consulta_realizada: boolean | null
          consulta_solicitada: boolean | null
          cor: string | null
          created_at: string
          crlv_url: string | null
          enviada_avaliacao: boolean | null
          id: string
          km: string | null
          manutencao_em_dia: boolean | null
          marca: string
          modelo: string
          observacoes: string | null
          placa: string | null
          resultado_consulta: string | null
          tem_chave_reserva: boolean | null
          tem_manual: boolean | null
          updated_at: string
        }
        Insert: {
          ano_fabricacao?: string | null
          ano_modelo?: string | null
          atendimento_id: string
          categoria?: string | null
          cilindrada?: string | null
          consulta_realizada?: boolean | null
          consulta_solicitada?: boolean | null
          cor?: string | null
          created_at?: string
          crlv_url?: string | null
          enviada_avaliacao?: boolean | null
          id?: string
          km?: string | null
          manutencao_em_dia?: boolean | null
          marca: string
          modelo: string
          observacoes?: string | null
          placa?: string | null
          resultado_consulta?: string | null
          tem_chave_reserva?: boolean | null
          tem_manual?: boolean | null
          updated_at?: string
        }
        Update: {
          ano_fabricacao?: string | null
          ano_modelo?: string | null
          atendimento_id?: string
          categoria?: string | null
          cilindrada?: string | null
          consulta_realizada?: boolean | null
          consulta_solicitada?: boolean | null
          cor?: string | null
          created_at?: string
          crlv_url?: string | null
          enviada_avaliacao?: boolean | null
          id?: string
          km?: string | null
          manutencao_em_dia?: boolean | null
          marca?: string
          modelo?: string
          observacoes?: string | null
          placa?: string | null
          resultado_consulta?: string | null
          tem_chave_reserva?: boolean | null
          tem_manual?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "motos_avaliacao_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      motos_interesse: {
        Row: {
          ano: string | null
          atendimento_id: string
          chassi: string | null
          created_at: string
          estoque_moto_id: string | null
          id: string
          marca: string | null
          modelo: string | null
          origem: string
        }
        Insert: {
          ano?: string | null
          atendimento_id: string
          chassi?: string | null
          created_at?: string
          estoque_moto_id?: string | null
          id?: string
          marca?: string | null
          modelo?: string | null
          origem: string
        }
        Update: {
          ano?: string | null
          atendimento_id?: string
          chassi?: string | null
          created_at?: string
          estoque_moto_id?: string | null
          id?: string
          marca?: string | null
          modelo?: string | null
          origem?: string
        }
        Relationships: [
          {
            foreignKeyName: "motos_interesse_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          message: string
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message: string
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message?: string
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      pos_compra_processos: {
        Row: {
          avaliacao_id: string
          concluida: boolean
          created_at: string
          data_conclusao: string | null
          etapa: string
          id: string
          updated_at: string
        }
        Insert: {
          avaliacao_id: string
          concluida?: boolean
          created_at?: string
          data_conclusao?: string | null
          etapa: string
          id?: string
          updated_at?: string
        }
        Update: {
          avaliacao_id?: string
          concluida?: boolean
          created_at?: string
          data_conclusao?: string | null
          etapa?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_compra_processos_avaliacao_id_fkey"
            columns: ["avaliacao_id"]
            isOneToOne: false
            referencedRelation: "avaliacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_venda_processos: {
        Row: {
          atendimento_id: string
          concluida: boolean
          created_at: string
          data_conclusao: string | null
          etapa: string
          id: string
          updated_at: string
        }
        Insert: {
          atendimento_id: string
          concluida?: boolean
          created_at?: string
          data_conclusao?: string | null
          etapa: string
          id?: string
          updated_at?: string
        }
        Update: {
          atendimento_id?: string
          concluida?: boolean
          created_at?: string
          data_conclusao?: string | null
          etapa?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_venda_processos_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      status_history: {
        Row: {
          changed_by: string | null
          changed_by_name: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          observacoes: string | null
          status_from: string
          status_to: string
        }
        Insert: {
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          observacoes?: string | null
          status_from: string
          status_to: string
        }
        Update: {
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          observacoes?: string | null
          status_from?: string
          status_to?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          loja: string | null
          nome: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          loja?: string | null
          nome?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          loja?: string | null
          nome?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      atendimento_has_avaliacao: {
        Args: { _atendimento_id: string }
        Returns: boolean
      }
      atendimento_has_avaliacao_preparacao: {
        Args: { _atendimento_id: string }
        Returns: boolean
      }
      delete_atendimento_cascade: {
        Args: { _atendimento_id: string }
        Returns: undefined
      }
      delete_avaliacao_cascade: {
        Args: { _avaliacao_id: string }
        Returns: undefined
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      moto_has_avaliacao_preparacao: {
        Args: { _moto_avaliacao_id: string }
        Returns: boolean
      }
      notify_role: {
        Args: {
          _entity_id?: string
          _entity_type?: string
          _message: string
          _role: Database["public"]["Enums"]["app_role"]
          _title: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "vendedor" | "gestor" | "avaliador" | "secretaria"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["vendedor", "gestor", "avaliador", "secretaria"],
    },
  },
} as const
