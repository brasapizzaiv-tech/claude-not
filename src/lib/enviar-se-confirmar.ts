// Formulário que só envia depois de confirmar (ACE-01).
//
// NÃO dá pra fazer `onSubmit={async (e) => { if (!await confirmar()) e.preventDefault() }}`:
// quando a função para no `await`, o evento já acabou sem ser impedido e o React
// dispara a `action` na hora — a exclusão saía com a pergunta ainda aberta.
// Aqui o envio é sempre segurado; se a pessoa confirmar, o formulário é enviado de
// novo (com o mesmo botão), e esse segundo envio passa direto.

type FormLike = { isConnected: boolean; requestSubmit: (b?: HTMLButtonElement) => void };
type EventoEnvio = {
  currentTarget: FormLike;
  preventDefault: () => void;
  nativeEvent: { submitter?: unknown };
};

const liberados = new WeakSet<object>();

export function enviarSeConfirmar(
  pergunta: () => Promise<boolean> | boolean,
): (e: EventoEnvio) => void {
  return (e) => {
    const form = e.currentTarget;
    if (liberados.has(form)) { liberados.delete(form); return; }
    e.preventDefault();
    const botao = e.nativeEvent.submitter as HTMLButtonElement | null | undefined;
    void Promise.resolve(pergunta()).then((ok) => {
      if (!ok || !form.isConnected) return;
      liberados.add(form);
      form.requestSubmit(botao && (botao as { form?: unknown }).form === form ? botao : undefined);
    });
  };
}
