// Configuração PÚBLICA do Supabase (URL + chave anon).
//
// Estes dois valores são públicos por design: o Supabase os envia para o
// navegador de todo visitante, e a segurança é garantida pelas regras de
// acesso (RLS) no banco. Por isso podem ficar no código, evitando depender de
// variáveis de ambiente frágeis na hospedagem.
//
// A chave SECRETA (service_role) NÃO fica aqui — ela vem de variável de
// ambiente (SUPABASE_SERVICE_ROLE_KEY) e só é usada no servidor.
export const SUPABASE_URL = "https://kuyygscltzqktcpicsmg.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eXlnc2NsdHpxa3RjcGljc21nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MDQ4MzQsImV4cCI6MjEwMTk4MDgzNH0.6NjcSOPO0w0gKRQimwFenupWaonxUKGbUiARpobRKPs";
