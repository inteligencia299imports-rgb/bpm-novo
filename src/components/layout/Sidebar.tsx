import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Bike, LogOut, User, Package, ClipboardCheck, PanelLeftClose, PanelLeftOpen, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ROLE_LABELS: Record<string, string> = {
  vendedor: 'Vendedor',
  gestor: 'Gestor',
  avaliador: 'Avaliador',
};

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, collapsed, onToggle }) => {
  const { role, userName, signOut } = useAuth();

  const tabs = [
    { id: 'showroom', label: 'Showroom', icon: Bike, roles: ['vendedor', 'gestor'] },
    { id: 'estoque', label: 'Estoque', icon: Package, roles: ['vendedor', 'gestor', 'avaliador'] },
    { id: 'avaliacoes', label: 'Avaliações', icon: ClipboardCheck, roles: ['vendedor', 'avaliador', 'gestor'] },
  ].filter(t => role && t.roles.includes(role));

  return (
    <aside className={`hidden md:flex flex-col min-h-screen bg-sidebar text-sidebar-foreground shadow-card transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`}>
      {/* Logo + Toggle */}
      <div className="flex items-center justify-between px-3 py-5 border-b border-sidebar-border">
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center w-full' : 'px-2'}`}>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 shrink-0">
            <Bike className="h-5 w-5 text-sidebar-foreground" />
          </div>
          {!collapsed && <span className="text-lg font-bold tracking-tight text-sidebar-foreground">CRM 299</span>}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-1 px-2 py-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            title={collapsed ? tab.label : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              collapsed ? 'justify-center' : ''
            } ${
              activeTab === tab.id
                ? 'bg-sidebar-accent text-sidebar-foreground'
                : 'text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground'
            }`}
          >
            <tab.icon className="h-5 w-5 shrink-0" />
            {!collapsed && tab.label}
          </button>
        ))}
      </nav>

      {/* Toggle button */}
      <div className="px-2 py-2">
        <button
          onClick={onToggle}
          className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-white/10 transition-colors justify-center"
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed && <span>Recolher</span>}
        </button>
      </div>

      {/* User info */}
      <div className="border-t border-sidebar-border px-3 py-4">
        <div className={`flex items-center gap-2 mb-3 ${collapsed ? 'justify-center' : ''}`}>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 shrink-0">
            <User className="h-4 w-4 text-sidebar-foreground" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-sidebar-foreground">{userName}</p>
              <p className="text-xs text-sidebar-foreground/60">{ROLE_LABELS[role || '']}</p>
            </div>
          )}
        </div>
        <button
          onClick={signOut}
          title={collapsed ? 'Sair' : undefined}
          className={`flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-white/10 transition-colors ${collapsed ? 'justify-center' : ''}`}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && 'Sair'}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
