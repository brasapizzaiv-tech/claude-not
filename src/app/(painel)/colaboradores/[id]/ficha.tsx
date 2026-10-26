"use client";

// Abas da ficha do funcionário (migration 0257).
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BotaoAcao, Enviar } from "@/components/enviar";
import { avisar, confirmar } from "@/components/dialogo";
import { TIPOS_DOCUMENTO, type CampoFicha } from "@/lib/ficha-core";
import { definirHorarioPessoa } from "../ponto/horarios/actions";
import { apagarCargoHistorico, apagarDocumento, buscarCep, enviarDocumento, linkDocumento, salvarDemissao, salvarFicha, trocarCargo } from "./actions";
import { desligarColaborador } from "../actions";

export type Opcao = { id: string; nome: string };
export type Documento = { id: string; nome: string; tipo: string | null; validade: string | null; pedir_assinatura: boolean; assinado_em: string | null; criado_em: string; dias: number | null };

const CAMPO = "min-h-11 w-full rounded-controle border border-borda-forte bg-painel-cartao px-3 text-sm text-texto";
const dmy = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function Rotulo({ texto, dica, children }: { texto: string; dica?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold text-texto">{texto}</span>
      {children}
      {dica && <span className="mt-1 block text-xs text-texto-suave">{dica}</span>}
    </label>
  );
}

/** Uma aba de campos (Informações gerais ou Dados pessoais), com um Salvar só. */
export function AbaCampos({ id, campos, valores, listas = [], extra, cep }: {
  id: string;
  campos: CampoFicha[];
  valores: Record<string, string>;
  listas?: { k: string; rotulo: string; valor: string; opcoes: Opcao[]; novo?: string }[];
  extra?: ReactNode;
  cep?: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>(() => ({ ...valores, ...Object.fromEntries(listas.map((l) => [l.k, l.valor])) }));
  const muda = (k: string, x: string) => setV((o) => ({ ...o, [k]: x }));
  async function salvar() {
    const r = await salvarFicha(id, v);
    if (!r.ok) { void avisar(r.erro); return; }
    void avisar("Ficha salva.");
    router.refresh();
  }
  async function porCep() {
    const r = await buscarCep(v.cep ?? "");
    if (!r.ok) { void avisar(r.erro); return; }
    setV((o) => ({ ...o, endereco: r.endereco || o.endereco, bairro: r.bairro || o.bairro, cidade: r.cidade || o.cidade, uf: r.uf || o.uf }));
  }
  return (
    <section className="cartao p-4">
      {extra && <div className="mb-4">{extra}</div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {listas.map((l) => (
          <Rotulo key={l.k} texto={l.rotulo}>
            <select value={v[l.k] ?? ""} onChange={(e) => muda(l.k, e.target.value)} className={CAMPO}>
              <option value="">—</option>
              {l.opcoes.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
            {l.novo && <Link href={l.novo} className="mt-1 inline-block text-xs font-semibold text-texto-marca hover:underline">editar a lista</Link>}
          </Rotulo>
        ))}
        {campos.map((c) => (
          <div key={c.k} className={c.largura === "toda" || c.tipo === "longo" ? "sm:col-span-2 lg:col-span-3" : ""}>
            <Rotulo texto={c.rotulo} dica={c.dica}>
              {c.tipo === "opcoes" ? (
                <select value={v[c.k] ?? ""} onChange={(e) => muda(c.k, e.target.value)} className={CAMPO}>
                  <option value="">—</option>
                  {c.opcoes?.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : c.tipo === "longo" ? (
                <textarea value={v[c.k] ?? ""} onChange={(e) => muda(c.k, e.target.value)} rows={3} className={`${CAMPO} py-2`} />
              ) : (
                <span className="flex gap-2">
                  <input type={c.tipo === "data" ? "date" : "text"} inputMode={c.numeros ? "numeric" : undefined} value={v[c.k] ?? ""} onChange={(e) => muda(c.k, e.target.value)} className={CAMPO} />
                  {cep && c.k === "cep" && <BotaoAcao aoClicar={porCep} className="btn-secundario shrink-0 !min-h-11 text-sm">Buscar</BotaoAcao>}
                </span>
              )}
            </Rotulo>
          </div>
        ))}
      </div>
      <BotaoAcao aoClicar={salvar} className="btn-principal mt-5">Salvar</BotaoAcao>
    </section>
  );
}

/** Histórico de horários + troca a partir de uma data. */
export function HorarioAba({ id, hoje, historico, horarios }: { id: string; hoje: string; historico: { id: string; nome: string; de: string; ate: string | null }[]; horarios: Opcao[] }) {
  const router = useRouter();
  const [hor, setHor] = useState("");
  const [de, setDe] = useState(hoje);
  async function trocar() {
    if (!hor) { void avisar("Escolha o horário."); return; }
    const r = await definirHorarioPessoa(id, hor, de);
    if (!r.ok) { void avisar(r.erro); return; }
    setHor("");
    router.refresh();
  }
  return (
    <section className="cartao p-4">
      <p className="rotulo mb-2">Histórico de horários</p>
      <table className="w-full text-sm">
        <thead className="rotulo text-left"><tr><th className="py-2">De</th><th>Até</th><th>Horário</th></tr></thead>
        <tbody className="divide-y divide-borda">
          {historico.map((h) => <tr key={h.id}><td className="py-2">{dmy(h.de)}</td><td>{h.ate ? dmy(h.ate) : "em diante"}</td><td className="font-semibold text-texto">{h.nome}</td></tr>)}
          {historico.length === 0 && <tr><td colSpan={3} className="py-3 text-texto-suave">Nenhum ainda.</td></tr>}
        </tbody>
      </table>
      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-borda pt-4">
        <div className="min-w-[220px]"><Rotulo texto="Trocar pro horário">
          <select value={hor} onChange={(e) => setHor(e.target.value)} className={CAMPO}>
            <option value="">Escolha…</option>
            {horarios.map((h) => <option key={h.id} value={h.id}>{h.nome}</option>)}
          </select>
        </Rotulo></div>
        <Rotulo texto="A partir de"><input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={`${CAMPO} max-w-44`} /></Rotulo>
        <BotaoAcao aoClicar={trocar} className="btn-principal">Trocar</BotaoAcao>
      </div>
      <p className="mt-2 text-xs text-texto-suave">O horário anterior vale até o dia antes. Os dias antes dessa data não mudam.</p>
    </section>
  );
}

/** Histórico de cargos + troca a partir de uma data. */
export function CargosAba({ id, hoje, historico, cargos, admissao }: { id: string; hoje: string; historico: { id: string; nome: string; de: string; ate: string | null }[]; cargos: Opcao[]; admissao: string | null }) {
  const router = useRouter();
  const [cargo, setCargo] = useState("");
  const [de, setDe] = useState(historico.length ? hoje : admissao ?? hoje);
  async function trocar() {
    if (!cargo) { void avisar("Escolha o cargo."); return; }
    const r = await trocarCargo(id, cargo, de);
    if (!r.ok) { void avisar(r.erro); return; }
    setCargo("");
    router.refresh();
  }
  async function apagar(linha: string) {
    if (!(await confirmar("Tirar essa linha do histórico de cargos?", { perigo: true, okTexto: "Tirar" }))) return;
    await apagarCargoHistorico(id, linha);
    router.refresh();
  }
  return (
    <section className="cartao p-4">
      <p className="rotulo mb-2">Histórico de cargos</p>
      <table className="w-full text-sm">
        <thead className="rotulo text-left"><tr><th className="py-2">De</th><th>Até</th><th>Cargo</th><th></th></tr></thead>
        <tbody className="divide-y divide-borda">
          {historico.map((h) => (
            <tr key={h.id}><td className="py-2">{dmy(h.de)}</td><td>{h.ate ? dmy(h.ate) : "em diante"}</td><td className="font-semibold text-texto">{h.nome}</td>
              <td className="text-right"><BotaoAcao aoClicar={() => apagar(h.id)} className="min-h-11 px-2 text-xs text-texto-fraco hover:text-urgente-texto">tirar</BotaoAcao></td></tr>
          ))}
          {historico.length === 0 && <tr><td colSpan={4} className="py-3 text-texto-suave">Nenhum cargo ainda.</td></tr>}
        </tbody>
      </table>
      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-borda pt-4">
        <div className="min-w-[220px]"><Rotulo texto={historico.length ? "Novo cargo" : "Cargo"}>
          <select value={cargo} onChange={(e) => setCargo(e.target.value)} className={CAMPO}>
            <option value="">Escolha…</option>
            {cargos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Rotulo></div>
        <Rotulo texto="A partir de"><input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={`${CAMPO} max-w-44`} /></Rotulo>
        <BotaoAcao aoClicar={trocar} className="btn-principal">{historico.length ? "Trocar" : "Salvar"}</BotaoAcao>
      </div>
      <p className="mt-2 text-xs text-texto-suave">Falta algum cargo? <Link href="/colaboradores/cadastros" className="font-semibold text-texto-marca hover:underline">Editar a lista de cargos</Link>.</p>
    </section>
  );
}

/** Demissão: desligar (ativo) ou ajustar data e motivo (já desligado). */
export function DemissaoAba({ id, ativo, data, motivoId, obs, motivos }: { id: string; ativo: boolean; data: string; motivoId: string; obs: string; motivos: Opcao[] }) {
  const router = useRouter();
  const [d, setD] = useState(data);
  const [m, setM] = useState(motivoId);
  const [o, setO] = useState(obs);
  async function salvar() {
    if (ativo) {
      if (!m && o.trim().length < 3) { void avisar("Escolha o motivo ou escreva o que aconteceu."); return; }
      if (!(await confirmar("Desligar essa pessoa?", { detalhe: "Ela sai das listas e perde o acesso ao app na hora. O histórico fica guardado e dá pra reativar depois.", perigo: true, okTexto: "Desligar" }))) return;
      const nomeMotivo = motivos.find((x) => x.id === m)?.nome ?? "";
      const r = await desligarColaborador(id, [nomeMotivo, o.trim()].filter(Boolean).join(" — "), d, m || undefined);
      if (!r.ok) { void avisar(r.mensagem); return; }
    } else {
      const r = await salvarDemissao(id, d, m, o);
      if (!r.ok) { void avisar(r.erro); return; }
      void avisar("Demissão salva.");
    }
    router.refresh();
  }
  return (
    <section className="cartao grid max-w-2xl gap-4 p-4">
      {ativo && <p className="text-sm text-texto-suave">A pessoa está ativa. Preencha pra desligar.</p>}
      <Rotulo texto="Data da demissão (último dia trabalhado)" dica="Depois dela o ponto não conta falta.">
        <input type="date" value={d} onChange={(e) => setD(e.target.value)} className={`${CAMPO} max-w-48`} />
      </Rotulo>
      <Rotulo texto="Motivo da demissão">
        <select value={m} onChange={(e) => setM(e.target.value)} className={CAMPO}>
          <option value="">—</option>
          {motivos.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
        </select>
        <Link href="/colaboradores/cadastros" className="mt-1 inline-block text-xs font-semibold text-texto-marca hover:underline">editar a lista</Link>
      </Rotulo>
      <Rotulo texto="Observação">
        <textarea value={o} onChange={(e) => setO(e.target.value)} rows={3} className={`${CAMPO} py-2`} />
      </Rotulo>
      <div><BotaoAcao aoClicar={salvar} className={ativo ? "btn-secundario text-urgente-texto" : "btn-principal"}>{ativo ? "Desligar" : "Salvar"}</BotaoAcao></div>
    </section>
  );
}

/** Documentos: subir, ver validade e assinatura, abrir e apagar. */
export function DocumentosAba({ id, docs, temApp }: { id: string; docs: Documento[]; temApp: boolean }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  async function abrir(docId: string) {
    const url = await linkDocumento(docId);
    if (url) window.open(url, "_blank", "noopener");
    else void avisar("Não consegui abrir o arquivo.");
  }
  async function apagar(d: Documento) {
    if (!(await confirmar(`Apagar “${d.nome}”?`, { perigo: true, okTexto: "Apagar" }))) return;
    const r = await apagarDocumento(d.id);
    if (!r.ok) { void avisar(r.erro); return; }
    router.refresh();
  }
  return (
    <section className="grid gap-4">
      <div>
        {!aberto ? (
          <button type="button" onClick={() => setAberto(true)} className="btn-principal">+ Adicionar documento</button>
        ) : (
          <form
            action={async (fd) => {
              const r = await enviarDocumento(fd);
              if (!r.ok) { void avisar(r.erro); return; }
              setAberto(false);
              router.refresh();
            }}
            className="cartao grid gap-4 p-4 sm:grid-cols-2"
          >
            <input type="hidden" name="colaborador_id" value={id} />
            <Rotulo texto="Nome"><input name="nome" placeholder="Ex.: Contrato de experiência" className={CAMPO} /></Rotulo>
            <Rotulo texto="Tipo">
              <select name="tipo" className={CAMPO}><option value="">—</option>{TIPOS_DOCUMENTO.map((t) => <option key={t}>{t}</option>)}</select>
            </Rotulo>
            <Rotulo texto="Validade" dica="Vazio = não vence."><input type="date" name="validade" className={CAMPO} /></Rotulo>
            <Rotulo texto="Arquivo (foto ou PDF, até 10 MB)"><input type="file" name="arquivo" accept="image/*,application/pdf" required className="block min-h-11 w-full text-sm text-texto" /></Rotulo>
            <label className="flex min-h-11 items-center gap-2 text-sm text-texto sm:col-span-2">
              <input type="checkbox" name="pedir_assinatura" disabled={!temApp} className="h-5 w-5" /> Pedir pra pessoa assinar no app da equipe
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <Enviar className="btn-principal">Salvar documento</Enviar>
              <button type="button" onClick={() => setAberto(false)} className="btn-secundario">Cancelar</button>
            </div>
          </form>
        )}
      </div>
      <div className="cartao overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="rotulo text-left"><tr><th className="px-4 py-3">Nome</th><th className="px-2 py-3">Tipo</th><th className="px-2 py-3">Assinatura</th><th className="px-2 py-3">Validade</th><th className="px-4 py-3"></th></tr></thead>
          <tbody className="divide-y divide-borda">
            {docs.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-2.5"><span className="font-semibold text-texto">{d.nome}</span><span className="block text-xs text-texto-suave">enviado em {quando(d.criado_em)}</span></td>
                <td className="px-2 py-2.5 text-texto-suave">{d.tipo ?? "—"}</td>
                <td className="px-2 py-2.5">
                  {d.assinado_em ? <span className="pilula pilula-ok">assinado {quando(d.assinado_em)}</span>
                    : d.pedir_assinatura ? <span className="pilula">aguardando no app</span>
                    : <span className="text-texto-fraco">não pedida</span>}
                </td>
                <td className="px-2 py-2.5">
                  {d.validade ? (
                    <>
                      {dmy(d.validade)}{" "}
                      {d.dias != null && d.dias < 0 && <span className="pilula pilula-urgente">vencido</span>}
                      {d.dias != null && d.dias >= 0 && d.dias <= 30 && <span className="pilula pilula-urgente">vence em {d.dias} dia{d.dias === 1 ? "" : "s"}</span>}
                    </>
                  ) : <span className="text-texto-fraco">—</span>}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <BotaoAcao aoClicar={() => abrir(d.id)} className="min-h-11 px-2 text-sm font-semibold text-texto-marca hover:underline">abrir</BotaoAcao>
                  {!d.assinado_em && <BotaoAcao aoClicar={() => apagar(d)} className="min-h-11 px-2 text-sm text-texto-fraco hover:text-urgente-texto">apagar</BotaoAcao>}
                </td>
              </tr>
            ))}
            {docs.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-texto-suave">Nenhum documento. Use “Adicionar documento”.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
