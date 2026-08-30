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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      atendimentos_motos: {
        Row: {
          cliente_id: string
          created_at: string
          id: string
          interesse: string
          intermediacao_parte1_status: string
          intermediacao_parte2_status: string
          loja_id: string
          nps_enviado_at: string | null
          nps_respondido_at: string | null
          nps_status: string
          origem: string | null
          pos_venda_status: string
          situacao: string
          temperatura: string | null
          tipo_atendimento: string
          updated_at: string
          vendedor_id: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          id?: string
          interesse: string
          intermediacao_parte1_status?: string
          intermediacao_parte2_status?: string
          loja_id: string
          nps_enviado_at?: string | null
          nps_respondido_at?: string | null
          nps_status?: string
          origem?: string | null
          pos_venda_status?: string
          situacao?: string
          temperatura?: string | null
          tipo_atendimento: string
          updated_at?: string
          vendedor_id: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          id?: string
          interesse?: string
          intermediacao_parte1_status?: string
          intermediacao_parte2_status?: string
          loja_id?: string
          nps_enviado_at?: string | null
          nps_respondido_at?: string | null
          nps_status?: string
          origem?: string | null
          pos_venda_status?: string
          situacao?: string
          temperatura?: string | null
          tipo_atendimento?: string
          updated_at?: string
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atendimentos_motos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_motos_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "loja_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      avaliacoes: {
        Row: {
          ano_fabricacao: string | null
          ano_modelo: string | null
          aprovacao_observacao: string | null
          aprovacao_status: string | null
          aprovado_em: string | null
          aprovado_por: string | null
          atendimento_id: string
          atpv_url: string | null
          avaliacao_compra: number | null
          avaliacao_consignacao: number | null
          avaliador_id: string | null
          categoria: string | null
          chassi: string | null
          cilindrada: string | null
          classificacao: string | null
          consignacao_status: string
          consulta_realizada: boolean | null
          consulta_solicitada: boolean | null
          cor: string | null
          created_at: string
          crlv_url: string | null
          enviada_avaliacao: boolean | null
          id: string
          km: string | null
          maior_valor: number | null
          manutencao_vencida: boolean | null
          marca: string
          menor_valor: number | null
          modelo: string
          negociacao: string | null
          numero_crv: string | null
          nps_enviado_at: string | null
          nps_respondido_at: string | null
          nps_status: string
          observacao_avaliador: string | null
          observacoes: string | null
          placa: string | null
          pos_compra_status: string
          preparacao_status: string
          previsao_custos_cliente: number | null
          previsao_custos_loja: number | null
          procuracao_url: string | null
          quanto_pede: number | null
          quanto_vende: number | null
          quanto_vende_errado: number | null
          renavam: string | null
          resultado_consulta: string | null
          situacao: string
          tem_chave_reserva: boolean | null
          tem_manual: boolean | null
          tipo_aquisicao: string | null
          trade_in: number | null
          uf: string | null
          updated_at: string
          valor_fechamento: number | null
          valor_fipe: number | null
          valor_quitacao: number | null
        }
        Insert: {
          ano_fabricacao?: string | null
          ano_modelo?: string | null
          aprovacao_observacao?: string | null
          aprovacao_status?: string | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          atendimento_id: string
          atpv_url?: string | null
          avaliacao_compra?: number | null
          avaliacao_consignacao?: number | null
          avaliador_id?: string | null
          categoria?: string | null
          chassi?: string | null
          cilindrada?: string | null
          classificacao?: string | null
          consignacao_status?: string
          consulta_realizada?: boolean | null
          consulta_solicitada?: boolean | null
          cor?: string | null
          created_at?: string
          crlv_url?: string | null
          enviada_avaliacao?: boolean | null
          id?: string
          km?: string | null
          maior_valor?: number | null
          manutencao_vencida?: boolean | null
          marca: string
          menor_valor?: number | null
          modelo: string
          negociacao?: string | null
          numero_crv?: string | null
          nps_enviado_at?: string | null
          nps_respondido_at?: string | null
          nps_status?: string
          observacao_avaliador?: string | null
          observacoes?: string | null
          placa?: string | null
          pos_compra_status?: string
          preparacao_status?: string
          previsao_custos_cliente?: number | null
          previsao_custos_loja?: number | null
          procuracao_url?: string | null
          quanto_pede?: number | null
          quanto_vende?: number | null
          quanto_vende_errado?: number | null
          renavam?: string | null
          resultado_consulta?: string | null
          situacao?: string
          tem_chave_reserva?: boolean | null
          tem_manual?: boolean | null
          tipo_aquisicao?: string | null
          trade_in?: number | null
          uf?: string | null
          updated_at?: string
          valor_fechamento?: number | null
          valor_fipe?: number | null
          valor_quitacao?: number | null
        }
        Update: {
          ano_fabricacao?: string | null
          ano_modelo?: string | null
          aprovacao_observacao?: string | null
          aprovacao_status?: string | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          atendimento_id?: string
          atpv_url?: string | null
          avaliacao_compra?: number | null
          avaliacao_consignacao?: number | null
          avaliador_id?: string | null
          categoria?: string | null
          chassi?: string | null
          cilindrada?: string | null
          classificacao?: string | null
          consignacao_status?: string
          consulta_realizada?: boolean | null
          consulta_solicitada?: boolean | null
          cor?: string | null
          created_at?: string
          crlv_url?: string | null
          enviada_avaliacao?: boolean | null
          id?: string
          km?: string | null
          maior_valor?: number | null
          manutencao_vencida?: boolean | null
          marca?: string
          menor_valor?: number | null
          modelo?: string
          negociacao?: string | null
          nps_enviado_at?: string | null
          nps_respondido_at?: string | null
          nps_status?: string
          observacao_avaliador?: string | null
          observacoes?: string | null
          placa?: string | null
          pos_compra_status?: string
          preparacao_status?: string
          previsao_custos_cliente?: number | null
          previsao_custos_loja?: number | null
          procuracao_url?: string | null
          quanto_pede?: number | null
          quanto_vende?: number | null
          quanto_vende_errado?: number | null
          renavam?: string | null
          resultado_consulta?: string | null
          situacao?: string
          tem_chave_reserva?: boolean | null
          tem_manual?: boolean | null
          tipo_aquisicao?: string | null
          trade_in?: number | null
          uf?: string | null
          updated_at?: string
          valor_fechamento?: number | null
          valor_fipe?: number | null
          valor_quitacao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "avaliacoes_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos_motos"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes_fornecedores: {
        Row: {
          aceite_politica_privacidade: boolean
          agencia: string | null
          autoriza_contato: boolean
          banco: string | null
          chave_pix: string | null
          cnae_principal: string | null
          consumidor_final: boolean
          conta: string | null
          contribuinte_icms: boolean
          cpf_cnpj: string | null
          cpf_cnpj_favorecido: string | null
          created_at: string
          created_by: string | null
          data_aceite_politica_privacidade: string | null
          data_nascimento: string | null
          data_validacao_receita: string | null
          deleted_at: string | null
          digito_conta: string | null
          email: string | null
          email_nf: string | null
          favorecido: string | null
          finalidade_cadastro: string | null
          id: string
          inscricao_estadual: string | null
          inscricao_municipal: string | null
          isento_inscricao_estadual: boolean | null
          motivo_bloqueio: string | null
          nome_fantasia: string | null
          nome_razao_social: string
          observacoes_internas: string | null
          origem_cadastro: string | null
          ramo: string | null
          regime_tributario: string | null
          sexo: string | null
          situacao_cadastral: string | null
          status: string | null
          telefone: string | null
          telefone_comercial: string | null
          tipo_cadastro: string
          tipo_conta: string | null
          tipo_pessoa: string
          updated_at: string
          updated_by: string | null
          validado_receita: boolean | null
        }
        Insert: {
          aceite_politica_privacidade?: boolean
          agencia?: string | null
          autoriza_contato?: boolean
          banco?: string | null
          chave_pix?: string | null
          cnae_principal?: string | null
          consumidor_final?: boolean
          conta?: string | null
          contribuinte_icms?: boolean
          cpf_cnpj?: string | null
          cpf_cnpj_favorecido?: string | null
          created_at?: string
          created_by?: string | null
          data_aceite_politica_privacidade?: string | null
          data_nascimento?: string | null
          data_validacao_receita?: string | null
          deleted_at?: string | null
          digito_conta?: string | null
          email?: string | null
          email_nf?: string | null
          favorecido?: string | null
          finalidade_cadastro?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          isento_inscricao_estadual?: boolean | null
          motivo_bloqueio?: string | null
          nome_fantasia?: string | null
          nome_razao_social: string
          observacoes_internas?: string | null
          origem_cadastro?: string | null
          ramo?: string | null
          regime_tributario?: string | null
          sexo?: string | null
          situacao_cadastral?: string | null
          status?: string | null
          telefone?: string | null
          telefone_comercial?: string | null
          tipo_cadastro?: string
          tipo_conta?: string | null
          tipo_pessoa?: string
          updated_at?: string
          updated_by?: string | null
          validado_receita?: boolean | null
        }
        Update: {
          aceite_politica_privacidade?: boolean
          agencia?: string | null
          autoriza_contato?: boolean
          banco?: string | null
          chave_pix?: string | null
          cnae_principal?: string | null
          consumidor_final?: boolean
          conta?: string | null
          contribuinte_icms?: boolean
          cpf_cnpj?: string | null
          cpf_cnpj_favorecido?: string | null
          created_at?: string
          created_by?: string | null
          data_aceite_politica_privacidade?: string | null
          data_nascimento?: string | null
          data_validacao_receita?: string | null
          deleted_at?: string | null
          digito_conta?: string | null
          email?: string | null
          email_nf?: string | null
          favorecido?: string | null
          finalidade_cadastro?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          isento_inscricao_estadual?: boolean | null
          motivo_bloqueio?: string | null
          nome_fantasia?: string | null
          nome_razao_social?: string
          observacoes_internas?: string | null
          origem_cadastro?: string | null
          ramo?: string | null
          regime_tributario?: string | null
          sexo?: string | null
          situacao_cadastral?: string | null
          status?: string | null
          telefone?: string | null
          telefone_comercial?: string | null
          tipo_cadastro?: string
          tipo_conta?: string | null
          tipo_pessoa?: string
          updated_at?: string
          updated_by?: string | null
          validado_receita?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_fornecedores_ramo_fkey"
            columns: ["ramo"]
            isOneToOne: false
            referencedRelation: "ramos_atividade"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes_fornecedores_documentos: {
        Row: {
          arquivo_url: string
          cliente_fornecedor_id: string
          created_at: string
          id: string
          tipo_documento: string
        }
        Insert: {
          arquivo_url: string
          cliente_fornecedor_id: string
          created_at?: string
          id?: string
          tipo_documento: string
        }
        Update: {
          arquivo_url?: string
          cliente_fornecedor_id?: string
          created_at?: string
          id?: string
          tipo_documento?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_fornecedores_documentos_cliente_fornecedor_id_fkey"
            columns: ["cliente_fornecedor_id"]
            isOneToOne: false
            referencedRelation: "clientes_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes_fornecedores_enderecos: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          cliente_fornecedor_id: string
          complemento: string | null
          created_at: string
          id: string
          logradouro: string | null
          numero: string | null
          pais: string
          tipo: string
          uf: string | null
          updated_at: string
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cliente_fornecedor_id: string
          complemento?: string | null
          created_at?: string
          id?: string
          logradouro?: string | null
          numero?: string | null
          pais?: string
          tipo?: string
          uf?: string | null
          updated_at?: string
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cliente_fornecedor_id?: string
          complemento?: string | null
          created_at?: string
          id?: string
          logradouro?: string | null
          numero?: string | null
          pais?: string
          tipo?: string
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_fornecedores_enderecos_cliente_fornecedor_id_fkey"
            columns: ["cliente_fornecedor_id"]
            isOneToOne: false
            referencedRelation: "clientes_fornecedores"
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
      consultas_veiculares: {
        Row: {
          avaliacao_id: string | null
          correlation_id: string | null
          created_at: string
          fontes_consultadas: Json
          id: string
          placa: string
          renavam: string | null
          resultado: Json
          tempo_resposta_ms: number | null
          uf: string | null
          usuario_id: string
        }
        Insert: {
          avaliacao_id?: string | null
          correlation_id?: string | null
          created_at?: string
          fontes_consultadas?: Json
          id?: string
          placa: string
          renavam?: string | null
          resultado: Json
          tempo_resposta_ms?: number | null
          uf?: string | null
          usuario_id: string
        }
        Update: {
          avaliacao_id?: string | null
          correlation_id?: string | null
          created_at?: string
          fontes_consultadas?: Json
          id?: string
          placa?: string
          renavam?: string | null
          resultado?: Json
          tempo_resposta_ms?: number | null
          uf?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultas_veiculares_avaliacao_id_fkey"
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
            referencedRelation: "atendimentos_motos"
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
            referencedRelation: "atendimentos_motos"
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
      empresas: {
        Row: {
          ativo: boolean
          banner_url: string | null
          bpm: boolean
          cnpj: string
          created_at: string
          crm: boolean
          endereco: string | null
          hcm: boolean
          id: string
          inscricao_estadual: string | null
          mini: boolean
          nome: string
          nome_fantasia: string | null
          ofc: boolean
          razao_social: string | null
          regime_tributario: string | null
          saldo_inicial: number
          saldo_inicial_data: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          banner_url?: string | null
          bpm?: boolean
          cnpj?: string
          created_at?: string
          crm?: boolean
          endereco?: string | null
          hcm?: boolean
          id?: string
          inscricao_estadual?: string | null
          mini?: boolean
          nome: string
          nome_fantasia?: string | null
          ofc?: boolean
          razao_social?: string | null
          regime_tributario?: string | null
          saldo_inicial?: number
          saldo_inicial_data?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          banner_url?: string | null
          bpm?: boolean
          cnpj?: string
          created_at?: string
          crm?: boolean
          endereco?: string | null
          hcm?: boolean
          id?: string
          inscricao_estadual?: string | null
          mini?: boolean
          nome?: string
          nome_fantasia?: string | null
          ofc?: boolean
          razao_social?: string | null
          regime_tributario?: string | null
          saldo_inicial?: number
          saldo_inicial_data?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
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
          loja: string | null
          marca: string
          modelo: string
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
          loja?: string | null
          marca: string
          modelo: string
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
          loja?: string | null
          marca?: string
          modelo?: string
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
            referencedRelation: "atendimentos_motos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_avaliacao_id_fkey"
            columns: ["avaliacao_id"]
            isOneToOne: false
            referencedRelation: "avaliacoes"
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
      loja_empresas: {
        Row: {
          ativo: boolean
          created_at: string
          empresa_id: string
          id: string
          loja: string
          sistema: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          empresa_id: string
          id?: string
          loja: string
          sistema: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          empresa_id?: string
          id?: string
          loja?: string
          sistema?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loja_empresas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
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
          avaliacao_id: string
          created_at: string
          id: string
          tipo: string
          url: string
        }
        Insert: {
          avaliacao_id: string
          created_at?: string
          id?: string
          tipo: string
          url: string
        }
        Update: {
          avaliacao_id?: string
          created_at?: string
          id?: string
          tipo?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "moto_fotos_avaliacao_id_fkey"
            columns: ["avaliacao_id"]
            isOneToOne: false
            referencedRelation: "avaliacoes"
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
            referencedRelation: "atendimentos_motos"
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
      observacoes: {
        Row: {
          created_at: string
          id: string
          id_operacao: string
          observacao: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          id_operacao: string
          observacao: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          id_operacao?: string
          observacao?: string
          user_id?: string | null
        }
        Relationships: []
      }
      pos_compra_processos: {
        Row: {
          avaliacao_id: string
          concluida: boolean
          created_at: string
          data_conclusao: string | null
          destino_transferencia: string | null
          etapa: string
          id: string
          updated_at: string
        }
        Insert: {
          avaliacao_id: string
          concluida?: boolean
          created_at?: string
          data_conclusao?: string | null
          destino_transferencia?: string | null
          etapa: string
          id?: string
          updated_at?: string
        }
        Update: {
          avaliacao_id?: string
          concluida?: boolean
          created_at?: string
          data_conclusao?: string | null
          destino_transferencia?: string | null
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
            referencedRelation: "atendimentos_motos"
            referencedColumns: ["id"]
          },
        ]
      }
      projetos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          slug: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          slug: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      ramos_atividade: {
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
      respostas_nps: {
        Row: {
          atendimento: string | null
          atendimento_id: string
          created_at: string
          data_resposta: string
          espaco_livre: string | null
          experiencia: string | null
          id: string
          melhorias: string | null
          nps: string | null
          origem: string | null
          outros_setores: string | null
          produto: string | null
        }
        Insert: {
          atendimento?: string | null
          atendimento_id: string
          created_at?: string
          data_resposta?: string
          espaco_livre?: string | null
          experiencia?: string | null
          id?: string
          melhorias?: string | null
          nps?: string | null
          origem?: string | null
          outros_setores?: string | null
          produto?: string | null
        }
        Update: {
          atendimento?: string | null
          atendimento_id?: string
          created_at?: string
          data_resposta?: string
          espaco_livre?: string | null
          experiencia?: string | null
          id?: string
          melhorias?: string | null
          nps?: string | null
          origem?: string | null
          outros_setores?: string | null
          produto?: string | null
        }
        Relationships: []
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
          status: string
        }
        Insert: {
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          observacoes?: string | null
          status: string
        }
        Update: {
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          observacoes?: string | null
          status?: string
        }
        Relationships: []
      }
      user_empresas: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_empresas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          app_role: Database["public"]["Enums"]["app_role"]
          ativo: boolean
          created_at: string
          email: string | null
          id: string
          limite_desconto_percentual: number
          loja_id: string | null
          nome: string | null
          projeto_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          app_role: Database["public"]["Enums"]["app_role"]
          ativo?: boolean
          created_at?: string
          email?: string | null
          id?: string
          limite_desconto_percentual?: number
          loja_id?: string | null
          nome?: string | null
          projeto_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          app_role?: Database["public"]["Enums"]["app_role"]
          ativo?: boolean
          created_at?: string
          email?: string | null
          id?: string
          limite_desconto_percentual?: number
          loja_id?: string | null
          nome?: string | null
          projeto_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "loja_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
        ]
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
      current_app_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      delete_atendimento_cascade: {
        Args: { _atendimento_id: string }
        Returns: undefined
      }
      delete_avaliacao_cascade: {
        Args: { _avaliacao_id: string }
        Returns: undefined
      }
      has_app_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_master_or_gerente_empresa:
        | { Args: { _loja: string; _user_id: string }; Returns: boolean }
        | { Args: { _loja_id: string; _user_id: string }; Returns: boolean }
      next_report_cycle: {
        Args: { _start: string }
        Returns: {
          cycle_end: string
          cycle_start: string
          next_start: string
        }[]
      }
      norm_loja: { Args: { _loja: string }; Returns: string }
      notify_consulta: {
        Args: {
          _entity_id?: string
          _entity_type?: string
          _message: string
          _title: string
        }
        Returns: undefined
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
      relatorio_avaliacoes_avaliadores: {
        Args: { _date_from?: string; _date_to?: string; _loja?: string }
        Returns: Json
      }
      relatorio_avaliacoes_kpis: {
        Args: { _date_from?: string; _date_to?: string; _loja?: string }
        Returns: Json
      }
      relatorio_avaliacoes_kpis_comparado: {
        Args: {
          _date_from?: string
          _date_to?: string
          _loja?: string
          _prev_from?: string
          _prev_to?: string
        }
        Returns: Json
      }
      relatorio_avaliacoes_mensal: { Args: { _loja?: string }; Returns: Json }
      relatorio_avaliacoes_por_avaliador: {
        Args: { _date_from?: string; _date_to?: string; _loja?: string }
        Returns: Json
      }
      relatorio_estoque_kpis:
        | { Args: never; Returns: Json }
        | { Args: { p_cutoff?: string }; Returns: Json }
        | {
            Args: { p_cutoff?: string; p_loja?: string; p_tipo?: string }
            Returns: Json
          }
      relatorio_estoque_kpis_comparado: {
        Args: {
          p_cutoff: string
          p_loja?: string
          p_prev_cutoff?: string
          p_tipo?: string
        }
        Returns: Json
      }
      relatorio_estoque_mensal:
        | { Args: never; Returns: Json }
        | { Args: { p_cutoff?: string }; Returns: Json }
        | {
            Args: { p_cutoff?: string; p_loja?: string; p_tipo?: string }
            Returns: Json
          }
      relatorio_showroom_kpis: {
        Args: {
          _date_from?: string
          _date_to?: string
          _loja?: string
          _tipo?: string
        }
        Returns: Json
      }
      relatorio_showroom_kpis_comparado: {
        Args: {
          _date_from?: string
          _date_to?: string
          _loja?: string
          _prev_from?: string
          _prev_to?: string
          _tipo?: string
        }
        Returns: Json
      }
      relatorio_showroom_mensal: {
        Args: { _loja?: string; _tipo?: string }
        Returns: Json
      }
      relatorio_showroom_sinais: {
        Args: {
          _date_from?: string
          _date_to?: string
          _loja?: string
          _tipo?: string
        }
        Returns: Json
      }
      relatorio_showroom_vendedores: {
        Args: {
          _date_from?: string
          _date_to?: string
          _loja?: string
          _tipo?: string
        }
        Returns: Json
      }
      relatorio_showroom_vendidas: {
        Args: {
          _date_from?: string
          _date_to?: string
          _loja?: string
          _tipo?: string
        }
        Returns: Json
      }
      relatorio_vendedor_equipe: {
        Args: { _date_from?: string; _date_to?: string; _loja?: string }
        Returns: Json
      }
      relatorio_vendedor_kpis: {
        Args: {
          _date_from?: string
          _date_to?: string
          _loja?: string
          _user_id: string
        }
        Returns: Json
      }
      relatorio_vendedor_kpis_comparado: {
        Args: {
          _date_from?: string
          _date_to?: string
          _loja?: string
          _prev_from?: string
          _prev_to?: string
          _user_id: string
        }
        Returns: Json
      }
      relatorio_vendedor_mensal: {
        Args: { _loja?: string; _user_id: string }
        Returns: Json
      }
      user_has_empresa:
        | { Args: { _loja: string; _user_id: string }; Returns: boolean }
        | { Args: { _loja_id: string; _user_id: string }; Returns: boolean }
      user_shares_empresa: {
        Args: { _empresa_id: string; _user_id: string }
        Returns: boolean
      }
      users_share_any_empresa: {
        Args: { _user_id_a: string; _user_id_b: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "master" | "gerente" | "vendedor"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["master", "gerente", "vendedor"],
    },
  },
} as const
