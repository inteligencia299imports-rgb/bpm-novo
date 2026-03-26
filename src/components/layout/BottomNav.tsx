import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Bike, ClipboardCheck, Package, Award, FileSearch, ShoppingBag, Handshake, ShoppingCart, FileText, Wrench } from 'lucide-react';
import NotificationBell from './NotificationBell';

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => {
  const { role, signOut } = useAuth();

  const tabs = [
    { id: 'showroom', label: 'Showroom', icon: Bike, roles: ['vendedor', 'gestor', 'avaliador', 'secretaria'] },
    { id: 'avaliacoes', label: 'Avaliações', icon: ClipboardCheck, roles: ['avaliador', 'gestor', 'secretaria'] },
    { id: 'estoque', label: 'Estoque', icon: Package, roles: ['vendedor', 'gestor', 'avaliador', 'secretaria'] },
    { id: 'consulta', label: 'Consulta', icon: FileSearch, roles: ['avaliador', 'gestor', 'secretaria'] },
    { id: 'pos_venda', label: 'Pós-Venda', icon: ShoppingBag, roles: ['avaliador', 'gestor', 'secretaria'] },
    { id: 'intermediacao', label: 'Intermed.', icon: Handshake, roles: ['avaliador', 'gestor', 'secretaria'] },
    { id: 'pos_compra', label: 'Pós-Compra', icon: ShoppingCart, roles: ['avaliador', 'gestor', 'secretaria'] },
    { id: 'consignacao', label: 'Consign.', icon: FileText, roles: ['avaliador', 'gestor', 'secretaria'] },
    { id: 'preparacao', label: 'Preparação', icon: Wrench, roles: ['vendedor', 'avaliador', 'gestor', 'secretaria'] },
    { id: 'nps', label: 'NPS', icon: Award, roles: ['vendedor', 'gestor', 'avaliador'] },
  ].filter(t => role && t.roles.includes(role));

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card safe-area-bottom overflow-x-auto">
      <div className="flex items-center h-16 min-w-max px-1">
        <div className="flex items-center justify-center px-2">
          <NotificationBell />
        </div>
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
      </div>
    </nav>
  );
};

export default BottomNav;
