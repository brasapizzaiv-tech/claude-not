"use client";

// Tabela do consumo + gráfico de barras por semana. Uma série só (o produto),
// na cor da marca; o valor aparece ao passar o dedo/mouse na barra.
import { Fragment, useMemo, useState } from "react";

export type LinhaConsumo = {
  id: string;
  nome: string;
  unidade: string;
  categoria: string;
  media: number | null; // por semana (últimas 8)
  semanas: (number | null)[]; // últimas 12, da mais antiga pra mais nova
  estoque: number; // na última contagem
  contadoEm: string;
  erradas: number;
};

const num = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString("pt-BR");
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Mini gráfico da linha da tabela (12 barras).
function Mini({ valores }: { valores: (number | null)[] }) {
  const max = Math.max(1, ...valores.map((v) => v ?? 0));
  const W = 96, H = 28, gap = 2, bw = (W - gap * (valores.length - 1)) / valores.length;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="block">
      <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--borda)" strokeWidth={1} />
      {valores.map((v, i) =>
        v == null ? null : (
          <rect key={i} x={i * (bw + gap)} y={H - Math.max(2, (v / max) * (H - 2))} width={bw} height={Math.max(2, (v / max) * (H - 2))} rx={1.5} fill="var(--marca-primaria)" />
        ),
      )}
    </svg>
  );
}

// Gráfico maior, com eixo das semanas e o valor ao passar por cima.
function Grafico({ linha, semanas }: { linha: LinhaConsumo; semanas: string[] }) {
  const [foco, setFoco] = useState<number | null>(null);
  const max = Math.max(1, ...linha.semanas.map((v) => v ?? 0), linha.media ?? 0);
  const W = 640, H = 180, base = H - 24, topo = 16, gap = 6;
  const bw = (W - gap * (semanas.length - 1)) / semanas.length;
  const y = (v: number) => base - (v / max) * (base - topo);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Consumo semanal de ${linha.nome}`}>
        <line x1={0} x2={W} y1={base + 0.5} y2={base + 0.5} stroke="var(--borda-forte)" strokeWidth={1} />
        {linha.media != null && (
          <g>
            <line x1={0} x2={W} y1={y(linha.media)} y2={y(linha.media)} stroke="var(--texto-suave)" strokeWidth={1} strokeDasharray="4 4" />
            <text x={W - 4} y={y(linha.media) - 4} textAnchor="end" fontSize={11} fill="var(--texto-suave)">média {num(linha.media)}</text>
          </g>
        )}
        {linha.semanas.map((v, i) => (
          <g key={i} onMouseEnter={() => setFoco(i)} onMouseLeave={() => setFoco(null)} onClick={() => setFoco(foco === i ? null : i)}>
            {/* área de toque maior que a barra */}
            <rect x={i * (bw + gap) - gap / 2} y={0} width={bw + gap} height={H} fill="transparent" />
            {v != null && (
              <rect x={i * (bw + gap)} y={y(v)} width={bw} height={Math.max(2, base - y(v))} rx={4} fill="var(--marca-primaria)" opacity={foco == null || foco === i ? 1 : 0.45} />
            )}
            {(i % 2 === 1 || semanas.length <= 8) && (
              <text x={i * (bw + gap) + bw / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--texto-fraco)">{dm(semanas[i])}</text>
            )}
          </g>
        ))}
      </svg>
      {foco != null && (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-controle bg-texto px-3 py-1.5 text-xs text-fundo shadow-cartao">
          Semana de {dm(semanas[foco])}:{" "}
          <b>{linha.semanas[foco] == null ? "sem contagem" : `${num(linha.semanas[foco]!)} ${linha.unidade}`}</b>
        </div>
      )}
    </div>
  );
}

export function ConsumoTabela({ linhas, semanas }: { linhas: LinhaConsumo[]; semanas: string[] }) {
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const categorias = useMemo(() => [...new Set(linhas.map((l) => l.categoria))].sort(), [linhas]);
  const q = semAcento(busca.trim());
  const visiveis = linhas.filter((l) => (!cat || l.categoria === cat) && (!q || semAcento(l.nome).includes(q)));

  return (
    <div className="mt-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto…"
            aria-label="Buscar produto"
            className="min-h-11 w-full rounded-controle border border-borda-forte bg-painel-cartao py-2 pl-3 pr-11 text-sm text-texto"
          />
          {busca && (
            <button type="button" onClick={() => setBusca("")} aria-label="Limpar a busca" className="absolute right-0 top-0 flex h-full w-11 items-center justify-center text-texto-fraco">✕</button>
          )}
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoria" className="min-h-11 rounded-controle border border-borda-forte bg-painel-cartao px-3 text-sm text-texto">
          <option value="">Todas as categorias</option>
          {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-sm text-texto-suave">{visiveis.length} produtos</span>
      </div>

      <div className="overflow-x-auto rounded-cartao bg-painel-cartao">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="rotulo text-left">
            <tr>
              <th className="px-4 py-3">Produto</th>
              <th className="px-4 py-3 text-right">Gasta por semana</th>
              <th className="px-4 py-3 text-right">Tinha na última contagem</th>
              <th className="px-4 py-3 text-right">Dá pra</th>
              <th className="px-4 py-3">Últimas {semanas.length} semanas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {visiveis.map((l) => {
              const dura = l.media && l.media > 0 ? l.estoque / l.media : null;
              const curto = dura != null && dura < 1;
              return (
                <Fragment key={l.id}>
                  <tr
                    onClick={() => setAberto(aberto === l.id ? null : l.id)}
                    className={`cursor-pointer hover:bg-superficie-suave ${aberto === l.id ? "bg-destaque" : ""}`}
                    aria-expanded={aberto === l.id}
                  >
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-texto">{l.nome}</span>
                      <span className="block text-xs text-texto-fraco">{l.categoria}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-numero font-bold text-texto">
                      {l.media == null ? <span className="font-sans font-normal text-texto-fraco">—</span> : `${num(l.media)} ${l.unidade}`}
                    </td>
                    <td className="px-4 py-2.5 text-right font-numero text-texto">
                      {num(l.estoque)} {l.unidade}
                      <span className="block font-sans text-xs text-texto-fraco">em {dm(l.contadoEm)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {dura == null ? <span className="text-texto-fraco">—</span> : (
                        <span className={curto ? "pilula pilula-urgente" : "text-texto"}>
                          {dura >= 10 ? "10+ semanas" : dura < 1 ? `~${Math.max(1, Math.round(dura * 7))} dias` : `~${num(dura)} sem.`}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5"><Mini valores={l.semanas} /></td>
                  </tr>
                  {aberto === l.id && (
                    <tr>
                      <td colSpan={5} className="bg-superficie-suave px-4 py-4">
                        <p className="mb-2 text-sm font-semibold text-texto">{l.nome} — consumo por semana ({l.unidade})</p>
                        <Grafico linha={l} semanas={semanas} />
                        {l.erradas > 0 && (
                          <p className="mt-2 text-xs text-texto-suave">{l.erradas} contagem(ns) deram consumo negativo e ficaram fora da conta (provável erro de contagem).</p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
