import { CupomEscPos } from "@/lib/escpos";
import type { ComprovanteTef } from "@/lib/tef-comprovante-pdf";

// Comprovante do cartão (TEF) em ESC/POS: as linhas vêm prontas do gerenciador
// (38–40 colunas, já alinhadas). Fonte da própria térmica, preta e nítida —
// o PDF passava pelo driver do Windows e saía cinza, quase ilegível (08/10/2026).
// O PDF continua existindo pro agente antigo e pra tela.
export function gerarComprovanteTefEscPos(d: ComprovanteTef, cols: 32 | 48 = 48): Buffer {
  const c = new CupomEscPos(cols);
  c.init().alinhar("c").negrito(true).tamanho(1, 2).linha(d.titulo).tamanho(1, 1).negrito(false).pular(1);
  c.alinhar("l");
  // No papel de 58 mm (32 colunas) as linhas de 40 não cabem: fonte B (condensada,
  // ~42 colunas) resolve sem quebrar o alinhamento que o gerenciador fez.
  const maior = Math.max(1, ...d.linhas.map((l) => l.length));
  const condensar = maior > cols;
  if (condensar) c.raw(0x1b, 0x4d, 1);
  for (const linha of d.linhas) c.linha(linha.replace(/\s+$/, "") || " ");
  if (condensar) c.raw(0x1b, 0x4d, 0);
  if (d.rodape) c.pular(1).alinhar("c").paragrafo(d.rodape);
  c.pular(3).cortar();
  return c.bytes();
}
