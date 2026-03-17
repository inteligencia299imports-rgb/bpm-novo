import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { User } from 'lucide-react';
import logoImg from '@/assets/logo-crm.png';

const ROLE_LABELS: Record<string, string> = {
  vendedor: 'Vendedor',
  gestor: 'Gestor',
  avaliador: 'Avaliador',
};

interface HeaderProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const Header: React.FC<HeaderProps> = ({ activeTab, onTabChange }) => {
  const { role, userName, signOut } = useAuth();

  const tabs = [
    { id: 'showroom', label: 'Showroom', roles: ['vendedor', 'gestor'] },
    { id: 'avaliacoes', label: 'Avaliações', roles: ['avaliador', 'gestor'] },
  ].filter(t => role && t.roles.includes(role));

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg overflow-hidden">
            <img src={logoImg} alt="CRM 299" className="h-9 w-9 object-cover" />
          </div>
          <span className="text-lg font-bold tracking-tight hidden sm:block">CRM 299</span>
        </div>

        <nav className="flex gap-1">
          {tabs.map(tab => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onTabChange(tab.id)}
              className="font-medium"
            >
              {tab.label}
            </Button>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{userName}</span>
            <span className="text-muted-foreground">({ROLE_LABELS[role || '']})</span>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} title="Sair">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;
