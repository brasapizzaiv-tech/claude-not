import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buscarTodas } from "@/lib/supabase/todas";
import { Enviar } from "@/components/enviar";
import { Foto, HorariosEditor, UploadFoto } from "../../client";
import { salvarDetalhesCombo } from "../actions";
import { EditorEtapas } from "./editor";
import type { Horarios } from "@/lib/disponibilidade";

export const metadata = { title: "Combo · Cardápio" };
export const dynamic = "force-dynamic";

// Combo em etapas (migration 0263): Detalhes, Etapas e Disponibilidade, como
// no Suitable. As etapas são os grupos de escolha do item.
export default async function ComboPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: it } = await supabase.from("pdv_itens").select("id, nome, descricao, foto_url, disponivel, horarios, combo").eq("id", id).maybeSingle();
  const item = it as { id: string; nome: string; descricao: string | null; foto_url: string | null; disponivel: boolean; horarios: Horarios; combo: boolean } | null;
  if (!item || !item.combo) notFound();

  const [{ data: gs }, { data: tams }, { data: sabs }, precos] = await Promise.all([
    supabase.from("pdv_item_grupos").select("id, nome, min, max, permite_repetir, media, tamanho_id, ordem").eq("item_id", id).order("ordem"),
    supabase.from("pdv_pizza_tamanhos").select("id, nome, ordem").order("ordem"),
    supabase.from("pdv_pizza_sabores").select("id, nome, tipo").eq("ativo", true).order("ordem"),
    buscarTodas<{ sabor_id: string; tamanho_id: string; preco: number }>((de, ate) => supabase.from("pdv_pizza_sabor_precos").select("sabor_id, tamanho_id, preco").order("sabor_id").order("tamanho_id").range(de, ate)),
  ]);
  type G = { id: string; nome: string; min: number; max: number; permite_repetir: boolean; media: boolean; tamanho_id: string | null };
  const grupos = (gs as G[] | null) ?? [];
  const { data: ops } = grupos.length
    ? await supabase.from("pdv_item_opcoes").select("id, grupo_id, nome, preco, ativo, sabor_id, produto_id, ordem").in("grupo_id", grupos.map((g) => g.id)).order("ordem")
    : { data: [] };
  type O = { id: string; grupo_id: string; nome: string; preco: number; ativo: boolean; sabor_id: string | null; produto_id: string | null };
  const opcoes = (ops as O[] | null) ?? [];
  const etapas = grupos.map((g) => ({
    id: g.id, nome: g.nome, min: g.min, max: g.max, permite_repetir: g.permite_repetir, media: g.media, tamanho_id: g.tamanho_id,
    opcoes: opcoes.filter((o) => o.grupo_id === g.id).map((o) => ({ id: o.id, nome: o.nome, preco: Number(o.preco), ativo: o.ativo, sabor_id: o.sabor_id, produto_id: o.produto_id })),
  }));

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <Link href="/salao/cardapio" className="text-sm font-semibold text-texto-marca hover:underline">← Cardápio</Link>
      <div className="mb-4 mt-2 flex flex-wrap items-center gap-3">
        <Foto url={item.foto_url} tam="h-14 w-14" />
        <div className="min-w-0 flex-1">
          <div className="rotulo">Combo</div>
          <h1 className="font-numero text-[26px] font-bold leading-[1.1] tracking-apertada text-texto">{item.nome}</h1>
        </div>
        <UploadFoto tipo="item" id={item.id} temFoto={!!item.foto_url} />
      </div>

      <form action={salvarDetalhesCombo} className="cartao mb-4 space-y-3 p-4">
        <input type="hidden" name="id" value={item.id} />
        <div className="rotulo">Detalhes e disponibilidade</div>
        <label className="block text-xs text-texto-suave">Nome do combo
          <input name="nome" defaultValue={item.nome} required maxLength={100} className="mt-1 min-h-11 w-full rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto" />
        </label>
        <label className="block text-xs text-texto-suave">Detalhes (aparece pro cliente)
          <textarea name="descricao" defaultValue={item.descricao ?? ""} maxLength={400} rows={2} placeholder="Ex.: 1 pizza grande + 1 mini + guaraná 1L grátis" className="mt-1 w-full rounded-controle border border-borda-forte bg-transparent px-3 py-2 text-sm text-texto" />
        </label>
        <HorariosEditor inicial={item.horarios} />
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="disponivel" defaultChecked={item.disponivel} className="h-4 w-4" /> Disponível pra venda {!item.disponivel && <span className="pilula pilula-neutra">ainda não aparece no app</span>}</label>
          <Enviar className="btn-secundario ml-auto text-sm">Salvar detalhes</Enviar>
        </div>
      </form>

      <EditorEtapas
        itemId={item.id}
        inicial={etapas}
        tamanhos={((tams as { id: string; nome: string }[]) ?? [])}
        sabores={((sabs as { id: string; nome: string; tipo: string | null }[]) ?? [])}
        precos={precos.map((p) => ({ ...p, preco: Number(p.preco) }))}
      />
    </div>
  );
}
