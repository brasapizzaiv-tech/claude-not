"use client";

// Voz do quiosque: o próprio navegador fala (Web Speech API — sem internet,
// sem custo, usa as vozes em português do Windows). Serve pra avisar o cliente
// sem ele precisar ler a tela: "comanda 246, retire seu prato".
//
// Detalhe do navegador: só dá pra falar depois que alguém tocou/clicou na tela
// alguma vez. Por isso o primeiro toque "destrava" a voz — no quiosque isso
// acontece sozinho (abrir a tela cheia, tocar em qualquer botão).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const K_LIGADA = "balanca_voz";
const K_VOZ = "balanca_voz_nome";

export type Voz = { nome: string; idioma: string };

// "36 reais e 44 centavos" (o leitor de voz lê os números por extenso sozinho).
export function valorFalado(n: number) {
  const v = Math.max(0, Math.round(Number(n || 0) * 100));
  const reais = Math.floor(v / 100);
  const centavos = v % 100;
  const p1 = `${reais} ${reais === 1 ? "real" : "reais"}`;
  if (centavos === 0) return p1;
  return `${p1} e ${centavos} ${centavos === 1 ? "centavo" : "centavos"}`;
}

// Preferências guardadas neste aparelho, lidas sem quebrar a hidratação
// (mesmo padrão do menu lateral): um "texto" só com as duas escolhas.
const ouvintes = new Set<() => void>();
function subscribe(cb: () => void) {
  ouvintes.add(cb);
  window.addEventListener("storage", cb);
  return () => { ouvintes.delete(cb); window.removeEventListener("storage", cb); };
}
function lerPrefs() {
  try {
    return `${localStorage.getItem(K_LIGADA) === "1" ? "1" : "0"}|${localStorage.getItem(K_VOZ) ?? ""}`;
  } catch {
    return "0|";
  }
}
function gravarPrefs(ligada: boolean, nome: string) {
  try {
    localStorage.setItem(K_LIGADA, ligada ? "1" : "0");
    localStorage.setItem(K_VOZ, nome);
  } catch { /* sem localStorage */ }
  ouvintes.forEach((f) => f());
}

export function useVoz() {
  const prefs = useSyncExternalStore(subscribe, lerPrefs, () => "0|");
  const corte = prefs.indexOf("|");
  const ligada = prefs.slice(0, corte) === "1";
  const vozNome = prefs.slice(corte + 1);
  const [vozes, setVozes] = useState<Voz[]>([]);

  // Refs pra usar os valores dentro de callbacks sem recriar tudo a cada render.
  const ligadaRef = useRef(ligada);
  const vozNomeRef = useRef(vozNome);
  useEffect(() => { ligadaRef.current = ligada; vozNomeRef.current = vozNome; }, [ligada, vozNome]);

  // Lista de vozes (o Chrome carrega depois; por isso o ouvinte).
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const ler = () => {
      const todas = window.speechSynthesis.getVoices();
      const pt = todas.filter((v) => v.lang?.toLowerCase().startsWith("pt"));
      setVozes((pt.length > 0 ? pt : todas).map((v) => ({ nome: v.name, idioma: v.lang })));
    };
    const t = setTimeout(ler, 0);
    window.speechSynthesis.addEventListener("voiceschanged", ler);
    return () => { clearTimeout(t); window.speechSynthesis.removeEventListener("voiceschanged", ler); };
  }, []);

  // Primeiro toque na tela libera o áudio no navegador.
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const destravar = () => {
      try {
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        window.speechSynthesis.speak(u);
      } catch { /* sem voz neste aparelho */ }
      document.removeEventListener("pointerdown", destravar);
      document.removeEventListener("keydown", destravar);
    };
    document.addEventListener("pointerdown", destravar);
    document.addEventListener("keydown", destravar);
    return () => {
      document.removeEventListener("pointerdown", destravar);
      document.removeEventListener("keydown", destravar);
    };
  }, []);

  const escolherVoz = useCallback(() => {
    const todas = window.speechSynthesis.getVoices();
    const nome = vozNomeRef.current;
    return (
      (nome && todas.find((v) => v.name === nome)) ||
      todas.find((v) => v.lang?.toLowerCase().startsWith("pt-br")) ||
      todas.find((v) => v.lang?.toLowerCase().startsWith("pt")) ||
      null
    );
  }, []);

  // Fala uma frase. `forcar` é pro botão de teste (fala mesmo desligada).
  const falar = useCallback(
    (texto: string, forcar = false) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      if (!forcar && !ligadaRef.current) return;
      const t = String(texto || "").trim();
      if (!t) return;
      try {
        window.speechSynthesis.cancel(); // a fala nova cancela a anterior
        const u = new SpeechSynthesisUtterance(t);
        const v = escolherVoz();
        if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "pt-BR";
        u.rate = 1;
        u.pitch = 1;
        u.volume = 1;
        window.speechSynthesis.speak(u);
      } catch { /* aparelho sem voz */ }
    },
    [escolherVoz],
  );

  const alternar = useCallback(
    (v: boolean) => {
      ligadaRef.current = v;
      gravarPrefs(v, vozNomeRef.current);
      if (v) falar("Voz ligada.", true);
      else if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    },
    [falar],
  );

  const trocarVoz = useCallback(
    (nome: string) => {
      vozNomeRef.current = nome;
      gravarPrefs(ligadaRef.current, nome);
      falar("Comanda 246. Retire seu prato.", true);
    },
    [falar],
  );

  const suportada = typeof window !== "undefined" && !!window.speechSynthesis;
  return { ligada, alternar, vozes, vozNome, trocarVoz, falar, suportada };
}
