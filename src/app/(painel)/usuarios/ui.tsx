"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MODULOS } from "@/lib/permissoes";
import { Icone } from "@/components/icone";
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
        <div className="grid grid-cols-2 gap-1.5 rounded-cartao border border-borda p-3">
          {MODULOS.map((m) => (
            <label
              key={m.key}
              className="flex items-center gap-2 text-sm text-texto-suave"
            >
              <input
                type="checkbox"
                checked={permissoes.includes(m.key)}
                onChange={() => toggle(m.key)}
                className="h-4 w-4"
              />
              <span>
                <Icone nome={m.icon} tamanho={16} /> {m.label}
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
        className="mb-6 rounded-cartao bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
      >
        + Novo usuário
      </button>
    );
  }

  return (
    <div className="mb-6 rounded-cartao border border-borda bg-painel-cartao p-5">
      <h2 className="mb-4 text-lg font-semibold text-texto">
        Novo usuário
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome"
          className="rounded-cartao border border-borda-forte px-3 py-2 text-sm dark:bg-zinc-950"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail (login)"
          type="email"
          className="rounded-cartao border border-borda-forte px-3 py-2 text-sm dark:bg-zinc-950"
        />
        <input
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="Senha (mín. 6)"
          type="text"
          className="rounded-cartao border border-borda-forte px-3 py-2 text-sm dark:bg-zinc-950"
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
          className="rounded-cartao bg-texto px-4 py-2 text-sm font-semibold text-fundo hover:opacity-90 disabled:opacity-60"
        >
          {p ? "Criando..." : "Criar usuário"}
        </button>
        <button
          onClick={() => setAberto(false)}
          className="rounded-cartao px-4 py-2 text-sm text-texto-suave hover:bg-superficie-suave"
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
    <div className="rounded-cartao border border-borda bg-painel-cartao p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-texto">
            {usuario.nome}{" "}
            {usuario.dono && (
              <span className="ml-1 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                DONO
              </span>
            )}
            {souEu && <span className="ml-1 text-xs text-texto-fraco">(você)</span>}
          </p>
          <p className="text-sm text-texto-suave">{usuario.email}</p>
          <p className="mt-0.5 text-xs text-texto-fraco">{resumoAcesso}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setEditando((v) => !v)}
            className="rounded-controle border border-borda-forte px-3 py-1.5 text-xs font-medium text-texto-suave hover:bg-superficie-suave dark:border-borda-forte"
          >
            {editando ? "Fechar" : "Editar acesso"}
          </button>
          {!souEu && (
            <button
              onClick={excluir}
              disabled={p}
              className="rounded-controle px-3 py-1.5 text-xs text-texto-fraco hover:text-red-600 disabled:opacity-60"
            >
              Excluir
            </button>
          )}
        </div>
      </div>

      {editando && (
        <div className="mt-4 space-y-4 border-t border-borda pt-4">
          <EditorPermissoes
            dono={dono}
            setDono={setDono}
            permissoes={permissoes}
            toggle={toggle}
          />
          <button
            onClick={salvarAcesso}
            disabled={p}
            className="rounded-controle bg-texto px-3 py-1.5 text-xs font-semibold text-fundo hover:opacity-90 disabled:opacity-60"
          >
            Salvar acesso
          </button>

          <div className="border-t border-borda pt-4">
            <p className="mb-2 text-xs font-medium text-texto-suave">
              Trocar senha
            </p>
            <div className="flex gap-2">
              <input
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Nova senha (mín. 6)"
                type="text"
                className="flex-1 rounded-controle border border-borda-forte px-3 py-1.5 text-sm dark:bg-zinc-900"
              />
              <button
                onClick={salvarSenha}
                disabled={p}
                className="rounded-controle border border-borda-forte px-3 py-1.5 text-xs font-medium hover:bg-superficie-suave disabled:opacity-60 dark:border-borda-forte"
              >
                Salvar senha
              </button>
            </div>
          </div>
        </div>
      )}

      {msg && <p className="mt-3 text-xs text-texto-suave">{msg}</p>}
    </div>
  );
}
