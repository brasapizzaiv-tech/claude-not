import { readFileSync, writeFileSync } from 'node:fs';
import dotenv from 'dotenv'; dotenv.config({path:'.env.local'});
import pg from 'pg';

const COMMIT = process.argv.includes('--commit');
const f = 'C:/Users/NeoTech/Downloads/Relatório de Contas a Pagar (10).xls';
const html = readFileSync(f, 'utf8');
const rows = [...html.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(m=>m[0]);
const cell = tr => [...tr.matchAll(/<t[dh][\s\S]*?>([\s\S]*?)<\/t[dh]>/gi)].map(c=>c[1].replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim());
const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const stripCode = s => s.replace(/^\d+\.\d+\.\s*/,'').trim();
const parseVal = s => Number(String(s).replace(/[R$\s]/g,'').replace(/\./g,'').replace(',','.'))||0;
const ddmmyyyy = s => { const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec((s||'').trim()); return m?`${m[3]}-${m[2]}-${m[1]}`:null; };
const isoDate = s => /^\d{4}-\d{2}-\d{2}$/.test((s||'').trim()) ? s.trim() : ddmmyyyy(s);

const alias = { // categoria do arquivo (1o segmento, normalizado) -> nome no nosso DRE
  'fruteira':'Hortifruti','frango':'Aves','aguas refrigerantes sucos':'Águas e Refrigerantes',
  'material de limpeza':'Materiais de Limpeza','gratificacoes e metas':'Outras despesas com pessoal',
  'diversos variaveis':'Outras administrativas','gas para aquecedores':'Conta de Gás',
  'embalagens venda direta':'Embalagens','salario free noite':'CMO Eventual / Diaristas',
  'salario free dia':'CMO Eventual / Diaristas','salario garcom associacao':'Salários',
  'salario carteira':'Salários',
};

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
const dre = (await c.query('select id, nome from dre_categorias')).rows.map(d=>({id:d.id,n:norm(d.nome),nome:d.nome}));
const byNome = nome => dre.find(d=>d.n===norm(nome));
const fallback = byNome('Outras administrativas');
function catId(catRaw){
  const first = stripCode((catRaw||'').split(',')[0]); const nf=norm(first);
  if(alias[nf]){ const t=byNome(alias[nf]); if(t) return t.id; }
  let m=dre.find(d=>d.n===nf) || dre.find(d=>d.n.includes(nf)||nf.includes(d.n));
  return (m||fallback)?.id ?? null;
}

const data = rows.slice(1).map(cell).filter(c=>c.length>=8 && c[4]);
let total=0, aberto=0, semCat=0;
const regs = data.map(r=>{
  const valor=parseVal(r[4]);
  const pago=/pago/i.test(r[7]);
  const liq=isoDate(r[6]);
  const venc=isoDate(r[5]);
  let dt = (pago && liq && liq.startsWith('2026-07')) ? liq : (venc && venc.startsWith('2026-07') ? venc : '2026-07-31');
  const cid=catId(r[2]);
  if(!cid || cid===fallback?.id) semCat++;
  total+=valor; if(!pago) aberto+=valor;
  const metodos=['dinheiro','pix','cartao','credito','debito','transferencia','boleto','cheque'];
  let desc=(r[1]||'').replace(/^Pagamento\s+/i,'').trim();
  let forma=null; const toks=desc.split(/\s+/); const last=toks[toks.length-1];
  if(toks.length>1 && metodos.includes(norm(last))){ forma=last; desc=toks.slice(0,-1).join(' ').trim(); }
  return { data:dt, descricao:desc, valor, forma_pagamento:forma,
    vencimento:venc, pago, pago_em: pago?liq:null, categoria_id:cid, origem:'manual' };
});

console.log(COMMIT?'=== GRAVANDO ===':'=== TESTE (sem gravar) ===');
console.log('Registros:', regs.length, '| Total R$', total.toFixed(2), '| Em aberto R$', aberto.toFixed(2));
console.log('Sem categoria específica (foram p/ Outras administrativas):', semCat);
console.log('\nAmostra (5):');
regs.slice(0,5).forEach(r=>console.log('  ', r.data, '|', r.descricao.slice(0,32), '| R$', r.valor, '|', r.pago?'PAGO':'ABERTO', '| cat', dre.find(d=>d.id===r.categoria_id)?.nome));

if(COMMIT){
  const ids=[];
  for(const r of regs){
    const q=await c.query(
      `insert into lancamentos (data, descricao, valor, forma_pagamento, vencimento, pago, pago_em, categoria_id, origem)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'manual') returning id`,
      [r.data, r.descricao, r.valor, r.forma_pagamento, r.vencimento, r.pago, r.pago_em, r.categoria_id]);
    ids.push(q.rows[0].id);
  }
  writeFileSync('scripts/_lote-julho-ids.json', JSON.stringify(ids));
  console.log('\n✅ Gravados', ids.length, 'lançamentos. IDs salvos em scripts/_lote-julho-ids.json (para desfazer se precisar).');
}
await c.end();
