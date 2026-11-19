// Configuração PÚBLICA do Supabase (URL + chave anon).
//
// Estes dois valores são públicos por design: o Supabase os envia para o
// navegador de todo visitante, e a segurança é garantida pelas regras de
// acesso (RLS) no banco.
//
// UM CÓDIGO, DOIS BANCOS (decisão 2 do multiempresa): o projeto da Vercel dos
// clientes aponta pro banco dos clientes pelas variáveis
// NEXT_PUBLIC_BANCO_URL e NEXT_PUBLIC_BANCO_ANON_KEY. Sem elas vale o
// banco da Brasa, escrito aqui — então o projeto da Brasa não depende de
// variável nenhuma e continua exatamente como era. As duas andam juntas: só
// uma preenchida seria endereço de um banco com a chave de outro, e aí fica o
// da Brasa.
//
// Nomes novos de propósito: o projeto da Brasa tem NEXT_PUBLIC_SUPABASE_URL e
// _ANON_KEY antigas (de antes deste arquivo) e não dá pra ver o valor delas.
// Com nomes que só o projeto dos clientes tem, a Brasa não muda nada.
//
// A chave SECRETA (service_role) NÃO fica aqui — ela vem de variável de
// ambiente (SUPABASE_SERVICE_ROLE_KEY) e só é usada no servidor.
const BRASA_URL = "https://kuyygscltzqktcpicsmg.supabase.co";
const BRASA_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eXlnc2NsdHpxa3RjcGljc21nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MDQ4MzQsImV4cCI6MjEwMTk4MDgzNH0.6NjcSOPO0w0gKRQimwFenupWaonxUKGbUiARpobRKPs";

const urlEnv = process.env.NEXT_PUBLIC_BANCO_URL?.trim();
const anonEnv = process.env.NEXT_PUBLIC_BANCO_ANON_KEY?.trim();
const doAmbiente = !!(urlEnv && anonEnv);

export const SUPABASE_URL = doAmbiente ? urlEnv! : BRASA_URL;
export const SUPABASE_ANON_KEY = doAmbiente ? anonEnv! : BRASA_ANON_KEY;
