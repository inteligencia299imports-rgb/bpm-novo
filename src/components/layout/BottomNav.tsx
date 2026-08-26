import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Bike, ClipboardCheck, Package, FileSearch, ShoppingBag, Handshake, ShoppingCart, FileText, Wrench, Flame, BarChart3, Award } from 'lucide-react';
import NotificationBell from './NotificationBell';

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => {
  const { role, signOut } = useAuth();

  const tabs = [
    { id: 'relatorios', label: 'Relatórios', icon: BarChart3, roles: ['master', 'gerente', 'vendedor'] },
    { id: 'showroom', label: 'Showroom', icon: Bike, roles: ['vendedor', 'master', 'gerente'] },
    { id: 'avaliacoes', label: 'Avaliações', icon: ClipboardCheck, roles: ['gerente', 'master'] },
    { id: 'novidades', label: 'Novidades', icon: Flame, roles: ['vendedor', 'master', 'gerente'] },
    { id: 'estoque', label: 'Estoque', icon: Package, roles: ['vendedor', 'master', 'gerente'] },
    { id: 'consulta', label: 'Consulta', icon: FileSearch, roles: ['gerente', 'master'] },
    { id: 'pos_venda', label: 'Pós-Venda', icon: ShoppingBag, roles: ['gerente', 'master'] },
    { id: 'intermediacao', label: 'Intermed.', icon: Handshake, roles: ['gerente', 'master'] },
    { id: 'pos_compra', label: 'Pós-Compra', icon: ShoppingCart, roles: ['gerente', 'master'] },
    { id: 'consignacao', label: 'Consign.', icon: FileText, roles: ['gerente', 'master'] },
    { id: 'preparacao', label: 'Preparação', icon: Wrench, roles: ['vendedor', 'gerente', 'master'] },
    { id: 'nps', label: 'NPS', icon: Award, roles: ['vendedor', 'master', 'gerente'] },
  ].filter(t => role && t.roles.includes(role));

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card safe-area-bottom overflow-x-auto">
      <div className="flex items-center h-16 min-w-max px-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-col items-center justify-center gap-1 min-w-[60px] px-2 h-full transition-colors ${
              activeTab === tab.id
                ? 'text-primary'
                : 'text-muted-foreground'
            }`}
          >
            <tab.icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </button>
        ))}
        <div className="flex flex-col items-center justify-center min-w-[60px] px-2 h-full text-primary">
          <NotificationBell className="text-primary" />
        </div>
      </div>
    </nav>
  );
};

export default BottomNav;
