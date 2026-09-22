"use client";

import { useState } from "react";
import { Combobox, type ComboOpt } from "@/components/combobox";

// UM CAMPO DE ESCOLHA QUE ACEITA DIGITAR, DENTRO DE UM FORMULÁRIO COMUM.
//
// O `<select>` do navegador não deixa procurar: com 117 categorias, achar
// "Laticínios e Frios" virava rolar a lista inteira. O sistema já tinha o
// componente de busca (`Combobox`), mas ele guarda a escolha em memória — e
// os filtros dessas telas são formulários de verdade, que enviam ao servidor.
//
// Este daqui é a ponte: mantém a escolha, mostra a busca, e coloca o valor
// num campo escondido com o nome que o formulário espera. Do lado do servidor
// nada muda: continua chegando o mesmo `cat=<id>` de antes.
export function EscolhaComBusca({
  name,
  opcoes,
  inicial = "",
  rotuloVazio = "Todas",
  className = "",
  obrigatorio,
}: {
  name: string;
  opcoes: ComboOpt[];
  inicial?: string;
  /** Sem escolha, o formulário não envia. */
  obrigatorio?: boolean;
  /** O que aparece quando nada está escolhido (e a opção pra limpar). */
  rotuloVazio?: string;
  className?: string;
}) {
  const [valor, setValor] = useState(inicial);
  // A opção vazia entra na lista pra dar como VOLTAR atrás: sem ela, escolhida
  // uma categoria não haveria jeito de tirar o filtro sem recarregar a tela.
  // Quando é obrigatório, não existe "vazio" pra escolher — senão a pessoa
  // poderia escolher o nada e achar que preencheu.
  const lista: ComboOpt[] = obrigatorio ? opcoes : [{ value: "", label: rotuloVazio }, ...opcoes];
  return (
    <Combobox
      name={name}
      options={lista}
      value={valor}
      onChange={setValor}
      placeholder={rotuloVazio}
      className={className}
      required={obrigatorio}
    />
  );
}
