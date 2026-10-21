// Contribuinte de ICMS do cliente/fornecedor PJ — decisão do usuário (2026-10-21, opção 3):
//  1. Vale a INSCRIÇÃO ESTADUAL ATIVA na UF do endereço, consultada na CNPJ.ws (publica.cnpj.ws,
//     estabelecimento.inscricoes_estaduais[].ativo). IE ativa = contribuinte (e a IE é sugerida);
//     sem IE ativa na UF = não contribuinte, qualquer que seja o CNAE.
//  2. Consulta indisponível (limite de 3/min da CNPJ.ws, fora do ar): SUGESTÃO pelo CNAE principal —
//     agro, extração, indústria, energia/gás, comércio, transporte e telecom = contribuinte; demais
//     (serviços) = não. O usuário confere e pode mudar.
// Mesmo arquivo em sisfin, crm-novo, bpm-novo e ofc (src/lib/contribuinteIcms.ts) — altere nos quatro.
// docs-fiscal-299/pendencias.md §2.124.

export interface ResultadoContribuinteIcms {
  contribuinte: boolean;
  ie: string | null; // IE ativa na UF (só dígitos), quando achada
  fonte: "ie" | "cnae";
  motivo: string;
}

const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");

// Divisões CNAE (2 primeiros dígitos) que em regra têm IE: 01-03 agro, 05-09 extração, 10-33
// indústria, 35 energia/gás, 45-47 comércio, 49-51 transporte, 61 telecomunicações.
const DIVISOES_CONTRIBUINTE = new Set([
  "01", "02", "03", "05", "06", "07", "08", "09",
  ...Array.from({ length: 24 }, (_, i) => String(10 + i)),
  "35", "45", "46", "47", "49", "50", "51", "61",
]);

export function cnaeSugereContribuinte(cnae: unknown): boolean | null {
  const d = dig(cnae).slice(0, 2);
  if (d.length < 2) return null;
  return DIVISOES_CONTRIBUINTE.has(d);
}

export async function decidirContribuinteIcms(cnpj: string, uf: string, cnae: unknown): Promise<ResultadoContribuinteIcms | null> {
  const c = dig(cnpj);
  const u = String(uf ?? "").trim().toUpperCase();
  if (c.length === 14 && u.length === 2) {
    try {
      const res = await fetch(`https://publica.cnpj.ws/cnpj/${c}`, { signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const j = await res.json();
        const ies = ((j?.estabelecimento?.inscricoes_estaduais ?? []) as { inscricao_estadual?: string; ativo?: boolean; estado?: { sigla?: string } }[])
          .filter((x) => String(x?.estado?.sigla ?? "").toUpperCase() === u);
        const ativa = ies.find((x) => x?.ativo === true && dig(x.inscricao_estadual));
        if (ativa) return { contribuinte: true, ie: dig(ativa.inscricao_estadual), fonte: "ie", motivo: `IE ${dig(ativa.inscricao_estadual)} ativa em ${u}` };
        return { contribuinte: false, ie: null, fonte: "ie", motivo: ies.length ? `IE de ${u} inativa` : `sem inscrição estadual em ${u}` };
      }
    } catch {
      // cai na sugestão pelo CNAE
    }
  }
  const s = cnaeSugereContribuinte(cnae);
  if (s == null) return null;
  return {
    contribuinte: s,
    ie: null,
    fonte: "cnae",
    motivo: `${s ? "CNAE de comércio/indústria" : "CNAE de serviço"} — consulta da IE indisponível, confira`,
  };
}
