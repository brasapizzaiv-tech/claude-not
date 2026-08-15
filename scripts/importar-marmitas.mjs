import { readFileSync } from 'node:fs';
import dotenv from 'dotenv'; dotenv.config({path:'.env.local'});
import pg from 'pg';
const F = 'C:/Users/NeoTech/OneDrive/Desktop/claude app buffet/marmitas-online/marmitas-dados.sql';
const linhas = readFileSync(F,'utf8').split(/\r?\n/);
const c = new pg.Client({connectionString: process.env.DATABASE_URL, ssl:{rejectUnauthorized:false}});
await c.connect();
// limpa antes (import limpo)
await c.query('delete from mkt_config'); await c.query('delete from mkt_pedidos');
let cfg=0, ped=0, err=0;
for(let sql of linhas){
  sql = sql.trim();
  if(!sql.startsWith('INSERT INTO')) continue;
  try{
    if(sql.startsWith('INSERT INTO "config"')){
      sql = sql.replace('INSERT INTO "config"','INSERT INTO mkt_config');
      await c.query(sql); cfg++;
    } else if(sql.startsWith('INSERT INTO "pedidos"')){
      sql = sql.replace('INSERT INTO "pedidos"','INSERT INTO mkt_pedidos')
               .replace(/,1,'colaborador'/g, ",'Salada','colaborador'").replace(/,0,'colaborador'/g, ",'','colaborador'")
               .replace(/,1,'buffet'/g, ",'Salada','buffet'").replace(/,0,'buffet'/g, ",'','buffet'");
      await c.query(sql); ped++;
    }
  }catch(e){ err++; if(err<=3) console.log('ERRO:', e.message, '\n  em:', sql.slice(0,120)); }
}
console.log(`\nconfig: ${cfg} | pedidos: ${ped} | erros: ${err}`);
// verifica
const nColab = JSON.parse((await c.query(`select valor from mkt_config where chave='colaboradores'`)).rows[0]?.valor||'[]').length;
const nUser = JSON.parse((await c.query(`select valor from mkt_config where chave='usuarios'`)).rows[0]?.valor||'[]').length;
console.log('colaboradores importados:', nColab, '| usuarios:', nUser, '| pedidos:', (await c.query('select count(*) n from mkt_pedidos')).rows[0].n);
await c.end();
