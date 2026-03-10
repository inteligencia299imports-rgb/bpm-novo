import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Bike, LogOut, User, ShoppingBag, ClipboardCheck } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  vendedor: 'Vendedor',
  gestor: 'Gestor',
  avaliador: 'Avaliador',
};

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
  const { role, userName, signOut } = useAuth();

  const tabs = [
    { id: 'showroom', label: 'Showroom', icon: ShoppingBag, roles: ['vendedor', 'gestor'] },
    { id: 'avaliacoes', label: 'Avaliações', icon: ClipboardCheck, roles: ['avaliador', 'gestor'] },
  ].filter(t => role && t.roles.includes(role));

  return (
    <aside className="hidden md:flex flex-col w-64 min-h-screen bg-sidebar text-sidebar-foreground shadow-card">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-foreground/10">
          <Bike className="h-5 w-5 text-sidebar-foreground" />
        </div>
        <span className="text-lg font-bold tracking-tight text-sidebar-foreground">Moto CRM</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-1 px-3 py-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-sidebar-accent text-sidebar-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
            }`}
          >
            <tab.icon className="h-5 w-5" />
            {tab.label}
          </button>
        ))}
      </nav>

      {/* User info */}
      <div className="border-t border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2 mb-3">
          <User className="h-4 w-4 text-sidebar-foreground/60" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-sidebar-foreground">{userName}</p>
            <p className="text-xs text-sidebar-foreground/60">{ROLE_LABELS[role || '']}</p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
