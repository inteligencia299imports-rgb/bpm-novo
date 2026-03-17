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
          loja: string
          nome_cliente: string
          nps_enviado_at: string | null
          nps_respondido_at: string | null
          nps_status: string
          observacoes: string | null
          origem: string | null
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
          loja: string
          nome_cliente: string
          nps_enviado_at?: string | null
          nps_respondido_at?: string | null
          nps_status?: string
          observacoes?: string | null
          origem?: string | null
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
          loja?: string
          nome_cliente?: string
          nps_enviado_at?: string | null
          nps_respondido_at?: string | null
          nps_status?: string
          observacoes?: string | null
          origem?: string | null
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
          created_at: string
          id: string
          maior_valor: number | null
          menor_valor: number | null
          moto_avaliacao_id: string
          negociacao: string | null
          observacao_avaliador: string | null
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
          created_at?: string
          id?: string
          maior_valor?: number | null
          menor_valor?: number | null
          moto_avaliacao_id: string
          negociacao?: string | null
          observacao_avaliador?: string | null
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
          created_at?: string
          id?: string
          maior_valor?: number | null
          menor_valor?: number | null
          moto_avaliacao_id?: string
          negociacao?: string | null
          observacao_avaliador?: string | null
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
      estoque: {
        Row: {
          ano_fabricacao: string | null
          ano_modelo: string | null
          atendimento_venda_id: string | null
          avaliacao_id: string | null
          categoria: string | null
          cilindrada: string | null
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
          consulta_realizada: boolean | null
          cor: string | null
          created_at: string
          crlv_url: string | null
          enviada_avaliacao: boolean | null
          id: string
          km: string | null
          marca: string
          modelo: string
          observacoes: string | null
          placa: string | null
          updated_at: string
        }
        Insert: {
          ano_fabricacao?: string | null
          ano_modelo?: string | null
          atendimento_id: string
          categoria?: string | null
          consulta_realizada?: boolean | null
          cor?: string | null
          created_at?: string
          crlv_url?: string | null
          enviada_avaliacao?: boolean | null
          id?: string
          km?: string | null
          marca: string
          modelo: string
          observacoes?: string | null
          placa?: string | null
          updated_at?: string
        }
        Update: {
          ano_fabricacao?: string | null
          ano_modelo?: string | null
          atendimento_id?: string
          categoria?: string | null
          consulta_realizada?: boolean | null
          cor?: string | null
          created_at?: string
          crlv_url?: string | null
          enviada_avaliacao?: boolean | null
          id?: string
          km?: string | null
          marca?: string
          modelo?: string
          observacoes?: string | null
          placa?: string | null
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
    }
    Enums: {
      app_role: "vendedor" | "gestor" | "avaliador"
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
      app_role: ["vendedor", "gestor", "avaliador"],
    },
  },
} as const
