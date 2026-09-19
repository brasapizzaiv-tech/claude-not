import Link from "next/link";
import { Enviar } from "@/components/enviar";
import { Icone } from "@/components/icone";
import { createClient } from "@/lib/supabase/server";
import { temChaveMapa } from "@/lib/geo";
import { salvarConfigDelivery } from "../actions";
import { pixDiagnostico } from "@/lib/pix";
import { whatsappConfigurado } from "@/lib/whatsapp";
import { PixTeste } from "./pix-teste";
import { WhatsappTeste } from "./whatsapp-teste";
import { HorariosConfig } from "./horarios-form";
import { lerConfigHorarios } from "@/lib/delivery-horarios";

export const metadata = { title: "Config · Delivery" };

export default async function DeliveryConfigPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("delivery_config")
    .select("origem_endereco, origem_lat, origem_lng, taxa_base, preco_km, raio_max_km, tempo_preparo_min, aberto, aviso, config")
    .eq("id", 1)
    .maybeSingle();
  const c = (data ?? {}) as {
    origem_endereco?: string; origem_lat?: number; origem_lng?: number;
    taxa_base?: number; preco_km?: number; raio_max_km?: number; tempo_preparo_min?: number; aberto?: boolean; aviso?: string | null;
    config?: unknown;
  };
  const horarios = lerConfigHorarios(c.config);
  const temChave = temChaveMapa();
  const geocodificado = c.origem_lat != null && c.origem_lng != null;
  const pix = pixDiagnostico();

  return (
    <div className="mx-auto max-w-2xl p-4">
      <Link href="/delivery" className="text-sm text-emerald-600">← Voltar pro painel</Link>
      <h1 className="mb-1 mt-2 flex items-center gap-2 text-xl font-bold"><Icone nome="ajustes" tamanho={19} /> Config do delivery</h1>
      <p className="mb-4 text-sm text-texto-suave">Taxa de entrega: por <Link href="/delivery/areas" className="font-semibold text-emerald-600">áreas desenhadas no mapa</Link> quando houver áreas cadastradas; senão, pela distância até o restaurante (abaixo).</p>

      <div className={`mb-4 rounded-cartao px-4 py-3 text-sm ${temChave ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}>
        {temChave
          ? "✓ Chave do Google Maps configurada — distância precisa (por rota)."
          : "ⓘ Sem chave do Google Maps: usando um cálculo grátis aproximado (linha reta). Pra ficar preciso, adicione GOOGLE_MAPS_API_KEY no .env do servidor."}
      </div>

      <PixTeste banco={pix.banco} ambiente={pix.ambiente} configurado={pix.configurado} faltando={pix.faltando} />

      <WhatsappTeste configurado={whatsappConfigurado()} />

      <form action={salvarConfigDelivery} className="space-y-4">
        <div>
          <label className="text-sm font-semibold">Endereço do restaurante</label>
          <input name="origem_endereco" defaultValue={c.origem_endereco ?? ""} placeholder="Rua, número, bairro, Ivoti - RS" className="mt-1 w-full rounded-controle border border-borda-forte bg-transparent px-3 py-2 text-sm " />
          <p className="mt-1 text-xs text-texto-suave">
            {geocodificado ? "Localizado no mapa — confira abaixo se o pino está no lugar certo." : "Ao salvar, o sistema localiza o endereço no mapa (ponto de partida das entregas)."}
          </p>
          {geocodificado && (
            <div className="mt-2 overflow-hidden rounded-cartao border border-borda dark:border-borda-forte">
              <iframe
                title="Localização do restaurante"
                className="h-64 w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://maps.google.com/maps?q=${Number(c.origem_lat)},${Number(c.origem_lng)}&z=16&hl=pt-BR&output=embed`}
              />
              <div className="flex items-center justify-between bg-superficie-suave px-3 py-2 text-xs">
                <span className="text-texto-suave">O pino é o ponto de partida das entregas.</span>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${Number(c.origem_lat)},${Number(c.origem_lng)}`}
                  target="_blank" rel="noreferrer" className="font-semibold text-emerald-600 hover:underline"
                >
                  Abrir no Google Maps →
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold">Taxa base (R$)</label>
            <input name="taxa_base" defaultValue={c.taxa_base ?? 0} inputMode="decimal" className="mt-1 w-full rounded-controle border border-borda-forte bg-transparent px-3 py-2 text-sm " />
            <p className="mt-1 text-xs text-texto-suave">Valor fixo somado a toda entrega.</p>
          </div>
          <div>
            <label className="text-sm font-semibold">Valor por km (R$)</label>
            <input name="preco_km" defaultValue={c.preco_km ?? 0} inputMode="decimal" className="mt-1 w-full rounded-controle border border-borda-forte bg-transparent px-3 py-2 text-sm " />
            <p className="mt-1 text-xs text-texto-suave">Multiplicado pela distância.</p>
          </div>
          <div>
            <label className="text-sm font-semibold">Raio máximo (km)</label>
            <input name="raio_max_km" defaultValue={c.raio_max_km ?? 0} inputMode="decimal" className="mt-1 w-full rounded-controle border border-borda-forte bg-transparent px-3 py-2 text-sm " />
            <p className="mt-1 text-xs text-texto-suave">0 = sem limite. Avisa se o endereço passar disso.</p>
          </div>
          <div>
            <label className="text-sm font-semibold">Tempo de preparo (min)</label>
            <input name="tempo_preparo_min" defaultValue={c.tempo_preparo_min ?? 40} inputMode="numeric" className="mt-1 w-full rounded-controle border border-borda-forte bg-transparent px-3 py-2 text-sm " />
            <p className="mt-1 text-xs text-texto-suave">Usado pra calcular a previsão de entrega.</p>
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold">Aviso no app do cliente (opcional)</label>
          <input name="aviso" defaultValue={c.aviso ?? ""} placeholder="Ex.: Sexta e sábado têm rodízio por aqui! 🔥" className="mt-1 w-full rounded-controle border border-borda-forte bg-transparent px-3 py-2 text-sm " />
          <p className="mt-1 text-xs text-texto-suave">Aparece como faixa no topo do /pedir. Deixe vazio pra não mostrar.</p>
        </div>

        <HorariosConfig cfg={horarios} />

        <label className="flex items-center gap-2">
          <input type="checkbox" name="aberto" defaultChecked={c.aberto ?? true} className="h-4 w-4" />
          <span className="text-sm font-semibold">Delivery ligado</span>
          <span className="text-xs text-texto-suave">— desligue pra fechar na hora (feriado, imprevisto). Ligado, valem os horários acima.</span>
        </label>

        <div className="rounded-cartao bg-superficie-suave p-3 text-sm">
          <b>Exemplo:</b> taxa base R$ 4,00 + R$ 1,50/km. Um endereço a 2 km fica <b>R$ 7,00</b>.
        </div>

        <Enviar className="rounded-cartao bg-texto px-5 py-2.5 font-semibold text-fundo">Salvar</Enviar>
      </form>
    </div>
  );
}
