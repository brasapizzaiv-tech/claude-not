import { createAdminClient } from "@/lib/supabase/admin";
import { emServico } from "@/lib/horario-servico";

// Junta o último sinal de cada peça de fora num quadro só (auditoria, Onda 2).
// Usado pela tela /saude e pelo aviso da tela inicial, do caixa e do PDV.
// Tudo lido com a chave administrativa e filtrado pela empresa.

export type Estado = "ok" | "atencao" | "parado" | "neutro";

export type ItemSaude = {
  chave: string;
  nome: string;
  estado: Estado;
  resumo: string; // uma linha, vai no aviso
  detalhe?: string | null;
  quando?: string | null; // ISO do último sinal
  versao?: string | null;
  linhas?: { texto: string; sub?: string | null }[];
};

export type FilaProblema = {
  id: string;
  tipo: string;
  impressora: string | null;
  solicitado_em: string | null;
  tentativas: number;
  ultimo_erro: string | null;
  motivo: "falhando" | "retida" | "esperando";
};

export type Saude = {
  itens: ItemSaude[];
  fila: FilaProblema[];
  erros: { onde: string; mensagem: string; criado_em: string }[];
  agora: string;
};

const MIN = 60_000;
const HORA = 60 * MIN;

export { emServico };

function haQuanto(iso: string | null | undefined, agora: number): string {
  if (!iso) return "nunca";
  const ms = agora - new Date(iso).getTime();
  if (ms < MIN) return "agora há pouco";
  if (ms < HORA) return `há ${Math.round(ms / MIN)} min`;
  if (ms < 48 * HORA) return `há ${Math.round(ms / HORA)} h`;
  return `há ${Math.round(ms / (24 * HORA))} dias`;
}

function hojeSP(d = new Date()) {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

// Rotinas automáticas (vercel.json) e de quanto em quanto tempo devem rodar.
// "atraso" = depois de quanto tempo sem sinal vira problema.
const ROTINAS: { chave: string; nome: string; atraso: number }[] = [
  { chave: "rotina:sefaz-hora", nome: "Busca de notas na SEFAZ (de hora em hora)", atraso: 40 * MIN },
  { chave: "rotina:sefaz-completar", nome: "Busca dos itens das notas manifestadas", atraso: 20 * MIN },
  { chave: "rotina:contagem", nome: "Contagens agendadas", atraso: 50 * MIN },
  { chave: "rotina:fiscal-conferir", nome: "Conferência das NFC-e na Focus", atraso: 75 * MIN },
  { chave: "rotina:whatsapp-disparos", nome: "Campanhas e gatilhos do WhatsApp", atraso: 20 * MIN },
  { chave: "rotina:avisos-manha", nome: "Resumo da manhã no celular da equipe", atraso: 26 * HORA },
  { chave: "rotina:entrega-limpar", nome: "Limpeza das posições dos entregadores", atraso: 26 * HORA },
];

type Sinal = { chave: string; ok: boolean; detalhe: string | null; ultima_em: string; ultima_ok_em: string | null; falha_em: string | null };

export async function lerSaude(empresaId: string, opts?: { comErros?: boolean }): Promise<Saude> {
  const admin = createAdminClient();
  const agoraD = new Date();
  const agora = agoraD.getTime();
  const servico = emServico(agoraD);
  const umMinAtras = new Date(agora - MIN).toISOString();
  const umDiaAtras = new Date(agora - 24 * HORA).toISOString();

  const [imp, fila, bal, tef, sinais, sefaz, wpp, erros] = await Promise.all([
    admin.from("impressao_config").select("hostname, visto_em, versao, rodada_em").eq("empresa_id", empresaId).maybeSingle(),
    admin
      .from("impressao_fila")
      .select("id, tipo, solicitado_em, tentativas, ultimo_erro, retido_em, impressoras(nome)")
      .eq("empresa_id", empresaId)
      .is("impresso_em", null)
      .is("descartado_em", null)
      .or(`retido_em.not.is.null,tentativas.gte.5,solicitado_em.lt.${umMinAtras}`)
      .order("solicitado_em", { ascending: true })
      .limit(100),
    admin.from("balanca_status").select("hostname, visto_em, fila_pendente, versao, erros, erros_lista").eq("empresa_id", empresaId).maybeSingle(),
    admin.from("tef_status").select("terminal, hostname, versao, gerenciador, etapa, visto_em").eq("empresa_id", empresaId).order("terminal"),
    admin.from("saude_sinais").select("chave, ok, detalhe, ultima_em, ultima_ok_em, falha_em").or(`empresa_id.is.null,empresa_id.eq.${empresaId}`),
    admin
      .from("config_sefaz")
      .select("cert_pfx, ultimo_cstat, ultimo_motivo, ultima_busca_em, ultima_busca_ok_em, cert_validade, bloqueado_ate")
      .eq("empresa_id", empresaId)
      .maybeSingle(),
    admin
      .from("whatsapp_mensagens")
      .select("status, erro, criado_em")
      .eq("direcao", "saida")
      .gte("criado_em", umDiaAtras)
      .or(`empresa_id.is.null,empresa_id.eq.${empresaId}`)
      .order("criado_em", { ascending: false })
      .limit(50),
    opts?.comErros
      ? admin.from("erros_sistema").select("onde, mensagem, criado_em").or(`empresa_id.is.null,empresa_id.eq.${empresaId}`).gte("criado_em", umDiaAtras).order("criado_em", { ascending: false }).limit(30)
      : Promise.resolve({ data: [] }),
  ]);

  const itens: ItemSaude[] = [];
  const sinalDe = new Map(((sinais.data as Sinal[]) ?? []).map((s) => [s.chave, s]));

  // 1) Agente de impressão (PC central).
  {
    const c = imp.data as { hostname: string | null; visto_em: string | null; versao: string | null; rodada_em: string | null } | null;
    if (!c?.visto_em) {
      itens.push({ chave: "impressao", nome: "Agente de impressão", estado: "parado", resumo: "Impressão: o agente nunca deu sinal", quando: null });
    } else {
      const semSinal = agora - new Date(c.visto_em).getTime();
      // Sem rodada registrada (agente antigo ou acabou de ligar) = não sabemos, não
      // é "travado". 3 min de folga: uma leva grande pode demorar.
      const travado = c.rodada_em ? agora - new Date(c.rodada_em).getTime() > 3 * MIN && semSinal < 2 * MIN : false;
      const estado: Estado = semSinal > 150_000 ? "parado" : travado ? "parado" : "ok";
      const resumo = semSinal > 150_000
        ? `Impressão parada: o agente no ${c.hostname ?? "PC"} não dá sinal ${haQuanto(c.visto_em, agora)}`
        : travado
          ? `Impressão travada: o agente responde, mas não lê a fila ${haQuanto(c.rodada_em, agora)}`
          : `Agente no ${c.hostname ?? "PC"}, sinal ${haQuanto(c.visto_em, agora)}`;
      itens.push({ chave: "impressao", nome: "Agente de impressão", estado, resumo, quando: c.visto_em, versao: c.versao, detalhe: c.rodada_em ? `Última rodada da fila ${haQuanto(c.rodada_em, agora)}.` : "Versão antiga do agente: não informa a rodada da fila." });
    }
  }

  // 2) Fila de impressão: falhando, retida ou esperando há mais de 1 min.
  type FilaRow = { id: string; tipo: string; solicitado_em: string | null; tentativas: number; ultimo_erro: string | null; retido_em: string | null; impressoras: { nome: string } | { nome: string }[] | null };
  const filaProb: FilaProblema[] = ((fila.data as unknown as FilaRow[]) ?? []).map((f) => {
    const imp = Array.isArray(f.impressoras) ? f.impressoras[0] : f.impressoras;
    return {
      id: f.id,
      tipo: f.tipo,
      impressora: imp?.nome ?? null,
      solicitado_em: f.solicitado_em,
      tentativas: f.tentativas ?? 0,
      ultimo_erro: f.ultimo_erro,
      motivo: f.retido_em ? "retida" : (f.tentativas ?? 0) >= 5 ? "falhando" : "esperando",
    };
  });
  {
    const falhando = filaProb.filter((f) => f.motivo === "falhando").length;
    const retidas = filaProb.filter((f) => f.motivo === "retida").length;
    const esperando = filaProb.filter((f) => f.motivo === "esperando").length;
    const partes: string[] = [];
    if (esperando) partes.push(`${esperando} esperando há mais de 1 min`);
    if (falhando) partes.push(`${falhando} desistida(s) depois de 5 falhas`);
    if (retidas) partes.push(`${retidas} comanda(s) de cozinha velha(s) segurada(s)`);
    itens.push({
      chave: "fila",
      nome: "Fila de impressão",
      estado: falhando || esperando ? "parado" : retidas ? "atencao" : "ok",
      resumo: partes.length ? `Impressão: ${partes.join(", ")}` : "Nada parado na fila",
    });
  }

  // 3) Balança do buffet.
  {
    const b = bal.data as { hostname: string | null; visto_em: string | null; fila_pendente: number; versao: string | null; erros: number; erros_lista: { ts?: string; numero?: number; peso?: number; erro?: string }[] | null } | null;
    if (b) {
      const semSinal = b.visto_em ? agora - new Date(b.visto_em).getTime() : Infinity;
      const fora = semSinal > 3 * MIN;
      let estado: Estado = "ok";
      const partes: string[] = [];
      if (fora) { estado = servico ? "parado" : "neutro"; partes.push(servico ? `sem sinal ${haQuanto(b.visto_em, agora)}` : `desligada (último sinal ${haQuanto(b.visto_em, agora)})`); }
      if (b.fila_pendente > 0) { estado = "parado"; partes.push(`${b.fila_pendente} pesagem(ns) esperando subir`); }
      if ((b.erros ?? 0) > 0) { if (estado === "ok" || estado === "neutro") estado = "atencao"; partes.push(`${b.erros} pesagem(ns) recusada(s) nos últimos 3 dias`); }
      itens.push({
        chave: "balanca",
        nome: "Balança do buffet",
        estado,
        resumo: partes.length ? `Balança: ${partes.join(", ")}` : `Balança no ${b.hostname ?? "PC"}, sinal ${haQuanto(b.visto_em, agora)}`,
        quando: b.visto_em,
        versao: b.versao,
        linhas: (b.erros_lista ?? []).map((e) => ({ texto: `Cupom ${e.numero ?? "?"} · ${e.peso != null ? `${Number(e.peso).toLocaleString("pt-BR")} kg` : ""}`, sub: `${e.erro ?? ""}${e.ts ? ` · ${new Date(e.ts).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}` })),
      });
    }
  }

  // 4) Pinpads (agente TEF, um por PC de caixa).
  for (const t of (tef.data as { terminal: string; hostname: string | null; versao: string | null; gerenciador: boolean; etapa: string | null; visto_em: string | null }[]) ?? []) {
    const fora = !t.visto_em || agora - new Date(t.visto_em).getTime() > 3 * MIN;
    const semGer = !fora && !t.gerenciador;
    itens.push({
      chave: `tef:${t.terminal}`,
      nome: `Pinpad ${t.terminal}`,
      estado: fora ? (servico ? "atencao" : "neutro") : semGer ? "atencao" : "ok",
      resumo: fora
        ? `Pinpad ${t.terminal}: ${servico ? "sem sinal" : "desligado"} ${haQuanto(t.visto_em, agora)}`
        : semGer
          ? `Pinpad ${t.terminal}: o gerenciador da Elgin não responde`
          : `Pinpad ${t.terminal} no ${t.hostname ?? "PC"}, sinal ${haQuanto(t.visto_em, agora)}`,
      quando: t.visto_em,
      versao: t.versao,
    });
  }

  // 5) Relógio de ponto (lido pelo agente do PC central).
  {
    const s = sinalDe.get(`ponto:${empresaId}`);
    if (s) {
      const semLeitura = s.ultima_ok_em ? agora - new Date(s.ultima_ok_em).getTime() : Infinity;
      const estado: Estado = !s.ok ? "parado" : semLeitura > 30 * MIN ? (servico ? "parado" : "atencao") : "ok";
      itens.push({
        chave: "ponto",
        nome: "Relógio de ponto",
        estado,
        resumo: !s.ok
          ? `Relógio de ponto: ${s.detalhe ?? "falhou"}`
          : semLeitura > 30 * MIN
            ? `Relógio de ponto: sem leitura ${haQuanto(s.ultima_ok_em, agora)} (fora da rede ou senha trocada?)`
            : `Relógio lido ${haQuanto(s.ultima_ok_em, agora)}`,
        quando: s.ultima_ok_em,
      });
    }
  }

  // 6) SEFAZ (notas dos fornecedores) e certificado.
  {
    const z = sefaz.data as { cert_pfx: string | null; ultimo_cstat: string | null; ultimo_motivo: string | null; ultima_busca_em: string | null; ultima_busca_ok_em: string | null; cert_validade: string | null } | null;
    if (z?.cert_pfx) {
      const semBoa = z.ultima_busca_ok_em ? agora - new Date(z.ultima_busca_ok_em).getTime() : Infinity;
      const castigo = z.ultimo_cstat === "656";
      let estado: Estado = "ok";
      let resumo = z.ultima_busca_ok_em ? `Última busca boa ${haQuanto(z.ultima_busca_ok_em, agora)}` : "Ainda sem busca registrada";
      if (castigo) { estado = "atencao"; resumo = `SEFAZ: bloqueio por excesso de consultas (656) ${haQuanto(z.ultima_busca_em, agora)}`; }
      else if (z.ultima_busca_ok_em && semBoa > 6 * HORA) { estado = "parado"; resumo = `SEFAZ: notas dos fornecedores sem chegar ${haQuanto(z.ultima_busca_ok_em, agora)}`; }
      itens.push({ chave: "sefaz", nome: "SEFAZ (notas dos fornecedores)", estado, resumo, quando: z.ultima_busca_em, detalhe: z.ultimo_motivo });

      if (z.cert_validade) {
        const dias = Math.round((Date.parse(z.cert_validade + "T00:00:00Z") - Date.parse(hojeSP(agoraD) + "T00:00:00Z")) / 86400000);
        const data = z.cert_validade.split("-").reverse().join("/");
        itens.push({
          chave: "certificado",
          nome: "Certificado digital (SEFAZ, nota fiscal e Pix)",
          estado: dias < 0 ? "parado" : dias <= 30 ? "atencao" : "ok",
          resumo: dias < 0 ? `Certificado digital VENCEU em ${data}` : dias <= 30 ? `Certificado digital vence em ${dias} dia(s) (${data})` : `Certificado vale até ${data}`,
        });
      } else {
        itens.push({ chave: "certificado", nome: "Certificado digital (SEFAZ, nota fiscal e Pix)", estado: "neutro", resumo: "Validade não informada: preencha em Notas → SEFAZ automático" });
      }
    }
  }

  // 7) Rotinas automáticas.
  for (const r of ROTINAS) {
    const s = sinalDe.get(r.chave);
    if (!s) { itens.push({ chave: r.chave, nome: r.nome, estado: "neutro", resumo: `${r.nome}: sem registro ainda` }); continue; }
    const atrasada = agora - new Date(s.ultima_em).getTime() > r.atraso;
    itens.push({
      chave: r.chave,
      nome: r.nome,
      estado: !s.ok ? "parado" : atrasada ? "parado" : "ok",
      resumo: !s.ok ? `${r.nome}: falhou ${haQuanto(s.ultima_em, agora)}` : atrasada ? `${r.nome}: não roda ${haQuanto(s.ultima_em, agora)}` : `Rodou ${haQuanto(s.ultima_em, agora)}`,
      detalhe: s.detalhe,
      quando: s.ultima_em,
    });
  }
  // Kern: segunda a sábado às 08:35. Depois das 08:50, tem que ter rodado hoje.
  {
    const s = sinalDe.get("rotina:kern");
    const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(agoraD);
    const dia = p.find((x) => x.type === "weekday")?.value;
    const min = (Number(p.find((x) => x.type === "hour")?.value ?? 0) % 24) * 60 + Number(p.find((x) => x.type === "minute")?.value ?? 0);
    const devia = dia !== "Sun" && min >= 8 * 60 + 50;
    const rodouHoje = !!s && hojeSP(new Date(s.ultima_em)) === hojeSP(agoraD);
    let estado: Estado = "ok";
    let resumo = s ? `Rodou ${haQuanto(s.ultima_em, agora)}` : "Sem registro ainda";
    // Sem nenhum registro (logo depois de publicar) não dá pra dizer que falhou.
    if (!s) estado = "neutro";
    else if (!s.ok && rodouHoje) { estado = "parado"; resumo = `Delivery do Kern: falhou hoje (${s.detalhe ?? "erro"})`; }
    else if (devia && !rodouHoje) { estado = "parado"; resumo = "Delivery do Kern: a rotina das 08:35 não rodou hoje"; }
    itens.push({ chave: "rotina:kern", nome: "Pedido do delivery do Kern (08:35)", estado, resumo, detalhe: s?.detalhe, quando: s?.ultima_em });
  }

  // 8) WhatsApp (avisos do delivery).
  {
    const msgs = (wpp.data as { status: string; erro: string | null; criado_em: string }[]) ?? [];
    if (msgs.length > 0) {
      const falhas = msgs.filter((m) => m.status === "failed" || m.status === "falha");
      const ultimas = msgs.slice(0, 5);
      const todasFalharam = ultimas.length >= 3 && ultimas.every((m) => m.status === "failed" || m.status === "falha");
      itens.push({
        chave: "whatsapp",
        nome: "WhatsApp (avisos do pedido)",
        estado: todasFalharam ? "parado" : falhas.length ? "atencao" : "ok",
        resumo: todasFalharam
          ? `WhatsApp: as últimas ${ultimas.length} mensagens falharam (${(ultimas[0].erro ?? "").slice(0, 80)})`
          : falhas.length
            ? `WhatsApp: ${falhas.length} de ${msgs.length} mensagens falharam nas últimas 24 h`
            : `${msgs.length} mensagem(ns) nas últimas 24 h, nenhuma falha`,
        detalhe: falhas[0]?.erro ?? null,
        quando: msgs[0].criado_em,
      });
    }
  }

  return {
    itens,
    fila: filaProb,
    erros: ((erros.data as { onde: string; mensagem: string; criado_em: string }[]) ?? []),
    agora: agoraD.toISOString(),
  };
}

/** Só o que pede ação, pro aviso da tela inicial / caixa / PDV. */
export async function avisosDeSaude(empresaId: string | null, sem: string[] = []): Promise<string[]> {
  if (!empresaId) return [];
  try {
    const s = await lerSaude(empresaId);
    return s.itens
      .filter((i) => (i.estado === "parado" || i.estado === "atencao") && !sem.includes(i.chave))
      .map((i) => i.resumo);
  } catch {
    return [];
  }
}
