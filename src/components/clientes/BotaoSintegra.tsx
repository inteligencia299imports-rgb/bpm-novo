// Botão ao lado da Inscrição Estadual: copia o CNPJ (só dígitos) pra área de transferência e abre o
// SINTEGRA numa aba nova, pra o usuário conferir a IE na SEFAZ da UF. Mesmo componente em sisfin,
// crm-novo, bpm-novo e ofc (src/components/clientes/BotaoSintegra.tsx).
import { FileSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const SINTEGRA_URL = "http://www.sintegra.gov.br/";

export function BotaoSintegra({ cnpj }: { cnpj: string | null | undefined }) {
  const digitos = String(cnpj ?? "").replace(/\D/g, "");
  const abrir = async () => {
    if (digitos.length === 14) {
      try {
        await navigator.clipboard.writeText(digitos);
        toast.success(`CNPJ ${digitos} copiado — cole na consulta do SINTEGRA`);
      } catch {
        toast.warning(`Não foi possível copiar o CNPJ (${digitos}) — copie manualmente`);
      }
    } else {
      toast.info("Informe o CNPJ para copiá-lo antes de consultar o SINTEGRA");
    }
    window.open(SINTEGRA_URL, "_blank", "noopener,noreferrer");
  };
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="shrink-0"
      onClick={abrir}
      title="Consultar no SINTEGRA (copia o CNPJ)"
      aria-label="Consultar no SINTEGRA (copia o CNPJ)"
    >
      <FileSearch className="h-4 w-4" />
    </Button>
  );
}
