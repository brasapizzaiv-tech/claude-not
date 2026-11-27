// Item vendido "em dobro" (ex.: chopp, 27/11/2026): o preço do item é a
// METADE do par (2 copos = preço cheio de 1). O garçom lança um copo por vez;
// no caixa, número ímpar avisa e o caixa lança mais 1 — o copo sozinho paga
// inteiro. Vale pra qualquer item com "em dobro" no nome.
export const ehEmDobro = (nome: string) => /\bem dobro\b/i.test(String(nome || ""));
