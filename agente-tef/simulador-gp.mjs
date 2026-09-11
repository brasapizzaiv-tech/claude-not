// SIMULADOR do gerenciador de TEF (o programa da Elgin/PayGo/SiTef).
//
// Serve pra testar o caixa inteiro ANTES de a Elgin liberar o ambiente de
// homologação: fica olhando a pasta Req, responde IntPos.Sts e IntPos.001
// como o gerenciador de verdade responderia, e aceita CNF/NCN.
//
// Regras pra simular cenários (pelo valor da venda):
//   centavos ,99  → NEGADA ("Transação não autorizada")
//   centavos ,98  → demora 20 s antes de aprovar (cliente procurando o cartão)
//   centavos ,97  → não responde nunca (gerenciador travado → timeout no agente)
//   qualquer outro → APROVADA em ~3 s, com NSU/autorização/bandeira fictícios
//
// Uso: node simulador-gp.mjs [pasta]   (padrão C:\Cliente)
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, renameSync } from "node:fs";
import path from "node:path";
import { ler, montar, CHAVES } from "./intpos.mjs";

const base = process.argv[2] || "C:\\Cliente";
const pastaReq = path.join(base, "Req");
const pastaResp = path.join(base, "Resp");
for (const p of [pastaReq, pastaResp]) mkdirSync(p, { recursive: true });
const arqReq = path.join(pastaReq, "IntPos.001");
const arqSts = path.join(pastaResp, "IntPos.Sts");
const arqResp = path.join(pastaResp, "IntPos.001");

const log = (m) => console.log(`[${new Date().toLocaleTimeString("pt-BR")}] SIMULADOR ${m}`);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
function gravar(p, conteudo) {
  const tmp = p + ".tmp";
  writeFileSync(tmp, conteudo, "latin1");
  try { unlinkSync(p); } catch { /* ok */ }
  renameSync(tmp, p);
}
const agora = () => {
  const d = new Date();
  const z = (n) => String(n).padStart(2, "0");
  return { data: `${z(d.getDate())}${z(d.getMonth() + 1)}${d.getFullYear()}`, hora: `${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}` };
};
let seq = 100000 + Math.floor(Math.random() * 800000);

async function responder(campos) {
  const op = campos[CHAVES.OPERACAO];
  const id = campos[CHAVES.ID] || "0";
  // 1) acusa recebimento
  gravar(arqSts, montar([[CHAVES.OPERACAO, op], [CHAVES.ID, id]]));
  log(`recebi ${op} #${id}`);

  if (op === "CNF" || op === "NCN") { log(op === "CNF" ? "venda CONFIRMADA" : "venda DESFEITA"); return; }

  const centavos = Number(campos[CHAVES.VALOR] || 0);
  const valorStr = (centavos / 100).toFixed(2).replace(".", ",");
  const final = centavos % 100;
  const { data, hora } = agora();

  if (op === "CRT" || op === "CNC") {
    if (final === 97) { log("cenário 97: fico mudo (o agente vai dar timeout)"); return; }
    if (final === 98) { log("cenário 98: demorando 20 s..."); await dormir(20000); }
    else { log(`no pinpad... (R$ ${valorStr})`); await dormir(3000); }

    if (final === 99) {
      gravar(arqResp, montar([
        [CHAVES.OPERACAO, op], [CHAVES.ID, id], [CHAVES.STATUS, "NEGADA"],
        [CHAVES.COD_OPERACAO, 51], [CHAVES.MSG_OPERACAO, "TRANSACAO NAO AUTORIZADA"],
        [CHAVES.TEXTO_OPERADOR, "Transação não autorizada pelo emissor"], [CHAVES.RETORNO, 1],
      ]));
      log("NEGADA");
      return;
    }

    const tipo = campos[CHAVES.TIPO_CARTAO];
    const rede = campos[CHAVES.REDE] || "SICREDI";
    const credito = tipo === "1" || (tipo !== "2" && tipo !== "3" && seq % 2 === 0);
    const bandeira = tipo === "3" ? "ALELO" : seq % 3 === 0 ? "MASTERCARD" : "VISA";
    const produto = tipo === "3" ? "VOUCHER REFEICAO" : credito ? `${bandeira} CREDITO` : `${bandeira} DEBITO`;
    const nsu = String(++seq);
    const aut = String(100000 + Math.floor(Math.random() * 899999));
    const linhas = [
      "BRASA PIZZARIA E RESTAURANTE", "CNPJ 47.261.660/0001-90", `${rede} - ${produto}`,
      `${data.slice(0, 2)}/${data.slice(2, 4)}/${data.slice(4)} ${hora.slice(0, 2)}:${hora.slice(2, 4)}`,
      `NSU ${nsu}   AUT ${aut}`, `VALOR: R$ ${valorStr}`, "CARTAO **** **** **** 1234",
      op === "CNC" ? "*** CANCELAMENTO ***" : "TRANSACAO APROVADA", "(simulador - sem valor)",
    ];
    const pares = [
      [CHAVES.OPERACAO, op], [CHAVES.ID, id], [CHAVES.STATUS, "OK"],
      [CHAVES.REDE, rede], [CHAVES.BANDEIRA, bandeira], [CHAVES.PRODUTO, produto],
      [CHAVES.COD_TRANSACAO, credito ? 10 : 20], [CHAVES.TIPO_CARTAO, tipo === "3" ? 3 : credito ? 1 : 2],
      [CHAVES.NSU, nsu], [CHAVES.NSU_HOST, nsu], [CHAVES.AUTORIZACAO, aut],
      [CHAVES.VALOR, centavos], [CHAVES.DATA, data], [CHAVES.HORA, hora],
      [CHAVES.PAN_MASCARADO, "************1234"], [CHAVES.PORTADOR, "CLIENTE TESTE"],
      [CHAVES.TERMINAL, campos[CHAVES.TERMINAL] || "T0001"],
      [CHAVES.FINALIZACAO, `FIN${nsu}`],
      [CHAVES.COD_OPERACAO, 0], [CHAVES.MSG_OPERACAO, "TRANSACAO APROVADA"],
      [CHAVES.TEXTO_OPERADOR, "Transação aprovada"],
      [CHAVES.RETORNO, op === "CRT" ? 0 : 1], [CHAVES.REQUER_CONFIRMACAO, op === "CRT" ? 2 : 1],
      [CHAVES.N_LINHAS_CUPOM, linhas.length],
    ];
    linhas.forEach((l, i) => { pares.push([`713-${String(i).padStart(3, "0")}`, l]); pares.push([`715-${String(i).padStart(3, "0")}`, l]); });
    gravar(arqResp, montar(pares));
    log(`APROVADA · NSU ${nsu} · ${rede} ${produto}`);
    return;
  }

  if (op === "ADM") {
    await dormir(1000);
    gravar(arqResp, montar([[CHAVES.OPERACAO, op], [CHAVES.ID, id], [CHAVES.STATUS, "OK"], [CHAVES.COD_OPERACAO, 0], [CHAVES.MSG_OPERACAO, "OK"], [CHAVES.RETORNO, 1], [CHAVES.REQUER_CONFIRMACAO, 1]]));
    return;
  }
  gravar(arqResp, montar([[CHAVES.OPERACAO, op], [CHAVES.ID, id], [CHAVES.COD_OPERACAO, 2], [CHAVES.MSG_OPERACAO, "OPERACAO NAO SUPORTADA NO SIMULADOR"], [CHAVES.RETORNO, 2]]));
}

log(`olhando ${pastaReq} (Ctrl+C pra sair)`);
let processando = false;
setInterval(async () => {
  if (processando || !existsSync(arqReq)) return;
  processando = true;
  try {
    const texto = readFileSync(arqReq, "latin1");
    if (!texto.includes(CHAVES.FIM)) return; // ainda sendo escrito
    try { unlinkSync(arqReq); } catch { /* ok */ }
    await responder(ler(texto).campos);
  } catch (e) {
    log(`erro: ${e.message}`);
  } finally {
    processando = false;
  }
}, 200);
