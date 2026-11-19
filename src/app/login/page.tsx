import { lerMarca } from "@/lib/marca";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const { logoUrl, nome } = await lerMarca();
  return <LoginForm logoUrl={logoUrl} nome={nome} />;
}
