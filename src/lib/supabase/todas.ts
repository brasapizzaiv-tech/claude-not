// O banco (PostgREST) devolve no máximo 1000 linhas por consulta — pedir
// .limit(5000) não adianta, vêm 1000 e o resto some em silêncio. Para listas
// que podem passar disso, busca em páginas de 1000 até acabar.
//
// Uso: a função recebe a faixa e monta a consulta INTEIRA de novo a cada
// página, sempre com uma ordem que não empata (termine em .order("id")),
// senão uma linha pode cair em duas páginas e outra em nenhuma:
//
//   const linhas = await buscarTodas<Linha>((de, ate) =>
//     supabase.from("tabela").select("...").order("data").order("id").range(de, ate),
//   );
export const PAGINA = 1000;

export async function buscarTodas<T>(
  pagina: (de: number, ate: number) => PromiseLike<{ data: unknown; error: unknown }>,
  maximo = 20000,
): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; de < maximo; de += PAGINA) {
    const { data, error } = await pagina(de, de + PAGINA - 1);
    if (error) break;
    const lote = (data as T[] | null) ?? [];
    todas.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return todas;
}

// .in("id", lista) com lista grande: a lista vai inteira no endereço da
// consulta (que tem tamanho máximo) e a resposta também corta em 1000.
// Busca em lotes pequenos e junta tudo.
export async function buscarPorLotes<T>(
  ids: string[],
  consulta: (lote: string[]) => PromiseLike<{ data: unknown; error: unknown }>,
  tamanho = 150,
): Promise<T[]> {
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += tamanho) lotes.push(ids.slice(i, i + tamanho));
  const respostas = await Promise.all(lotes.map((l) => consulta(l)));
  return respostas.flatMap((r) => (r.data as T[] | null) ?? []);
}
