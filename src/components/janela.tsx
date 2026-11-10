"use client";

// A janela do sistema (auditoria ACE-03 / VIS-14 / TEL-003, Onda 6).
//
// Antes havia ~40 janelas feitas à mão, cada uma de um jeito: nenhuma fechava
// com Esc, o Tab saía pra página de trás, e a janela alta (a do fornecedor,
// ~1.040 px) ficava cortada no notebook — o Salvar sumia e nada rolava.
//
// Esta é o fundo escuro + o lugar da janela. O conteúdo (o cartão branco)
// continua sendo o de cada tela. Ela:
//   - fecha com Esc (`onFechar`; sem ele, aperta o botão de fechar de dentro:
//     o que tiver data-fechar, aria-label "Fechar" ou o texto ✕ / Cancelar / Voltar);
//   - prende o Tab dentro dela e devolve o foco pra quem abriu, ao fechar;
//   - rola quando é mais alta que a tela;
//   - com `fundoFecha`, clicar fora fecha.
import { useEffect, useRef } from "react";

// Janelas abertas, da de baixo pra de cima: só a de cima responde ao Esc/Tab.
const pilha: HTMLElement[] = [];

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function botaoDeFechar(raiz: HTMLElement): HTMLElement | null {
  const marcado = raiz.querySelector<HTMLElement>('[data-fechar], button[aria-label="Fechar"]');
  if (marcado) return marcado;
  for (const b of raiz.querySelectorAll<HTMLButtonElement>("button")) {
    const t = (b.textContent ?? "").trim().toLowerCase();
    if (t === "✕" || t === "×" || t === "x" || t === "cancelar" || t === "voltar" || t === "fechar") return b;
  }
  return null;
}

export function Janela({
  onFechar,
  rotulo,
  fundoFecha = false,
  camada = "z-50",
  escuro = "bg-black/50",
  children,
}: {
  /** Fechar a janela (Esc e, com fundoFecha, clique fora). */
  onFechar?: () => void;
  /** Nome da janela pro leitor de tela, quando não há um título visível com id. */
  rotulo?: string;
  fundoFecha?: boolean;
  /** z-index (z-50 padrão; z-[60] pra janela sobre janela). */
  camada?: string;
  /** Escurecimento do fundo. */
  escuro?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fecharRef = useRef(onFechar);
  useEffect(() => { fecharRef.current = onFechar; }, [onFechar]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const antes = document.activeElement as HTMLElement | null;
    pilha.push(el);
    // Foco no primeiro campo (ou na própria janela), sem roubar se já há foco dentro.
    const t = setTimeout(() => {
      if (el.contains(document.activeElement)) return;
      const campo = el.querySelector<HTMLElement>("input:not([disabled]):not([type=hidden]), select, textarea") ?? el;
      campo.focus({ preventScroll: true });
    }, 0);

    function aoTeclar(e: KeyboardEvent) {
      if (pilha[pilha.length - 1] !== el || !el) return;
      // A pergunta do sistema (confirmar/perguntar) cuida do Esc dela.
      if (e.defaultPrevented || document.querySelector('[role="alertdialog"]')) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (fecharRef.current) fecharRef.current();
        else botaoDeFechar(el)?.click();
        return;
      }
      if (e.key === "Tab") {
        const lista = [...el.querySelectorAll<HTMLElement>(FOCAVEIS)].filter((x) => x.offsetParent !== null);
        if (lista.length === 0) { e.preventDefault(); el.focus(); return; }
        const primeiro = lista[0], ultimo = lista[lista.length - 1];
        if (e.shiftKey && (document.activeElement === primeiro || document.activeElement === el)) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", aoTeclar);
      const i = pilha.indexOf(el);
      if (i >= 0) pilha.splice(i, 1);
      if (antes && document.contains(antes)) antes.focus({ preventScroll: true });
    };
  }, []);

  const foraFecha = (e: React.MouseEvent) => {
    if (fundoFecha && e.target === e.currentTarget) fecharRef.current?.();
  };

  return (
    <div className={`fixed inset-0 ${camada} overflow-y-auto ${escuro}`} onClick={foraFecha}>
      <div className="flex min-h-full items-center justify-center p-4" onClick={foraFecha}>
        <div ref={ref} role="dialog" aria-modal="true" aria-label={rotulo} tabIndex={-1} className="flex w-full justify-center">
          {children}
        </div>
      </div>
    </div>
  );
}
