// Cria um usuário no sistema (via Supabase Admin).
// Uso: node scripts/criar-usuario.mjs <email> <senha> <nome> [papel]
// papel: dono | comprador | conferente  (padrão: comprador)
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const [, , email, senha, nome, papel = "comprador"] = process.argv;

if (!email || !senha || !nome) {
  console.error(
    "Uso: node scripts/criar-usuario.mjs <email> <senha> <nome> [papel]",
  );
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password: senha,
  email_confirm: true,
  user_metadata: { nome },
});

if (error) {
  console.error("❌ Erro:", error.message);
  process.exit(1);
}

// Ajusta o papel no perfil (o perfil é criado pelo gatilho no banco).
const { error: e2 } = await supabase
  .from("profiles")
  .update({ nome, papel })
  .eq("id", data.user.id);

if (e2) {
  console.error("⚠ Usuário criado, mas falhou ao definir papel:", e2.message);
} else {
  console.log(`✓ Usuário criado: ${email} (papel: ${papel})`);
}
