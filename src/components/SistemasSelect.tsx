import { Monitor } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

// Seletor "Sistemas" — mesmo do SisFin (aba Relatórios): abre os outros sistemas da 299 numa aba
// nova, sempre sem o sistema atual. NPS é a tela consolidada do SisFin.
const SISTEMAS = [
  { sigla: "SISFIN", url: "https://sisfin.299imports.com.br" },
  { sigla: "BPM", url: "https://bpm.299imports.com.br" },
  { sigla: "CRM", url: "https://crm.299imports.com.br" },
  { sigla: "OFC", url: "https://ofc.299imports.com.br" },
  { sigla: "HCM", url: "https://hcm.299imports.com.br" },
  { sigla: "MINI", url: "https://mini.299imports.com.br" },
  { sigla: "NPS", url: "https://sisfin.299imports.com.br/nps" },
] as const;

export type SiglaSistema = (typeof SISTEMAS)[number]["sigla"];

export function SistemasSelect({ atual, className }: { atual: SiglaSistema; className?: string }) {
  return (
    <Select value="" onValueChange={(url) => url && window.open(url, "_blank", "noopener,noreferrer")}>
      <SelectTrigger className={className ?? "h-8 w-[150px] bg-white"} aria-label="Ir para outro sistema">
        <div className="flex items-center gap-1.5 text-sm">
          <Monitor className="h-4 w-4 shrink-0 text-primary" /> Sistemas
        </div>
      </SelectTrigger>
      <SelectContent>
        {SISTEMAS.filter((s) => s.sigla !== atual).map((s) => (
          <SelectItem key={s.sigla} value={s.url}>{s.sigla}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
