"use client";

import { confirmar, enviarSeConfirmar } from "@/components/dialogo";

// Formulário que pergunta antes de enviar. Serve pras telas montadas no servidor,
// que não conseguem chamar `confirmar` sozinhas:
//
//   <FormConfirmado action={excluirCupom} pergunta="Excluir o cupom X?" okTexto="Excluir">
//     <input type="hidden" name="id" value={c.id} />
//     <Enviar>excluir</Enviar>
//   </FormConfirmado>
export function FormConfirmado({
  action,
  pergunta,
  detalhe,
  okTexto,
  perigo = true,
  className,
  children,
}: {
  action: (fd: FormData) => void | Promise<void>;
  pergunta: string;
  detalhe?: string;
  okTexto?: string;
  perigo?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={enviarSeConfirmar(() => confirmar(pergunta, { detalhe, perigo, okTexto }))}
    >
      {children}
    </form>
  );
}
