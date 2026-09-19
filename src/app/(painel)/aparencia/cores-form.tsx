"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icone } from "@/components/icone";
import { salvarCoresEmpresa } from "./actions";

// Escolha das cores da empresa, com prévia ao vivo.
//
// A prévia não é uma imagem: é um pedaço de tela de verdade, dentro de uma
// caixa que redefine as variáveis da marca. Enquanto você mexe no seletor, ela
// já mostra como o botão, o cartão de foco e o mapa do salão vão ficar — com a
// escala inteira derivada da cor, igual ao sistema faz.

/** A letra por cima da cor. MESMA conta do servidor (src/lib/marca.ts): fica
 *  branca enquanto der 3:1 de contraste, e só vira escura quando não der. */
function sobre(cor: string): string {
  const n = parseInt(cor.slice(1), 16);
  const canais = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const brilho = 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
  return 1.05 / (brilho + 0.05) >= 3 ? "#ffffff" : "#18181b";
}

function Campo({
  rotulo, ajuda, valor, onChange,
}: {
  rotulo: string; ajuda: string; valor: string; onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="color"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-14 shrink-0 cursor-pointer rounded-controle border border-borda-forte bg-transparent"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-texto">{rotulo}</span>
        <span className="block text-xs text-texto-fraco">{ajuda}</span>
        <span className="mt-0.5 block font-numero text-xs text-texto-suave">{valor}</span>
      </span>
    </label>
  );
}

export function CoresForm({
  inicial,
}: {
  inicial: { primaria: string; escuro: string; sobreEscuro: string };
}) {
  const router = useRouter();
  const [primaria, setPrimaria] = useState(inicial.primaria);
  const [escuro, setEscuro] = useState(inicial.escuro);
  const [sobreEscuro, setSobreEscuro] = useState(inicial.sobreEscuro);
  const [salvando, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const mudou =
    primaria !== inicial.primaria || escuro !== inicial.escuro || sobreEscuro !== inicial.sobreEscuro;

  // Quanto de branco (tons claros) ou de preto (escuros) entra em cada degrau.
  // É a MESMA receita do globals.css, repetida aqui porque o CSS calcula a
  // escala lá na raiz da página: mudar a cor só nesta caixa não recalcularia
  // os degraus, e a prévia mostraria a escala antiga.
  const DEGRAUS: [number, number, "white" | "black"][] = [
    [50, 10, "white"], [100, 22, "white"], [200, 44, "white"], [300, 64, "white"],
    [400, 82, "white"], [500, 100, "white"],
    [600, 88, "black"], [700, 72, "black"], [800, 54, "black"], [900, 38, "black"], [950, 21, "black"],
  ];
  const escala = Object.fromEntries(
    DEGRAUS.map(([g, pct, com]) => [
      `--color-orange-${g}`,
      pct === 100 ? primaria : `color-mix(in srgb, ${primaria} ${pct}%, ${com})`,
    ]),
  );

  const previa = {
    "--marca-primaria": primaria,
    "--marca-escuro": escuro,
    "--marca-sobre-escuro": sobreEscuro,
    "--marca-sobre-primaria": sobre(primaria),
    ...escala,
  } as React.CSSProperties;

  function salvar() {
    setMsg(null);
    start(async () => {
      const fd = new FormData();
      fd.set("cor_primaria", primaria);
      fd.set("cor_escuro", escuro);
      fd.set("cor_sobre_escuro", sobreEscuro);
      const r = await salvarCoresEmpresa(fd);
      if (!r.ok) { setMsg(r.mensagem); return; }
      setMsg("Cores salvas. O sistema inteiro já está com elas.");
      router.refresh();
    });
  }

  function desfazer() {
    setPrimaria(inicial.primaria);
    setEscuro(inicial.escuro);
    setSobreEscuro(inicial.sobreEscuro);
    setMsg(null);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ---------- Escolha ---------- */}
      <div className="rounded-cartao bg-painel-cartao p-4">
        <p className="mb-3 text-sm font-semibold text-texto">As cores da casa</p>
        <div className="flex flex-col gap-4">
          <Campo
            rotulo="Cor principal"
            ajuda="A cor da marca. Botão principal, mesa ocupada, item ativo do menu."
            valor={primaria}
            onChange={setPrimaria}
          />
          <Campo
            rotulo="Escuro da marca"
            ajuda="Fundo escuro do cardápio, do cupom e do tema escuro."
            valor={escuro}
            onChange={setEscuro}
          />
          <Campo
            rotulo="Texto sobre o escuro"
            ajuda="A letra que aparece por cima do fundo escuro."
            valor={sobreEscuro}
            onChange={setSobreEscuro}
          />
        </div>

        <p className="mt-4 rounded-controle bg-superficie-suave p-3 text-xs text-texto-suave">
          Só estas três. Os tons mais claros e mais escuros são calculados
          sozinhos a partir delas. Se você escolher uma cor clara demais, a
          letra por cima do botão vira escura sozinha pra continuar legível.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={salvar}
            disabled={!mudou || salvando}
            className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90 disabled:opacity-40"
          >
            {salvando ? "Salvando..." : "Salvar cores"}
          </button>
          {mudou && (
            <button
              onClick={desfazer}
              className="min-h-11 rounded-controle border border-borda-forte px-4 text-sm font-medium text-texto-suave transition hover:bg-superficie-suave"
            >
              Desfazer
            </button>
          )}
          {msg && <span className="text-sm text-texto-suave">{msg}</span>}
        </div>
      </div>

      {/* ---------- Prévia ---------- */}
      <div className="rounded-cartao bg-painel-cartao p-4" style={previa}>
        <p className="mb-3 text-sm font-semibold text-texto">Como vai ficar</p>

        <div className="flex flex-col gap-3">
          {/* botão principal */}
          <button
            type="button"
            className="min-h-11 rounded-controle px-4 text-sm font-semibold"
            style={{ background: "var(--marca-primaria)", color: "var(--marca-sobre-primaria)" }}
          >
            Botão principal
          </button>

          {/* cartão de foco */}
          <div
            className="rounded-cartao p-4"
            style={{ background: "var(--marca-escuro)", color: "var(--marca-sobre-escuro)" }}
          >
            <p className="text-xs opacity-70">Caixa do dia</p>
            <p className="mt-1 font-numero text-2xl font-semibold tracking-apertada">R$ 4.318,50</p>
          </div>

          {/* mapa do salão */}
          <div>
            <p className="mb-1.5 text-xs text-texto-fraco">Mapa do salão</p>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => {
                const ocupada = [2, 5, 6].includes(n);
                const conta = n === 4;
                return (
                  <span
                    key={n}
                    className="flex h-10 w-10 items-center justify-center rounded-controle font-numero text-sm"
                    style={
                      ocupada
                        ? { background: "var(--marca-primaria)", color: "var(--marca-sobre-primaria)" }
                        : conta
                          ? { border: "2px solid var(--marca-primaria)", color: "var(--marca-primaria)", fontWeight: 600 }
                          : undefined
                    }
                  >
                    <span className={!ocupada && !conta ? "text-texto-fraco" : ""}>{n}</span>
                  </span>
                );
              })}
            </div>
          </div>

          {/* a escala derivada */}
          <div>
            <p className="mb-1.5 text-xs text-texto-fraco">Os tons calculados a partir dela</p>
            <div className="flex overflow-hidden rounded-controle">
              {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((g) => (
                <span
                  key={g}
                  title={String(g)}
                  className="h-8 flex-1"
                  style={{ background: `var(--color-orange-${g})` }}
                />
              ))}
            </div>
          </div>

          <p className="flex items-start gap-1.5 text-xs text-texto-fraco">
            <Icone nome="aviso" tamanho={13} className="mt-0.5" />
            A prévia usa a mesma conta do sistema. O que você vê aqui é o que
            vai aparecer em todas as telas.
          </p>
        </div>
      </div>
    </div>
  );
}
