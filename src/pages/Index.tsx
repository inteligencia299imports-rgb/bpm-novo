import { useAuth } from '@/contexts/AuthContext';
import Login from './Login';
import Dashboard from './Dashboard';
import { Button } from '@/components/ui/button';

const Index = () => {
  const { user, role, loading, roleChecked, signOut } = useAuth();

  if (loading || (user && !roleChecked)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (user && roleChecked && !role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4 max-w-sm">
          <h1 className="text-xl font-semibold">Sem acesso</h1>
          <p className="text-muted-foreground">
            Seu usuário não possui um acesso ativo neste sistema. Fale com um administrador.
          </p>
          <Button variant="outline" onClick={() => signOut()}>Sair</Button>
        </div>
      </div>
    );
  }

  return user ? <Dashboard /> : <Login />;
};

export default Index;
