"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarConfigSefaz, buscarNotasSefaz } from "../sefaz-actions";

const UFS: { sigla: string; cuf: number }[] = [
  { sigla: "RS", cuf: 43 },
  { sigla: "SC", cuf: 42 },
  { sigla: "PR", cuf: 41 },
  { sigla: "SP", cuf: 35 },
  { sigla: "RJ", cuf: 33 },
  { sigla: "MG", cuf: 31 },
  { sigla: "ES", cuf: 32 },
  { sigla: "BA", cuf: 29 },
  { sigla: "GO", cuf: 52 },
  { sigla: "DF", cuf: 53 },
];

const input =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export function SefazPainel({
  status,
}: {
  status: {
    temCert: boolean;
    cnpj: string;
    cuf: number;
    ambiente: number;
    cert_nome: string | null;
    ult_nsu: string;
    atualizado_em: string | null;
  };
}) {
  const router = useRouter();
  const [salvando, startSalvar] = useTransition();
  const [buscando, startBuscar] = useTransition();
  const [cnpj, setCnpj] = useState(status.cnpj);
  const [cuf, setCuf] = useState(status.cuf || 43);
  const [senha, setSenha] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  async function salvar() {
    startSalvar(async () => {
      let cert_pfx: string | undefined;
      let cert_nome: string | undefined;
      if (arquivo) {
        // Lê os bytes e converte para base64 de forma robusta (sem data URL).
        const bytes = new Uint8Array(await arquivo.arrayBuffer());
        let bin = "";
        for (let i = 0; i < bytes.length; i++)
          bin += String.fromCharCode(bytes[i]);
        cert_pfx = btoa(bin);
        cert_nome = arquivo.name;
      }
      await salvarConfigSefaz({
        cnpj,
        cuf,
        ambiente: 1,
        cert_pfx,
        cert_nome,
        cert_senha: senha || undefined,
      });
      setSenha("");
      setArquivo(null);
      setMsg("Configuração salva.");
      setTimeout(() => setMsg(null), 4000);
      router.refresh();
    });
  }

  function buscar() {
    startBuscar(async () => {
      setResultado(null);
      const r = await buscarNotasSefaz();
      if (r?.erro) {
        setResultado(`❌ ${r.erro}`);
      } else {
        const partes = [
          `${r?.importadas ?? 0} nota(s) completa(s)`,
          `${r?.resumos ?? 0} resumo(s)`,
        ];
        setResultado(
          `✓ ${partes.join(" · ")}. SEFAZ: ${r?.cStat} ${r?.xMotivo ?? ""}`,
        );
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Certificado */}
      <div className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="mb-1 font-semibold text-zinc-900 dark:text-zinc-50">
          Certificado A1
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          {status.temCert
            ? `Certificado carregado: ${status.cert_nome ?? "sim"}. Para trocar, escolha outro arquivo.`
            : "Suba o arquivo .pfx do seu certificado e digite a senha. Fica guardado só no servidor."}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">
              Arquivo do certificado (.pfx)
            </label>
            <input
              type="file"
              accept=".pfx,.p12"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
              className={input}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">
              Senha do certificado
            </label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder={status.temCert ? "•••••• (guardada)" : ""}
              className={input}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">
              CNPJ da empresa
            </label>
            <input
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              placeholder="00.000.000/0000-00"
              className={input}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Estado (UF)</label>
            <select
              value={cuf}
              onChange={(e) => setCuf(Number(e.target.value))}
              className={input}
            >
              {UFS.map((u) => (
                <option key={u.cuf} value={u.cuf}>
                  {u.sigla}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={salvar}
            disabled={salvando}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-900 disabled:opacity-60 dark:bg-zinc-700"
          >
            {salvando ? "Salvando..." : "Salvar configuração"}
          </button>
          {msg && <span className="text-sm text-green-600">{msg}</span>}
        </div>
      </div>

      {/* Buscar */}
      <div className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="mb-1 font-semibold text-zinc-900 dark:text-zinc-50">
          Buscar notas na SEFAZ
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          Puxa as notas emitidas contra o seu CNPJ desde a última busca.
          {status.ult_nsu && status.ult_nsu !== "000000000000000"
            ? ` (última posição: ${status.ult_nsu})`
            : ""}
        </p>
        <button
          onClick={buscar}
          disabled={buscando || !status.temCert}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"
        >
          {buscando ? "Buscando na SEFAZ..." : "Buscar notas agora"}
        </button>
        {resultado && (
          <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
            {resultado}
          </p>
        )}
        <p className="mt-3 text-xs text-zinc-400">
          Dica: a SEFAZ limita consultas (cerca de 1 por hora). Se aparecer
          “consumo indevido”, espere um pouco e tente de novo.
        </p>
      </div>
    </div>
  );
}
