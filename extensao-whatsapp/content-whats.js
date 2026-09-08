// Injetado na aba do WhatsApp Web depois que ela carrega com a mensagem
// pronta. Procura o botão Enviar, clica e confirma que a mensagem saiu.
// Devolve: "enviado" | "invalido" (número não tem WhatsApp) | "timeout".
(async () => {
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const SELETORES = [
    'footer button[aria-label="Enviar"]',
    'footer button[aria-label="Send"]',
    'button[aria-label="Enviar"][data-icon="wds-ic-send-filled"]',
    'span[data-icon="wds-ic-send-filled"]',
    'span[data-icon="send"]',
    '#main footer button[data-tab]',
  ];
  const INVALIDO = /inválido|invalid|não é válido|não está no WhatsApp|isn't on WhatsApp/i;

  const inicio = Date.now();
  const LIMITE = 60000;
  while (Date.now() - inicio < LIMITE) {
    // Número sem WhatsApp: aparece um aviso em vez do chat.
    const modal = document.querySelector('[data-animate-modal-popup="true"], [role="dialog"]');
    if (modal && INVALIDO.test(modal.textContent || "")) return "invalido";

    // Caixa de texto com a mensagem já dentro?
    const caixa = document.querySelector('#main footer [contenteditable="true"]');
    if (caixa && (caixa.textContent || "").trim().length > 0) {
      for (const sel of SELETORES) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const btn = el.tagName === "BUTTON" ? el : el.closest("button") || el;
        const label = (btn.getAttribute("aria-label") || "").toLowerCase();
        if (label.includes("voz") || label.includes("voice")) continue;
        // Clique "completo" (o botão do WhatsApp ignora click() seco às vezes).
        for (const tipo of ["mouseenter", "mouseover", "mousedown", "mouseup", "click"]) {
          btn.dispatchEvent(new MouseEvent(tipo, { bubbles: true, cancelable: true, button: 0 }));
        }
        await esperar(1500);
        // Enviou: caixa esvaziou (ou o ícone do microfone voltou).
        const depois = document.querySelector('#main footer [contenteditable="true"]');
        const vazia = !depois || (depois.textContent || "").trim().length === 0;
        if (vazia || document.querySelector('[data-icon="mic-outlined"], [data-icon="ptt"]')) {
          await esperar(1500); // dá tempo do "relógio" virar "check"
          return "enviado";
        }
      }
      // Sem botão achado: tenta Enter na caixa.
      caixa.focus();
      caixa.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      await esperar(1500);
      const dep2 = document.querySelector('#main footer [contenteditable="true"]');
      if (!dep2 || (dep2.textContent || "").trim().length === 0) { await esperar(1500); return "enviado"; }
    }
    await esperar(700);
  }
  return "timeout";
})();
