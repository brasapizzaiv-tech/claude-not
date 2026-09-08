// Motor do envio: pega a lista de links da tela de fornecedores (aba do
// sistema), abre o WhatsApp Web com cada mensagem, clica em Enviar, avisa o
// sistema pra marcar "enviado" e passa pro próximo. Tudo com pausas, pra não
// parecer robô pro WhatsApp.
const estado = { rodando: false, parar: false };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const status = (texto, extra = {}) => chrome.storage.local.set({ status: texto, ...extra });

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.action === "iniciar") {
    if (estado.rodando) { sendResponse({ ok: false, erro: "Já está enviando." }); return true; }
    iniciar(msg.tabId, !!msg.reenviar).catch((e) => status("Erro: " + (e?.message || e)));
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.action === "parar") {
    estado.parar = true;
    status("Parando depois desta mensagem…");
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

async function fecharAbasWhats() {
  const abas = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  for (const a of abas) { try { await chrome.tabs.remove(a.id); } catch {} }
}

function esperarCarregar(tabId, limiteMs = 45000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { chrome.tabs.onUpdated.removeListener(ouvinte); resolve(false); }, limiteMs);
    function ouvinte(id, info) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(t);
        chrome.tabs.onUpdated.removeListener(ouvinte);
        resolve(true);
      }
    }
    chrome.tabs.onUpdated.addListener(ouvinte);
  });
}

async function iniciar(tabSistema, reenviar) {
  estado.rodando = true;
  estado.parar = false;
  try {
    await status("Lendo a lista de fornecedores…", { enviados: 0, total: 0 });
    let resp;
    try {
      resp = await chrome.tabs.sendMessage(tabSistema, { action: "coletarLinks" });
    } catch {
      await status("Abra a tela Cotação → Fornecedores do sistema da Brasa e clique de novo.");
      return;
    }
    const todos = (resp?.links || []).filter((l) => l.href && l.telefone);
    const fila = reenviar ? todos : todos.filter((l) => !l.enviado);
    if (fila.length === 0) {
      await status(todos.length ? "Todos já estão marcados como enviados. (Marque 'reenviar' pra mandar de novo.)" : "Nenhum fornecedor com WhatsApp nessa tela.");
      return;
    }
    await status(`${fila.length} mensagens pra enviar. Não use o WhatsApp Web enquanto envia.`, { enviados: 0, total: fila.length });

    let enviados = 0;
    const falhas = [];
    for (let i = 0; i < fila.length; i++) {
      if (estado.parar) { await status(`Parado. Enviadas ${enviados} de ${fila.length}.`); return; }
      const l = fila[i];
      await status(`(${i + 1}/${fila.length}) Enviando para ${l.nome || l.telefone}…`, { enviados, total: fila.length });

      await fecharAbasWhats();
      const aba = await chrome.tabs.create({ url: l.href, active: true });
      const carregou = await esperarCarregar(aba.id);
      let resultado = "timeout";
      if (carregou) {
        try {
          // O WhatsApp Web demora pra montar o chat depois do "complete".
          await esperar(2500);
          const [r] = await chrome.scripting.executeScript({ target: { tabId: aba.id }, files: ["content-whats.js"] });
          resultado = r?.result || "timeout";
        } catch (e) {
          resultado = "erro: " + (e?.message || e);
        }
      }
      if (resultado === "enviado") {
        enviados++;
        try { await chrome.tabs.sendMessage(tabSistema, { action: "marcarEnviado", id: l.id }); } catch {}
      } else {
        falhas.push(`${l.nome || l.telefone} (${resultado === "invalido" ? "número sem WhatsApp" : resultado})`);
      }
      await status(`(${i + 1}/${fila.length}) ${l.nome || l.telefone}: ${resultado === "enviado" ? "✓ enviada" : "✗ " + resultado}`, { enviados, total: fila.length });
      try { await chrome.tabs.remove(aba.id); } catch {}
      // Pausa entre mensagens (3 a 6 s) — evita bloqueio por spam.
      await esperar(3000 + Math.random() * 3000);
    }
    await status(
      `Pronto: ${enviados} de ${fila.length} enviadas.` + (falhas.length ? ` Não foi: ${falhas.join("; ")}` : ""),
      { enviados, total: fila.length },
    );
    try { await chrome.tabs.update(tabSistema, { active: true }); } catch {}
  } finally {
    estado.rodando = false;
    estado.parar = false;
  }
}
