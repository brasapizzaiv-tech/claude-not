// TESTE DE ISOLAMENTO — um restaurante consegue ver os dados do outro?
//
// Roda contra o banco de verdade, dentro de uma transação que volta atrás no
// fim. Nada do que ele faz sobrevive, nem se quebrar no meio.
//
// Como funciona: cria duas empresas de mentira (A e B) com um dono cada e,
// tabela por tabela, EMPRESTA uma linha real da Brasa pra empresa B por um
// instante. Então age como o dono da A e tenta ler e mexer nela.
//
// Emprestar em vez de inventar uma linha foi o que fez o teste valer: linha
// inventada esbarra em coluna obrigatória, em "o status tem que ser um
// destes" e em chave repetida — na primeira versão deste arquivo 24 das 26
// tabelas ficaram sem teste. Emprestando, o banco não reclama de nada,
// porque a linha já era válida, e o teste passa a valer sobre dado de
// verdade.
//
// Uso: node scripts/isolamento.mjs
//
//   ✅ a empresa A não enxergou nem gravou nada da B
//   ❌ vazou — é pra parar tudo
//   ⚠  não deu pra montar o caso (a tabela está vazia, então não há o que
//      vazar hoje — mas fica POR CONFERIR quando ela tiver dado).
import pg from "pg";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const BRASA = "00000000-0000-4000-8000-000000000001";
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const USER_A = "aaaaaaaa-1111-4000-8000-000000000001";
const USER_B = "bbbbbbbb-1111-4000-8000-000000000002";

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

/** Age como um usuário logado daquela empresa — é assim que o Supabase fala
 *  com o banco: papel `authenticated` e o id do usuário no pedido. */
async function comoUsuario(uid, fn) {
  await c.query("set local role authenticated");
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: "authenticated" }),
  ]);
  try {
    return await fn();
  } finally {
    await c.query("reset role");
  }
}

const ok = [];
const vazou = [];
const naoTestei = [];
const semDado = []; // vazias, mas com a regra certa

try {
  await c.query("begin");
  await c.query(
    `insert into empresas (id, nome, slug) values ($1,'Teste A','zz-teste-a'), ($2,'Teste B','zz-teste-b')`,
    [A, B],
  );
  for (const [uid, emp, mail] of [[USER_A, A, "zz-a@teste.invalid"], [USER_B, B, "zz-b@teste.invalid"]]) {
    await c.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                               created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
               $2, '', now(), now(), '{}'::jsonb, jsonb_build_object('empresa_id', $3::text))`,
      [uid, mail, emp],
    );
    const { rows } = await c.query(`select empresa_id from profiles where id = $1`, [uid]);
    if (rows[0]?.empresa_id !== emp) {
      throw new Error(`perfil ${mail} nasceu na empresa errada (${rows[0]?.empresa_id})`);
    }
  }
  console.log("dois donos criados, cada um na sua empresa ✅\n");

  const { rows: tabelas } = await c.query(`
    select t.tablename tabela
      from pg_tables t
     where t.schemaname = 'public'
       and exists (select 1 from information_schema.columns col
                    where col.table_schema='public' and col.table_name=t.tablename
                      and col.column_name='empresa_id')
       and t.tablename not in ('profiles','colaboradores')
     order by t.tablename`);

  for (const { tabela } of tabelas) {
    // Em vez de INVENTAR uma linha (que esbarra em coluna obrigatória, em
    // "status tem que ser um destes" e em chave repetida), EMPRESTO uma linha
    // real: passo uma linha da Brasa pra empresa B por um instante. Nenhuma
    // regra do banco reclama, porque a linha já é válida — e o teste passa a
    // valer sobre dado de verdade.
    const { rows: pk } = await c.query(
      `select a.attname nome
         from pg_index i join pg_attribute a
           on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
        where i.indrelid = ('public.' || $1)::regclass and i.indisprimary`,
      [tabela],
    );
    if (!pk.length) { naoTestei.push(`${tabela} — sem chave primária`); continue; }
    const cond = pk.map((k, i) => `"${k.nome}" = $${i + 1}`).join(" and ");

    const { rows: alvo } = await c.query(
      `select ${pk.map((k) => `"${k.nome}"`).join(", ")} from public.${tabela}
        where empresa_id = $1 limit 1`,
      [BRASA],
    );
    if (!alvo.length) {
      // Tabela vazia: não há linha pra emprestar, então não dá pra provar pelo
      // uso. Dá pra conferir a REGRA: se ela exige a empresa nas duas pontas
      // (ler e gravar), a tabela nasce protegida quando receber o primeiro
      // dado. É menos que o teste de verdade, e por isso vai separado.
      const { rows: pol } = await c.query(
        `select coalesce(qual,'') q, coalesce(with_check,'') w
           from pg_policies where schemaname='public' and tablename=$1`,
        [tabela],
      );
      const fechada =
        pol.length > 0 &&
        pol.every((x) => x.q.includes("empresa_atual()") && x.w.includes("empresa_atual()"));
      if (fechada) semDado.push(tabela);
      else naoTestei.push(`${tabela} — vazia E sem regra por empresa`);
      continue;
    }
    const valores = pk.map((k) => alvo[0][k.nome]);

    await c.query("savepoint emprestar");
    await c.query(
      `update public.${tabela} set empresa_id = $${pk.length + 1} where ${cond}`,
      [...valores, B],
    );

    // Agora o dono da empresa A tenta ver e mexer no que é da B.
    const vistos = await comoUsuario(USER_A, async () => {
      const r = await c.query(
        `select count(*)::int n from public.${tabela} where empresa_id = $1`, [B]);
      return r.rows[0].n;
    });

    let mexeu = 0;
    try {
      await c.query("savepoint tentativa");
      mexeu = await comoUsuario(USER_A, async () => {
        const r = await c.query(
          `update public.${tabela} set empresa_id = $1 where ${cond}`,
          [A, ...valores],
        );
        return r.rowCount;
      });
      await c.query("rollback to savepoint tentativa");
    } catch {
      await c.query("rollback to savepoint tentativa");
    }

    await c.query("rollback to savepoint emprestar");

    if (vistos > 0 || mexeu > 0) {
      vazou.push(
        `${tabela}${vistos > 0 ? ` · leu ${vistos} linha(s) da outra` : ""}${mexeu > 0 ? " · ROUBOU a linha da outra" : ""}`,
      );
    } else {
      ok.push(tabela);
    }
  }

  // ---------- O caminho que passa por cima das regras ----------
  // A busca de produto do app de contagem é SECURITY DEFINER: as regras não
  // valem lá dentro. Se ela vazar, o teste acima não veria.
  try {
    await c.query("savepoint rpc");
    await c.query(
      `insert into produtos (nome, empresa_id, ativo) values ('Farinha secreta zzA', $1, true)`, [A]);
    const { rows: colab } = await c.query(
      `insert into colaboradores (nome, empresa_id, token)
       select 'Fulano zzB', $1, 'zzcolabtokenb' returning id`, [B]);
    const { rows: ct } = await c.query(
      `insert into contagens (descricao, status, empresa_id) values ('zz teste B','rascunho',$1) returning id`, [B]);
    await c.query(
      `insert into contagem_links (contagem_id, colaborador_id, token, empresa_id)
       values ($1,$2,'zztokencontagemb',$3)`, [ct[0].id, colab[0].id, B]);
    const { rows: busca } = await c.query(
      `select contar_buscar_produtos('zztokencontagemb','farinha') r`);
    if (JSON.stringify(busca[0].r).includes("secreta")) {
      vazou.push("contar_buscar_produtos · a contagem da B achou produto da A");
    } else {
      ok.push("contar_buscar_produtos (função do app de contagem)");
    }
    await c.query("rollback to savepoint rpc");
  } catch (e) {
    await c.query("rollback to savepoint rpc").catch(() => {});
    naoTestei.push(`contar_buscar_produtos — ${e.message.split("\n")[0].slice(0, 80)}`);
  }

  await c.query("rollback");

  console.log(`✅ isoladas: ${ok.length}`);
  console.log(`   ${ok.join(", ")}`);
  if (semDado.length) {
    console.log(`
◻ vazias, regra conferida (nada pra vazar hoje): ${semDado.length}`);
    console.log(`   ${semDado.join(", ")}`);
  }
  if (naoTestei.length) {
    console.log(`\n⚠  por conferir à mão: ${naoTestei.length}`);
    for (const t of naoTestei) console.log(`   ${t}`);
  }
  if (vazou.length) {
    console.log(`\n❌ VAZAMENTO: ${vazou.length}`);
    for (const t of vazou) console.log(`   ${t}`);
    process.exitCode = 1;
  } else {
    console.log(`\n❌ vazamentos: nenhum`);
  }
  console.log("\n↩ rollback: as empresas de teste não existem mais.");
} catch (e) {
  await c.query("rollback").catch(() => {});
  console.error("ERRO:", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
