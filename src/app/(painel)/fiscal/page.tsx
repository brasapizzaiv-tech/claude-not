import Link from "next/link";
import { Icone } from "@/components/icone";
import { createClient } from "@/lib/supabase/server";
import { salvarConfigFiscal } from "./actions";
import { TesteNota } from "./teste-nota";

const campo =
  "w-full min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto outline-none focus:border-primaria";

function Campo({ nome, label, def, ph }: { nome: string; label: string; def: string; ph?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-texto-suave">{label}</label>
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
      <Link href="/dashboard" className="text-sm text-texto-suave hover:text-orange-600">← Início</Link>
      <h1 className="mt-2 font-numero text-2xl font-semibold tracking-apertada text-texto">Configuração fiscal (NF-e / NFC-e)</h1>
      <p className="mt-1 text-sm text-texto-suave">
        Dados da empresa e do emissor. O <b>certificado digital</b> fica no painel do emissor
        (você sobe lá) — aqui guardamos só o <b>token de API</b>.
      </p>

      <Link href="/fiscal/perfis" className="mt-4 flex items-center justify-between rounded-cartao border-2 border-orange-300 bg-orange-50 px-4 py-3 text-sm hover:bg-orange-100 dark:border-orange-900 dark:bg-orange-950/20">
        <span><b><Icone nome="cupom" tamanho={14} className="mr-1.5" /> Perfis fiscais</b> — NCM/CEST/CFOP/CSOSN por categoria do cardápio (como no Suitable), com exceção por item.</span>
        <span className="font-semibold text-orange-600">Abrir →</span>
      </Link>

      {v("emissor_ambiente") === "producao" ? (
        <div className="mt-4 rounded-cartao border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-red-500 align-middle" /> <b>PRODUÇÃO ligada</b>: toda NFC-e emitida no caixa vale de verdade na SEFAZ (série {v("nfce_serie") || "padrão do Focus"}).
        </div>
      ) : (
        <div className="mt-4 rounded-cartao border border-borda bg-superficie-suave px-4 py-3 text-sm">
          <p className="font-semibold">Checklist pra ligar a produção</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-texto-suave">
            <li>Nota de teste em homologação <b>autorizada</b> (botão lá embaixo).</li>
            <li>No painel do Focus: certificado A1 da empresa enviado e <b>CSC + ID do CSC de produção</b> cadastrados (aba Documentos Fiscais → NFC-e). Pode ser o mesmo CSC que o Suitable usa (ID 1).</li>
            <li>No painel do Focus: copiar o <b>token de produção</b> (é diferente do de homologação).</li>
            <li>Aqui: série <b>11</b> (o Suitable usa a 10 — não pode repetir), ambiente <b>Produção</b>, token de produção, e Salvar.</li>
            <li>Fazer uma venda de R$ 1 no caixa e emitir a NFC-e dela. Conferir a nota no site da SEFAZ-RS pelo QR do cupom.</li>
          </ol>
        </div>
      )}

      <form action={salvarConfigFiscal} className="mt-6 space-y-6">
        {/* Empresa */}
        <section className="rounded-cartao border border-borda p-4">
          <h2 className="mb-3 text-sm font-semibold text-texto">Empresa</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Campo nome="razao_social" def={v("razao_social")} label="Razão social" />
            <Campo nome="nome_fantasia" def={v("nome_fantasia")} label="Nome fantasia" />
            <Campo nome="cnpj" def={v("cnpj")} label="CNPJ" ph="00.000.000/0000-00" />
            <Campo nome="ie" def={v("ie")} label="Inscrição Estadual" />
            <div>
              <label className="mb-1 block text-xs text-texto-suave">Regime (CRT)</label>
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
              <label className="mb-1 block text-xs text-texto-suave">Logradouro</label>
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
        <section className="rounded-cartao border border-borda p-4">
          <h2 className="mb-3 text-sm font-semibold text-texto">Emissor (API)</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-texto-suave">Emissor</label>
              <select name="emissor" defaultValue={v("emissor") || "focusnfe"} className={campo}>
                <option value="focusnfe">Focus NFe</option>
                <option value="plugnotas">PlugNotas</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-texto-suave">Ambiente</label>
              <select name="emissor_ambiente" defaultValue={v("emissor_ambiente") || "homologacao"} className={campo}>
                <option value="homologacao">Homologação (teste)</option>
                <option value="producao">Produção (valendo)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-texto-suave">Série da NFC-e</label>
              <input name="nfce_serie" defaultValue={v("nfce_serie")} placeholder="Ex.: 11" inputMode="numeric" className={campo} />
            </div>
            <div className="sm:col-span-3">
              <label className="mb-1 block text-xs text-texto-suave">Token de API do emissor ({v("emissor_ambiente") === "producao" ? "PRODUÇÃO" : "homologação"})</label>
              <input name="emissor_token" defaultValue={v("emissor_token")} placeholder="token do Focus" className={campo} />
              <p className="mt-1 text-[11px] text-texto-fraco">O Focus tem um token pra homologação e OUTRO pra produção. Ao trocar o ambiente, troque o token junto.</p>
            </div>
            <Campo nome="csc" def={v("csc")} label="CSC (código do QR)" />
            <Campo nome="csc_id" def={v("csc_id")} label="ID do CSC" />
          </div>
        </section>

        {/* Padrões fiscais (para o buffet, que não tem item) */}
        <section className="rounded-cartao border border-borda p-4">
          <h2 className="mb-3 text-sm font-semibold text-texto">Padrões (buffet / serviço)</h2>
          <div className="grid grid-cols-3 gap-3">
            <Campo nome="ncm_buffet" def={v("ncm_buffet")} label="NCM do buffet" ph="Ex.: 21069090" />
            <Campo nome="cfop_padrao" def={v("cfop_padrao")} label="CFOP padrão" ph="Ex.: 5102" />
            <Campo nome="csosn_padrao" def={v("csosn_padrao")} label="CSOSN padrão" ph="Ex.: 102" />
          </div>
          <p className="mt-2 text-[11px] text-texto-fraco">
            Usados quando um produto não tiver os campos fiscais próprios (ex.: o buffet). O contador informa os valores certos.
          </p>
        </section>

        <button className="rounded-controle bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600">
          Salvar configuração fiscal
        </button>
      </form>

      <div className="mt-6">
        <TesteNota />
      </div>
    </div>
  );
}
