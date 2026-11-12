// Telefone de cliente pra BUSCA (DEL-05). O cadastro guarda do jeito que veio
// ("(51) 99999-9999", "5551999999999"...); a coluna clientes.telefone_digitos
// (migration 0310) tem só os 11 últimos números. Aqui sai a lista de formas
// que valem como "o mesmo telefone": com e sem o 55, com e sem o 9 do celular.

/** Só os números, sem o 55 do país na frente. */
export function foneDigitos(t: string | null | undefined): string {
  let d = String(t ?? "").replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return d;
}

/** Valores de telefone_digitos que casam com o número digitado (DDD obrigatório). */
export function foneCandidatos(t: string | null | undefined): string[] {
  const d = foneDigitos(t);
  if (d.length < 10 || d.length > 11) return [];
  const out = new Set<string>([d]);
  // Celular com o 9 (11 dígitos) também casa com o cadastro antigo sem o 9, e vice-versa.
  if (d.length === 11 && d[2] === "9") out.add(d.slice(0, 2) + d.slice(3));
  if (d.length === 10 && /[6-9]/.test(d[2])) out.add(d.slice(0, 2) + "9" + d.slice(2));
  return [...out];
}
