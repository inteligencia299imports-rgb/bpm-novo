import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { AppRole } from '@/types/crm';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  userName: string;
  loading: boolean;
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
  const [loading, setLoading] = useState(true);

  const fetchRole = async (userId: string) => {
    const { data } = await supabase
      .from('user_roles_motos' as any)
      .select('role, nome')
      .eq('user_id', userId)
      .maybeSingle();
    if (data) {
      setRole(data.role as AppRole);
      setUserName(data.nome || '');
    }
  };

  useEffect(() => {
    // Get initial session first
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchRole(session.user.id);
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
          setRole(null);
          setUserName('');
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
    setRole(null);
    setUserName('');
  };

  return (
    <AuthContext.Provider value={{ user, session, role, userName, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
