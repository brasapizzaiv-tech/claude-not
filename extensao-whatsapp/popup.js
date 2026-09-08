const $ = (id) => document.getElementById(id);

function mostrar() {
  chrome.storage.local.get(["status", "enviados", "total"], (d) => {
    $("status").textContent = d.status || "Pronto.";
    const t = Number(d.total || 0), e = Number(d.enviados || 0);
    $("progresso").style.width = t ? Math.round((e / t) * 100) + "%" : "0%";
  });
}

$("enviar").addEventListener("click", async () => {
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!aba) return;
  chrome.runtime.sendMessage({ action: "iniciar", tabId: aba.id, reenviar: $("reenviar").checked }, (r) => {
    if (r && !r.ok) { $("status").textContent = r.erro; }
  });
});
$("parar").addEventListener("click", () => chrome.runtime.sendMessage({ action: "parar" }));

document.addEventListener("DOMContentLoaded", mostrar);
chrome.storage.onChanged.addListener((ch) => { if ("status" in ch || "enviados" in ch) mostrar(); });
mostrar();
