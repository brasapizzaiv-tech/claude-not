"use client";

// Aba Rodízio do app do garçom: mesa, sabor (busca), fração, quantidade,
// observação, enviar. Depois de enviar limpa o pedido mas MANTÉM a mesa — o
// mesmo garçom costuma lançar mais de um pedido da mesma mesa.
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { MESAS_MAX, FRACAO_ROTULO, STATUS_COR, normalizar, tempoEspera, type FracaoRodizio, type PedidoRodizio } from "@/lib/rodizio";
import { cancelarPedidoRodizio, lancarPedidoRodizio, pedidosDaMesa, type SaborRodizio } from "./rodizio-actions";

export function RodizioForm({ token, sabores }: { token: string; sabores: SaborRodizio[] }) {
  const [mesa, setMesa] = useState("");
  const [busca, setBusca] = useState("");
  const [sabor, setSabor] = useState<SaborRodizio | null>(null);
  const [fracao, setFracao] = useState<FracaoRodizio>("inteira");
  const [qtd, setQtd] = useState(1);
  const [obs, setObs] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [carregada, setCarregada] = useState<{ mesa: number; itens: PedidoRodizio[] }>({ mesa: 0, itens: [] });
  const [proc, start] = useTransition();
  const buscaRef = useRef<HTMLInputElement>(null);
  const [agora, setAgora] = useState(() => Date.now());

  const mesaNum = Math.round(Number(mesa));
  const mesaOk = mesaNum >= 1 && mesaNum <= MESAS_MAX;

  // Pedidos abertos da mesa: carrega ao escolher a mesa e atualiza a cada 5 s
  // enquanto a tela está aberta (o app não tem sessão do Supabase, então é por
  // consulta ao servidor, não por Realtime).
  useEffect(() => {
    if (!mesaOk) return;
    let vivo = true;
    const carregar = async () => {
      try { const l = await pedidosDaMesa(mesaNum); if (vivo) { setCarregada({ mesa: mesaNum, itens: l }); setAgora(Date.now()); } } catch { /* sem rede: mantém a lista */ }
    };
    const t0 = setTimeout(carregar, 0);
    const t = setInterval(carregar, 5000);
    return () => { vivo = false; clearTimeout(t0); clearInterval(t); };
  }, [mesaNum, mesaOk]);

  const lista = mesaOk && carregada.mesa === mesaNum ? carregada.itens : [];

  const q = normalizar(busca);
  const filtrados = useMemo(() => {
    const base = q ? sabores.filter((s) => normalizar(s.nome).includes(q)) : sabores;
    return { salgadas: base.filter((s) => s.tipo === "salgada").slice(0, 12), doces: base.filter((s) => s.tipo === "doce").slice(0, 8) };
  }, [sabores, q]);

  function enviar() {
    setMsg(null);
    if (!mesaOk) { setMsg(`Mesa de 1 a ${MESAS_MAX}.`); return; }
    if (!sabor) { setMsg("Escolha o sabor na lista."); return; }
    start(async () => {
      const r = await lancarPedidoRodizio(token, { mesa: mesaNum, saborId: sabor.id, fracao, quantidade: qtd, observacao: obs });
      if (!r.ok) { setMsg(r.mensagem); return; }
      setMsg(`✓ Mesa ${mesaNum}: ${sabor.nome} (${FRACAO_ROTULO[fracao]}) enviada pra cozinha.`);
      setSabor(null); setBusca(""); setFracao("inteira"); setQtd(1); setObs("");
      try { setCarregada({ mesa: mesaNum, itens: await pedidosDaMesa(mesaNum) }); } catch { /* ok */ }
      setTimeout(() => buscaRef.current?.focus(), 50);
    });
  }
  function cancelar(id: string) {
    if (!confirm("Cancelar este pedido?")) return;
    start(async () => {
      const r = await cancelarPedidoRodizio(token, id);
      if (!r.ok) setMsg(r.mensagem);
      try { setCarregada({ mesa: mesaNum, itens: await pedidosDaMesa(mesaNum) }); } catch { /* ok */ }
    });
  }

  const cx = "w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
  const btnFr = (f: FracaoRodizio) =>
    `rounded-xl py-3 text-base font-bold ${fracao === f ? "bg-orange-500 text-white" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"}`;

  return (
    <div className="space-y-3">
      {/* mesa */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Mesa</label>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          value={mesa}
          onChange={(e) => setMesa(e.target.value.replace(/\D/g, "").slice(0, 2))}
          placeholder={`1 a ${MESAS_MAX}`}
          className={`${cx} text-center text-3xl font-black tabular-nums`}
          autoFocus
        />
        {mesa && !mesaOk && <p className="mt-1 text-center text-xs text-red-600">Mesa de 1 a {MESAS_MAX}</p>}
      </div>

      {/* sabor */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Sabor</label>
        {sabor ? (
          <div className="flex items-center justify-between rounded-xl bg-orange-500 px-3 py-3 text-white">
            <span className="font-bold">{sabor.tipo === "doce" ? "🍫" : "🍕"} {sabor.nome}</span>
            <button type="button" onClick={() => { setSabor(null); setTimeout(() => buscaRef.current?.focus(), 30); }} className="text-sm underline">trocar</button>
          </div>
        ) : (
          <>
            <input
              ref={buscaRef}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Digite o sabor…"
              className={cx}
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase text-zinc-400">🍕 Salgadas</p>
                <div className="space-y-1">
                  {filtrados.salgadas.map((s) => (
                    <button key={s.id} type="button" onClick={() => setSabor(s)} className="block w-full rounded-lg bg-zinc-100 px-2 py-2 text-left text-sm font-medium text-zinc-800 active:bg-orange-100 dark:bg-zinc-800 dark:text-zinc-100">
                      {s.nome}
                    </button>
                  ))}
                  {filtrados.salgadas.length === 0 && <p className="text-xs text-zinc-400">nenhuma</p>}
                </div>
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase text-zinc-400">🍫 Doces</p>
                <div className="space-y-1">
                  {filtrados.doces.map((s) => (
                    <button key={s.id} type="button" onClick={() => setSabor(s)} className="block w-full rounded-lg bg-zinc-100 px-2 py-2 text-left text-sm font-medium text-zinc-800 active:bg-orange-100 dark:bg-zinc-800 dark:text-zinc-100">
                      {s.nome}
                    </button>
                  ))}
                  {filtrados.doces.length === 0 && <p className="text-xs text-zinc-400">nenhuma</p>}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* fração + quantidade + obs */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => setFracao("inteira")} className={btnFr("inteira")}>Inteira</button>
          <button type="button" onClick={() => setFracao("meia")} className={btnFr("meia")}>Meia</button>
          <button type="button" onClick={() => setFracao("quarto")} className={btnFr("quarto")}>1/4</button>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm text-zinc-500">Quantidade</span>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setQtd((n) => Math.max(1, n - 1))} className="h-11 w-11 rounded-xl bg-zinc-100 text-2xl font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">−</button>
            <span className="w-8 text-center text-2xl font-black tabular-nums text-zinc-900 dark:text-zinc-50">{qtd}</span>
            <button type="button" onClick={() => setQtd((n) => Math.min(20, n + 1))} className="h-11 w-11 rounded-xl bg-zinc-100 text-2xl font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">+</button>
          </div>
        </div>
        <input
          value={obs}
          onChange={(e) => setObs(e.target.value.slice(0, 120))}
          placeholder="Observação (ex.: sem cebola)"
          className={`${cx} mt-3`}
        />
      </div>

      <button
        type="button"
        onClick={enviar}
        disabled={proc || !mesaOk || !sabor}
        className="w-full rounded-2xl bg-emerald-600 py-4 text-lg font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
      >
        {proc ? "Enviando…" : "Enviar para a cozinha"}
      </button>
      {msg && <p className={`text-center text-sm ${msg.startsWith("✓") ? "text-emerald-600" : "text-red-600"}`}>{msg}</p>}

      {/* pedidos abertos da mesa */}
      {mesaOk && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Mesa {mesaNum} · na cozinha</p>
          {lista.length === 0 ? (
            <p className="text-sm text-zinc-400">Nenhum pedido aberto.</p>
          ) : (
            <ul className="space-y-1.5">
              {lista.map((p) => {
                const cor = STATUS_COR[p.status];
                return (
                  <li key={p.id} className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm" style={{ background: `${cor.borda}22` }}>
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-black" style={{ background: cor.borda, color: "#fff" }}>{cor.rotulo}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-zinc-800 dark:text-zinc-100">
                      {p.quantidade > 1 ? `${p.quantidade}× ` : ""}{p.sabor} <span className="text-zinc-500">· {FRACAO_ROTULO[p.fracao]}</span>
                    </span>
                    <span className="text-xs text-zinc-500">{tempoEspera(p.criado_em, agora)}</span>
                    {p.status === "pendente" && (
                      <button type="button" onClick={() => cancelar(p.id)} className="text-xs text-zinc-400 hover:text-red-600">✕</button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
