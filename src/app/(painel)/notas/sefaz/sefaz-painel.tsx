"use client";

import { useEffect, useState, useTransition } from "react";
import { confirmar } from "@/components/dialogo";
import { useRouter } from "next/navigation";
import {
  salvarConfigSefaz,
  buscarNotasSefaz,
  reprocessarSefaz,
} from "../sefaz-actions";

function horaBR(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function quandoBR(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

// Dias até a data (AAAA-MM-DD), contando pelo dia de Brasília.
function diasAte(dia: string) {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return Math.round((Date.parse(dia + "T00:00:00Z") - Date.parse(hoje + "T00:00:00Z")) / 86400000);
}

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
  "w-full min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria";

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
    bloqueado_ate: string | null;
    cert_validade: string | null;
    ultimo_cstat: string | null;
    ultimo_motivo: string | null;
    ultima_busca_em: string | null;
    ultima_busca_ok_em: string | null;
  };
}) {
  const router = useRouter();
  const [salvando, startSalvar] = useTransition();
  const [buscando, startBuscar] = useTransition();
  const [cnpj, setCnpj] = useState(status.cnpj);
  const [cuf, setCuf] = useState(status.cuf || 43);
  const [senha, setSenha] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [validade, setValidade] = useState(status.cert_validade ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [bloqueadoAte, setBloqueadoAte] = useState<string | null>(
    status.bloqueado_ate,
  );
  const [agora, setAgora] = useState(() => Date.now());

  // Atualiza o relógio a cada 15s para liberar o botão na hora certa.
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const travado = !!bloqueadoAte && new Date(bloqueadoAte).getTime() > agora;

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
        cert_validade: validade || null,
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
      if (r?.bloqueado_ate) setBloqueadoAte(r.bloqueado_ate);
      if (r?.erro) {
        setResultado(r.erro);
      } else {
        const partes = [
          `${r?.importadas ?? 0} nota(s) completa(s)`,
          `${r?.resumos ?? 0} resumo(s)`,
        ];
        if (r?.falhas) partes.push(`${r.falhas} falha(s)`);
        setResultado(
          `✓ ${partes.join(" · ")}. SEFAZ: ${r?.cStat} ${r?.xMotivo ?? ""}`,
        );
      }
      router.refresh();
    });
  }

  async function reprocessar(dias?: number) {
    const msg = dias
      ? `Reprocessar os últimos ${dias} dias (mais rápido) para recuperar notas que faltaram. Continuar?`
      : "Reprocessar volta ao início e puxa novamente as notas dos últimos ~90 dias, recuperando as que faltaram. Pode levar vários minutos e consome a cota da SEFAZ. Continuar?";
    if (!await confirmar(msg)) return;
    startBuscar(async () => {
      setResultado("Reprocessando...");
      const r = await reprocessarSefaz(dias);
      if (r?.bloqueado_ate) setBloqueadoAte(r.bloqueado_ate);
      if (r?.erro) setResultado(r.erro);
      else
        setResultado(
          `✓ Reprocessado${dias ? ` (${dias} dias)` : ""}: ${r?.importadas ?? 0} nota(s) · ${r?.resumos ?? 0} resumo(s)${r?.falhas ? ` · ${r.falhas} falha(s)` : ""}.`,
        );
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Certificado */}
      <div className="cartao p-5">
        <h2 className="mb-1 font-semibold text-texto">
          Certificado A1
        </h2>
        <p className="mb-4 text-sm text-texto-suave">
          {status.temCert
            ? `Certificado carregado: ${status.cert_nome ?? "sim"}. Para trocar, escolha outro arquivo.`
            : "Suba o arquivo .pfx do seu certificado e digite a senha. Fica guardado só no servidor."}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-texto-suave">
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
            <label className="mb-1 block text-xs text-texto-suave">
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
            <label className="mb-1 block text-xs text-texto-suave">
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
            <label htmlFor="cert-validade" className="mb-1 block text-xs text-texto-suave">
              Certificado vence em
            </label>
            <input
              id="cert-validade"
              type="date"
              value={validade}
              onChange={(e) => setValidade(e.target.value)}
              className={input}
            />
            <p className="mt-1 text-xs text-texto-fraco">
              Está no próprio certificado ou no e-mail da certificadora. O sistema avisa 30 dias antes:
              o mesmo certificado serve à SEFAZ, à nota fiscal e ao Pix.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-texto-suave">Estado (UF)</label>
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
            className="rounded-controle bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-900 disabled:opacity-60 dark:bg-zinc-700"
          >
            {salvando ? "Salvando..." : "Salvar configuração"}
          </button>
          {msg && <span className="text-sm text-green-600">{msg}</span>}
        </div>
      </div>

      {/* Última resposta (NFE-03) */}
      {(status.ultima_busca_em || status.cert_validade) && (
        <div className="cartao p-5">
          <h2 className="mb-3 font-semibold text-texto">Como está a ligação com a SEFAZ</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {status.ultima_busca_em && (
              <div>
                <dt className="rotulo">Última resposta</dt>
                <dd className="mt-1 text-texto">
                  {quandoBR(status.ultima_busca_em)} · {status.ultimo_cstat ? `código ${status.ultimo_cstat}` : "sem código"}
                  {status.ultimo_motivo && <span className="block text-texto-suave">{status.ultimo_motivo}</span>}
                </dd>
              </div>
            )}
            <div>
              <dt className="rotulo">Última busca que deu certo</dt>
              <dd className="mt-1 text-texto">
                {status.ultima_busca_ok_em ? quandoBR(status.ultima_busca_ok_em) : "nenhuma registrada ainda"}
              </dd>
            </div>
            {status.cert_validade && (
              <div>
                <dt className="rotulo">Certificado</dt>
                <dd className="mt-1">
                  {(() => {
                    const d = diasAte(status.cert_validade);
                    const data = status.cert_validade.split("-").reverse().join("/");
                    if (d < 0) return <span className="pilula pilula-urgente">venceu em {data}</span>;
                    if (d <= 30) return <span className="pilula pilula-urgente">vence em {d} dia(s), {data}</span>;
                    return <span className="text-texto">vale até {data}</span>;
                  })()}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* Buscar */}
      <div className="cartao p-5">
        <h2 className="mb-1 font-semibold text-texto">
          Buscar notas na SEFAZ
        </h2>
        <p className="mb-4 text-sm text-texto-suave">
          Puxa as notas emitidas contra o seu CNPJ desde a última busca.
          {status.ult_nsu && status.ult_nsu !== "000000000000000"
            ? ` (última posição: ${status.ult_nsu})`
            : ""}
        </p>
        <button
          onClick={buscar}
          disabled={buscando || !status.temCert || travado}
          className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90 disabled:opacity-60"
        >
          {buscando
            ? "Buscando na SEFAZ..."
            : travado
              ? `Liberado às ${horaBR(bloqueadoAte!)}`
              : "Buscar notas agora"}
        </button>
        {travado && (
          <p className="mt-3 rounded-controle bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            A SEFAZ permite ~1 busca por hora. A próxima fica liberada às{" "}
            <b>{horaBR(bloqueadoAte!)}</b>. Guardamos onde parou — ao liberar, a
            busca continua de onde estava.
          </p>
        )}
        {resultado && (
          <p className="mt-3 text-sm text-texto-suave">
            {resultado}
          </p>
        )}
        <p className="mt-3 text-xs text-texto-fraco">
          Dica: a SEFAZ limita consultas (cerca de 1 por hora). O botão trava
          sozinho após cada busca para evitar o “consumo indevido”. A busca
          também roda sozinha, uma vez por hora.
        </p>

        <div className="mt-4 border-t border-borda pt-4">
          <p className="mb-1 text-xs font-medium text-texto-suave">Faltam notas? Reprocessar:</p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => reprocessar(15)}
              disabled={buscando || !status.temCert || travado}
              className="text-xs font-medium text-orange-600 underline hover:text-orange-700 disabled:opacity-60"
            >
              Últimos 15 dias (rápido)
            </button>
            <button
              onClick={() => reprocessar()}
              disabled={buscando || !status.temCert || travado}
              className="text-xs font-medium text-texto-suave underline hover:text-orange-600 disabled:opacity-60"
            >
              Desde o início (~90 dias)
            </button>
          </div>
          <p className="mt-1 text-xs text-texto-fraco">
            O de 15 dias começa do NSU de ~15 dias atrás (mais rápido). Na
            primeira vez pode cair para o completo, até o sistema guardar os NSU.
          </p>
        </div>
      </div>
    </div>
  );
}
