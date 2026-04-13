import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Bike, User, Package, ClipboardCheck, PanelLeftClose, PanelLeftOpen, FileSearch, ShoppingBag, Handshake, ShoppingCart, FileText, Wrench, Flame, BarChart3, Award } from 'lucide-react';
import logoImg from '@/assets/logo-crm.png';
import NotificationBell from './NotificationBell';
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
    { id: 'relatorios', label: 'Relatórios', icon: BarChart3, roles: ['gestor', 'vendedor', 'avaliador'] },
    { id: 'showroom', label: 'Showroom', icon: Bike, roles: ['vendedor', 'gestor', 'avaliador'] },
    { id: 'avaliacoes', label: 'Avaliações', icon: ClipboardCheck, roles: ['avaliador', 'gestor'] },
    { id: 'novidades', label: 'Novidades', icon: Flame, roles: ['vendedor', 'gestor'] },
    { id: 'estoque', label: 'Estoque', icon: Package, roles: ['vendedor', 'gestor', 'avaliador'] },
    { id: 'consulta', label: 'Consulta', icon: FileSearch, roles: ['avaliador', 'gestor'] },
    { id: 'pos_venda', label: 'Pós-Venda', icon: ShoppingBag, roles: ['avaliador', 'gestor'] },
    { id: 'intermediacao', label: 'Intermediação', icon: Handshake, roles: ['avaliador', 'gestor'] },
    { id: 'pos_compra', label: 'Pós-Compra', icon: ShoppingCart, roles: ['avaliador', 'gestor'] },
    { id: 'consignacao', label: 'Consignação', icon: FileText, roles: ['avaliador', 'gestor'] },
    { id: 'preparacao', label: 'Preparação', icon: Wrench, roles: ['vendedor', 'avaliador', 'gestor'] },
    { id: 'nps', label: 'NPS', icon: Award, roles: ['gestor', 'vendedor', 'avaliador'] },
  ].filter(t => role && t.roles.includes(role));

  return (
    <aside className={`hidden md:flex flex-col min-h-screen bg-sidebar text-sidebar-foreground shadow-card transition-all duration-300 ${collapsed ? 'w-16' : 'w-52'}`}>
      {/* Logo + Toggle */}
      <div className="flex items-center justify-between px-3 py-5 border-b border-sidebar-border">
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center w-full' : 'px-2'}`}>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg overflow-hidden shrink-0">
            <img src={logoImg} alt="BPM 299" className="h-9 w-9 object-cover" />
          </div>
          {!collapsed && <span className="text-lg font-bold tracking-tight text-sidebar-foreground">BPM 299</span>}
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
        <div className={`flex items-center gap-2 mb-3 ${collapsed ? 'flex-col' : ''}`}>
          <div className={`flex items-center gap-2 ${collapsed ? 'justify-center' : 'flex-1 min-w-0'}`}>
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
          <NotificationBell />
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
