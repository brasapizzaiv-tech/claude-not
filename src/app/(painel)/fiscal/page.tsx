import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { salvarConfigFiscal } from "./actions";

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

function Campo({ nome, label, def, ph }: { nome: string; label: string; def: string; ph?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-zinc-500">{label}</label>
      <input name={nome} defaultValue={def} placeholder={ph} className={campo} />
    </div>
  );
}

export default async function FiscalPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("config_fiscal").select("chave, valor");
  const cfg: Record<string, string> = {};
  for (const r of data ?? []) cfg[r.chave] = r.valor ?? "";
  const v = (k: string) => cfg[k] ?? "";

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-orange-600">← Início</Link>
      <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">Configuração fiscal (NF-e / NFC-e)</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Dados da empresa e do emissor. O <b>certificado digital</b> fica no painel do emissor
        (você sobe lá) — aqui guardamos só o <b>token de API</b>.
      </p>

      <form action={salvarConfigFiscal} className="mt-6 space-y-6">
        {/* Empresa */}
        <section className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Empresa</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Campo nome="razao_social" def={v("razao_social")} label="Razão social" />
            <Campo nome="nome_fantasia" def={v("nome_fantasia")} label="Nome fantasia" />
            <Campo nome="cnpj" def={v("cnpj")} label="CNPJ" ph="00.000.000/0000-00" />
            <Campo nome="ie" def={v("ie")} label="Inscrição Estadual" />
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Regime (CRT)</label>
              <select name="crt" defaultValue={v("crt") || "1"} className={campo}>
                <option value="1">1 — Simples Nacional</option>
                <option value="2">2 — Simples (excesso sublimite)</option>
                <option value="3">3 — Regime Normal</option>
              </select>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Campo nome="cep" def={v("cep")} label="CEP" />
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-zinc-500">Logradouro</label>
              <input name="logradouro" defaultValue={v("logradouro")} className={campo} />
            </div>
            <Campo nome="numero" def={v("numero")} label="Número" />
            <Campo nome="bairro" def={v("bairro")} label="Bairro" />
            <Campo nome="municipio" def={v("municipio")} label="Município" />
            <Campo nome="uf" def={v("uf")} label="UF" ph="RS" />
            <Campo nome="cod_municipio" def={v("cod_municipio")} label="Cód. IBGE município" />
          </div>
        </section>

        {/* Emissor */}
        <section className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Emissor (API)</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Emissor</label>
              <select name="emissor" defaultValue={v("emissor") || "focusnfe"} className={campo}>
                <option value="focusnfe">Focus NFe</option>
                <option value="plugnotas">PlugNotas</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Ambiente</label>
              <select name="emissor_ambiente" defaultValue={v("emissor_ambiente") || "homologacao"} className={campo}>
                <option value="homologacao">Homologação (teste)</option>
                <option value="producao">Produção (valendo)</option>
              </select>
            </div>
            <div className="sm:col-span-3">
              <label className="mb-1 block text-xs text-zinc-500">Token de API do emissor</label>
              <input name="emissor_token" defaultValue={v("emissor_token")} placeholder="cole aqui o token do sandbox" className={campo} />
            </div>
            <Campo nome="csc" def={v("csc")} label="CSC (código do QR)" />
            <Campo nome="csc_id" def={v("csc_id")} label="ID do CSC" />
          </div>
        </section>

        {/* Padrões fiscais (para o buffet, que não tem item) */}
        <section className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Padrões (buffet / serviço)</h2>
          <div className="grid grid-cols-3 gap-3">
            <Campo nome="ncm_buffet" def={v("ncm_buffet")} label="NCM do buffet" ph="Ex.: 21069090" />
            <Campo nome="cfop_padrao" def={v("cfop_padrao")} label="CFOP padrão" ph="Ex.: 5102" />
            <Campo nome="csosn_padrao" def={v("csosn_padrao")} label="CSOSN padrão" ph="Ex.: 102" />
          </div>
          <p className="mt-2 text-[11px] text-zinc-400">
            Usados quando um produto não tiver os campos fiscais próprios (ex.: o buffet). O contador informa os valores certos.
          </p>
        </section>

        <button className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600">
          Salvar configuração fiscal
        </button>
      </form>
    </div>
  );
}
