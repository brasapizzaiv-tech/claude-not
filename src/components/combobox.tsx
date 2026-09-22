"use client";

import { useEffect, useRef, useState } from "react";

export type ComboOpt = { value: string; label: string };

// Select com busca: mostra um campo onde dá pra digitar e filtrar as opções.
// Útil quando a lista é grande (fornecedores, produtos, categorias...).
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Buscar...",
  disabled,
  className = "",
  name,
  required,
}: {
  options: ComboOpt[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Preencha quando o campo estiver dentro de um formulário: o valor
   *  escolhido vai num campo escondido com este nome, e o formulário envia
   *  igual a um <select> comum. Sem isso, a escolha só existe na tela. */
  name?: string;
  /** Sem escolha, o formulário não envia. O aviso do navegador cai no campo
   *  de digitar (que fica vazio até escolher algo) — campo escondido o
   *  navegador não valida. */
  required?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  // Fecha ao clicar fora.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const filtradas = (q
    ? options.filter((o) => o.label.toLowerCase().includes(q))
    : options
  ).slice(0, 60);

  function abrir() {
    if (disabled) return;
    setQuery("");
    setHi(0);
    setOpen(true);
  }
  function escolher(o: ComboOpt) {
    onChange(o.value);
    setQuery("");
    setOpen(false);
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHi((h) => Math.min(h + 1, filtradas.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (open && filtradas[hi]) {
        e.preventDefault();
        escolher(filtradas[hi]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrap} className="relative">
      {name && <input type="hidden" name={name} value={value} />}
      <input
        type="text"
        disabled={disabled}
        required={required && !value}
        value={open ? query : selected?.label ?? ""}
        placeholder={selected ? selected.label : placeholder}
        onFocus={abrir}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onKeyDown={onKey}
        className={className}
        autoComplete="off"
      />
      {open && filtradas.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {filtradas.map((o, i) => (
            <li key={o.value}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolher(o);
                }}
                onMouseEnter={() => setHi(i)}
                className={`block w-full px-3 py-2 text-left ${
                  i === hi
                    ? "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                    : "text-zinc-700 dark:text-zinc-200"
                } ${o.value === value ? "font-semibold" : ""}`}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && filtradas.length === 0 && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-500 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          Nada encontrado.
        </div>
      )}
    </div>
  );
}
