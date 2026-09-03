import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { AppRole } from '@/types/crm';
import { firstLastName } from '@/lib/utils';
import { BPM_PROJETO_ID } from '@/lib/projeto';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  userName: string;
  lojas: string[];
  lojaPrincipal: string | null;
  ufPrincipal: string | null;
  limiteDescontoPercentual: number;
  loading: boolean;
  roleChecked: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [userName, setUserName] = useState('');
  const [lojas, setLojas] = useState<string[]>([]);
  const [lojaPrincipal, setLojaPrincipal] = useState<string | null>(null);
  const [ufPrincipal, setUfPrincipal] = useState<string | null>(null);
  const [limiteDescontoPercentual, setLimiteDescontoPercentual] = useState(8);
  const [loading, setLoading] = useState(true);
  const [roleChecked, setRoleChecked] = useState(false);

  const resetRoleState = () => {
    setRole(null);
    setUserName('');
    setLojas([]);
    setLojaPrincipal(null);
    setUfPrincipal(null);
    setLimiteDescontoPercentual(8);
  };

  const fetchRole = async (userId: string) => {
    const { data } = await supabase
      .from('user_roles')
      .select('app_role, nome, limite_desconto_percentual, loja_id')
      .eq('user_id', userId)
      .eq('ativo', true)
      .eq('projeto_id', BPM_PROJETO_ID)
      .maybeSingle();

    if (data) {
      setRole(data.app_role as AppRole);
      setUserName(firstLastName(data.nome));
      setLimiteDescontoPercentual(data.limite_desconto_percentual ?? 8);

      if (data.loja_id) {
        const { data: lojaEmpresa } = await (supabase as any)
          .from('loja_empresas')
          .select('loja, ativo, empresas(uf)')
          .eq('id', data.loja_id)
          .maybeSingle();
        setLojaPrincipal(lojaEmpresa?.ativo ? lojaEmpresa.loja : null);
        setUfPrincipal(lojaEmpresa?.ativo ? lojaEmpresa.empresas?.uf ?? null : null);
      } else {
        setLojaPrincipal(null);
        setUfPrincipal(null);
      }

      const { data: empresasData } = await supabase
        .from('user_empresas')
        .select('empresas(nome)')
        .eq('user_id', userId);
      setLojas((empresasData || []).map((e: any) => e.empresas?.nome).filter(Boolean));
    } else {
      resetRoleState();
    }
    setRoleChecked(true);
  };

  useEffect(() => {
    // Get initial session first
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchRole(session.user.id);
      } else {
        setRoleChecked(true);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // During token refresh, don't clear user to avoid unmounting the app
        if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
          setSession(session);
          if (session?.user) {
            setUser(session.user);
            setTimeout(() => fetchRole(session.user.id), 0);
          }
        } else if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          resetRoleState();
          setRoleChecked(true);
        } else {
          setSession(session);
          if (session?.user) {
            setUser(session.user);
            setTimeout(() => fetchRole(session.user.id), 0);
          }
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    resetRoleState();
  };

  return (
    <AuthContext.Provider value={{ user, session, role, userName, lojas, lojaPrincipal, ufPrincipal, limiteDescontoPercentual, loading, roleChecked, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
