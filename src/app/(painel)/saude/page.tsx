import { createClient } from "@/lib/supabase/server";
import { empresaAtualId } from "@/lib/empresa";
import { lerSaude, type Estado, type ItemSaude } from "@/lib/saude-painel";
import { Icone } from "@/components/icone";
import { FilaProblemas } from "./fila-problemas";

export const metadata = { title: "Saúde do sistema" };
export const dynamic = "force-dynamic";

// Saúde do sistema (auditoria, Onda 2): o último sinal de cada peça de fora —
// agentes nos PCs, balança, pinpads, relógio de ponto, SEFAZ, rotinas
// automáticas e WhatsApp. Antes, quando uma delas parava, ninguém ficava sabendo.
const ESTADO: Record<Estado, { texto: string; classe: string }> = {
  parado: { texto: "Parado", classe: "pilula pilula-urgente" },
  atencao: { texto: "Atenção", classe: "pilula" },
  ok: { texto: "Funcionando", classe: "pilula pilula-ok" },
  neutro: { texto: "Sem sinal agora", classe: "pilula pilula-neutra" },
};
const ORDEM: Record<Estado, number> = { parado: 0, atencao: 1, neutro: 2, ok: 3 };

function quando(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Linha({ i }: { i: ItemSaude }) {
  const e = ESTADO[i.estado];
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-texto">{i.nome}</p>
          <p className="text-sm text-texto-suave">{i.resumo}</p>
          {i.detalhe ? <p className="mt-0.5 text-xs text-texto-fraco">{i.detalhe}</p> : null}
          {i.linhas && i.linhas.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {i.linhas.map((l, k) => (
                <li key={k} className="rounded-controle bg-superficie-suave px-3 py-2 text-sm">
                  <span className="text-texto">{l.texto}</span>
                  {l.sub ? <span className="block text-xs text-texto-suave">{l.sub}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="text-right">
          <span className={e.classe}>{e.texto}</span>
          {(i.versao || i.quando) && (
            <p className="mt-1 text-xs text-texto-fraco">
              {i.versao ? `versão ${i.versao}` : ""}
              {i.versao && i.quando ? " · " : ""}
              {quando(i.quando) ?? ""}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

export default async function SaudePage() {
  const empresaId = await empresaAtualId();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: prof } = user
    ? await supabase.from("profiles").select("papel, permissoes").eq("id", user.id).maybeSingle()
    : { data: null };
  const dono = (prof as { papel?: string } | null)?.papel === "dono";
  const perms = ((prof as { permissoes?: string[] | null } | null)?.permissoes) ?? [];
  if (!dono && !perms.includes("impressao") && !perms.includes("salao")) {
    return <div className="p-8 text-texto-suave">A Saúde do sistema é de quem cuida do salão ou das impressoras.</div>;
  }

  if (!empresaId) return <div className="p-8 text-texto-suave">Empresa não identificada.</div>;
  const s = await lerSaude(empresaId, { comErros: dono });
  const itens = [...s.itens].sort((a, b) => ORDEM[a.estado] - ORDEM[b.estado]);
  const problemas = itens.filter((i) => i.estado === "parado" || i.estado === "atencao");
  const resto = itens.filter((i) => i.estado !== "parado" && i.estado !== "atencao");

  return (
    <div className="pagina space-y-6">
      <header>
        <h1 className="titulo-pagina">Saúde do sistema</h1>
        <p className="mt-1 max-w-2xl text-sm text-texto-suave">
          O último sinal de cada peça que roda fora daqui: os programas dos PCs do restaurante, a balança, os pinpads,
          o relógio de ponto, a SEFAZ, as rotinas automáticas e o WhatsApp. Atualizado em {quando(s.agora)}.
        </p>
      </header>

      <section className={problemas.length ? "cartao-foco p-5" : "cartao p-5"}>
        {problemas.length ? (
          <>
            <p className="rotulo text-painel-foco-rotulo">Precisa de atenção</p>
            <p className="mt-1 numero-grande text-4xl">{problemas.length}</p>
            <ul className="mt-3 space-y-1 text-sm">
              {problemas.map((p) => (
                <li key={p.chave} className="flex gap-2">
                  <Icone nome="alerta" tamanho={16} className="mt-0.5 shrink-0" />
                  {p.resumo}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="flex items-center gap-2 font-semibold text-texto">
            <Icone nome="certo" tamanho={20} /> Tudo funcionando.
          </p>
        )}
      </section>

      <FilaProblemas lista={s.fila} />

      <section className="cartao p-5">
        <h2 className="font-numero text-lg font-bold text-texto">Peças</h2>
        <ul className="mt-2 divide-y divide-borda">
          {problemas.concat(resto).map((i) => <Linha key={i.chave} i={i} />)}
        </ul>
      </section>

      {dono && (
        <section className="cartao p-5">
          <h2 className="font-numero text-lg font-bold text-texto">Erros do servidor (últimas 24 h)</h2>
          <p className="mt-1 text-sm text-texto-suave">
            O que o sistema engoliu pra não travar a tela (a nota que não entrou na fila, o aviso que não saiu). Só o
            dono vê.
          </p>
          {s.erros.length === 0 ? (
            <p className="mt-3 text-sm text-texto-fraco">Nenhum.</p>
          ) : (
            <ul className="mt-3 divide-y divide-borda">
              {s.erros.map((e, k) => (
                <li key={k} className="py-2 text-sm">
                  <span className="font-semibold text-texto">{e.onde}</span>
                  <span className="text-texto-fraco"> · {quando(e.criado_em)}</span>
                  <span className="block break-words text-texto-suave">{e.mensagem}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
