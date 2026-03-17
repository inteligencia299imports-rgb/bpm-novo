import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Bike, ClipboardCheck, Package, Award } from 'lucide-react';

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => {
  const { role, signOut } = useAuth();

  const tabs = [
    { id: 'showroom', label: 'Showroom', icon: Bike, roles: ['vendedor', 'gestor', 'avaliador'] },
    { id: 'estoque', label: 'Estoque', icon: Package, roles: ['vendedor', 'gestor', 'avaliador'] },
    { id: 'avaliacoes', label: 'Avaliações', icon: ClipboardCheck, roles: ['avaliador', 'gestor'] },
    { id: 'nps', label: 'NPS', icon: Star, roles: ['vendedor', 'gestor', 'avaliador'] },
  ].filter(t => role && t.roles.includes(role));

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card safe-area-bottom">
      <div className="flex items-center justify-around h-16">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors ${
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
