"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MODULOS } from "@/lib/permissoes";
import {
  criarUsuario,
  atualizarPermissoes,
  trocarSenha,
  excluirUsuario,
} from "./actions";

// Grade de checkboxes de módulos + interruptor "acesso total".
function EditorPermissoes({
  dono,
  setDono,
  permissoes,
  toggle,
}: {
  dono: boolean;
  setDono: (v: boolean) => void;
  permissoes: string[];
  toggle: (key: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={dono}
          onChange={(e) => setDono(e.target.checked)}
          className="h-4 w-4"
        />
        Acesso total (dono) — enxerga e edita tudo
      </label>
      {!dono && (
        <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          {MODULOS.map((m) => (
            <label
              key={m.key}
              className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
            >
              <input
                type="checkbox"
                checked={permissoes.includes(m.key)}
                onChange={() => toggle(m.key)}
                className="h-4 w-4"
              />
              <span>
                {m.icon} {m.label}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function NovoUsuario() {
  const router = useRouter();
  const [p, start] = useTransition();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [dono, setDono] = useState(false);
  const [permissoes, setPermissoes] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);

  const toggle = (key: string) =>
    setPermissoes((cur) =>
      cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key],
    );

  function salvar() {
    setErro(null);
    if (!nome.trim() || !email.trim() || senha.length < 6) {
      setErro("Preencha nome, e-mail e uma senha de pelo menos 6 caracteres.");
      return;
    }
    start(async () => {
      const r = await criarUsuario({ nome, email, senha, dono, permissoes });
      if (!r.ok) {
        setErro(r.erro ?? "Falha ao criar usuário.");
        return;
      }
      setNome("");
      setEmail("");
      setSenha("");
      setDono(false);
      setPermissoes([]);
      setAberto(false);
      router.refresh();
    });
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="mb-6 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
      >
        + Novo usuário
      </button>
    );
  }

  return (
    <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Novo usuário
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome"
          className="rounded-xl border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail (login)"
          type="email"
          className="rounded-xl border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <input
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="Senha (mín. 6)"
          type="text"
          className="rounded-xl border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
      </div>
      <div className="mt-4">
        <EditorPermissoes
          dono={dono}
          setDono={setDono}
          permissoes={permissoes}
          toggle={toggle}
        />
      </div>
      {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}
      <div className="mt-4 flex gap-2">
        <button
          onClick={salvar}
          disabled={p}
          className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
        >
          {p ? "Criando..." : "Criar usuário"}
        </button>
        <button
          onClick={() => setAberto(false)}
          className="rounded-xl px-4 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function UsuarioLinha({
  usuario,
  souEu,
}: {
  usuario: {
    id: string;
    nome: string;
    email: string;
    dono: boolean;
    permissoes: string[];
  };
  souEu: boolean;
}) {
  const router = useRouter();
  const [p, start] = useTransition();
  const [editando, setEditando] = useState(false);
  const [dono, setDono] = useState(usuario.dono);
  const [permissoes, setPermissoes] = useState<string[]>(usuario.permissoes);
  const [novaSenha, setNovaSenha] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const toggle = (key: string) =>
    setPermissoes((cur) =>
      cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key],
    );

  function salvarAcesso() {
    start(async () => {
      await atualizarPermissoes(usuario.id, { dono, permissoes });
      setEditando(false);
      setMsg("Acesso atualizado.");
      router.refresh();
    });
  }

  function salvarSenha() {
    if (novaSenha.length < 6) {
      setMsg("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    start(async () => {
      const r = await trocarSenha(usuario.id, novaSenha);
      setNovaSenha("");
      setMsg(r.ok ? "Senha alterada." : r.erro ?? "Falha ao trocar senha.");
    });
  }

  function excluir() {
    if (!confirm(`Excluir o usuário ${usuario.nome}? Ele perderá o acesso.`))
      return;
    start(async () => {
      const r = await excluirUsuario(usuario.id);
      if (!r.ok) {
        setMsg(r.erro ?? "Falha ao excluir.");
        return;
      }
      router.refresh();
    });
  }

  const resumoAcesso = usuario.dono
    ? "Acesso total"
    : usuario.permissoes.length === 0
      ? "Sem acesso"
      : usuario.permissoes
          .map((k) => MODULOS.find((m) => m.key === k)?.label ?? k)
          .join(", ");

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            {usuario.nome}{" "}
            {usuario.dono && (
              <span className="ml-1 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                DONO
              </span>
            )}
            {souEu && <span className="ml-1 text-xs text-zinc-400">(você)</span>}
          </p>
          <p className="text-sm text-zinc-500">{usuario.email}</p>
          <p className="mt-0.5 text-xs text-zinc-400">{resumoAcesso}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setEditando((v) => !v)}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {editando ? "Fechar" : "Editar acesso"}
          </button>
          {!souEu && (
            <button
              onClick={excluir}
              disabled={p}
              className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:text-red-600 disabled:opacity-60"
            >
              Excluir
            </button>
          )}
        </div>
      </div>

      {editando && (
        <div className="mt-4 space-y-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <EditorPermissoes
            dono={dono}
            setDono={setDono}
            permissoes={permissoes}
            toggle={toggle}
          />
          <button
            onClick={salvarAcesso}
            disabled={p}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60"
          >
            Salvar acesso
          </button>

          <div className="border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <p className="mb-2 text-xs font-medium text-zinc-500">
              Trocar senha
            </p>
            <div className="flex gap-2">
              <input
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Nova senha (mín. 6)"
                type="text"
                className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button
                onClick={salvarSenha}
                disabled={p}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Salvar senha
              </button>
            </div>
          </div>
        </div>
      )}

      {msg && <p className="mt-3 text-xs text-zinc-500">{msg}</p>}
    </div>
  );
}
