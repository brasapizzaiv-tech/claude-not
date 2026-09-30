import type { Metadata } from "next";
import { CONTATO_EMAIL, CORES, FONTE_TITULO } from "../marca";

export const metadata: Metadata = {
  title: "Política de privacidade · Motelli",
  description: "O que o Motelli e o app Motelli Entregador coletam, por quê, por quanto tempo e como pedir seus dados.",
};

// A empresa responsável só aparece aqui, porque a LGPD manda dizer quem
// responde pelos dados. É a razão social do cartão CNPJ (a marca é Motelli;
// o nome da empresa não aparece em mais nenhum lugar público).
const RESPONSAVEL = {
  razaoSocial: "VTM Store Ltda",
  cnpj: "67.140.718/0001-54",
};

const ATUALIZADA_EM = "30 de setembro de 2026";

// A política é escrita como conversa, não como contrato: quem lê é o
// entregador ou o dono do restaurante, no celular. Cada seção responde uma
// pergunta que essa pessoa faria.
const SECOES: { titulo: string; paragrafos: (string | string[])[] }[] = [
  {
    titulo: "Do que esta política trata",
    paragrafos: [
      "Do aplicativo Motelli Entregador, disponível na Google Play, e das telas do sistema Motelli que o entregador abre por ele. O Motelli é um sistema de gestão para restaurantes; cada restaurante que o usa é responsável pelos dados das pessoas que trabalham com ele, e o Motelli guarda e processa esses dados em nome do restaurante.",
    ],
  },
  {
    titulo: "Quem responde pelos dados",
    paragrafos: [
      `O Motelli é mantido por ${RESPONSAVEL.razaoSocial}, CNPJ ${RESPONSAVEL.cnpj}, que atua como operadora dos dados. O restaurante que cadastrou o entregador é o controlador: é ele quem decide para que os dados servem e quem os vê. Para falar com o Motelli sobre privacidade: ${CONTATO_EMAIL}.`,
    ],
  },
  {
    titulo: "O que o app coleta",
    paragrafos: [
      "Identificação do entregador: nome e telefone, cadastrados pelo restaurante, e o link pessoal de acesso, que funciona como a senha do entregador dentro do app.",
      "Localização precisa: enquanto o app está em uso e também em segundo plano, com a tela apagada ou o app fechado, durante o período em que o entregador está ativo para entregas. O Android mostra uma notificação fixa sempre que a localização está sendo enviada. A posição vai para o sistema do restaurante que cadastrou o entregador.",
      "Câmera: só para ler o QR code do cupom da entrega. Nenhuma foto é gravada nem enviada.",
      "Dados técnicos: versão do app, modelo do aparelho e horários das operações, usados para o app funcionar e para resolver problemas.",
      "O app não acessa contatos, mensagens, fotos, microfone nem outros aplicativos.",
    ],
  },
  {
    titulo: "Para que a localização serve",
    paragrafos: [
      "Para o restaurante distribuir as entregas, ver onde cada entregador está, dizer ao cliente quando o pedido chega e fechar o acerto do dia. A localização em segundo plano existe porque o entregador está na rua com o celular no bolso: sem ela, o restaurante só saberia a posição quando o app estivesse aberto na tela.",
      "A localização não é usada para publicidade e não é vendida nem cedida a terceiros.",
    ],
  },
  {
    titulo: "Quem vê os dados",
    paragrafos: [
      "O restaurante que cadastrou o entregador, pelas telas de gestão dele. O Motelli, para hospedar e manter o sistema. Os provedores de nuvem onde o sistema roda, que guardam os dados em nome do Motelli e não os usam para nada mais. Autoridades, quando a lei obrigar.",
    ],
  },
  {
    titulo: "Por quanto tempo",
    paragrafos: [
      "As posições enviadas pelo app são apagadas automaticamente depois de 90 dias. O cadastro do entregador fica enquanto ele estiver ativo no restaurante e pelo prazo que a lei exigir para registros de trabalho e pagamento. Quando o restaurante desativa o entregador, o link pessoal deixa de funcionar na hora.",
    ],
  },
  {
    titulo: "Seus direitos",
    paragrafos: [
      "Pela Lei Geral de Proteção de Dados (Lei 13.709/2018), você pode pedir para saber quais dados existem sobre você, corrigi-los, pedir que sejam apagados e revogar o consentimento. Peça primeiro ao restaurante, que é o responsável; se preferir, escreva para o Motelli no e-mail acima e a gente encaminha.",
      "Você também pode desligar a localização a qualquer momento nas configurações do celular ou desinstalar o app. Nesse caso o restaurante deixa de receber a sua posição e pode não conseguir distribuir entregas para você.",
    ],
  },
  {
    titulo: "Segurança",
    paragrafos: [
      "Toda comunicação do app com o sistema é criptografada (HTTPS). O link pessoal é único, longo e pode ser trocado pelo restaurante. Os dados de cada restaurante ficam separados dos demais.",
    ],
  },
  {
    titulo: "Idade mínima",
    paragrafos: ["O app é para quem trabalha com entregas e não se destina a menores de 18 anos."],
  },
  {
    titulo: "Mudanças nesta política",
    paragrafos: [
      `Quando algo mudar, a versão nova é publicada nesta página com a data atualizada. Última atualização: ${ATUALIZADA_EM}.`,
    ],
  },
];

export default function PrivacidadePage() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px 56px" }}>
      <h1 style={{ fontFamily: FONTE_TITULO, fontSize: "clamp(32px, 5vw, 44px)", letterSpacing: "-0.03em", lineHeight: 1.05, margin: "0 0 12px" }}>
        Política de privacidade
      </h1>
      <p style={{ color: CORES.suave, fontSize: 17, lineHeight: 1.5, margin: "0 0 36px" }}>
        Do Motelli e do app Motelli Entregador. Escrita para ser lida, não só aceita.
      </p>
      {SECOES.map((s) => (
        <section key={s.titulo} style={{ padding: "22px 0", borderTop: `1px solid ${CORES.linha}` }}>
          <h2 style={{ fontFamily: FONTE_TITULO, fontSize: 21, letterSpacing: "-0.02em", margin: "0 0 10px" }}>{s.titulo}</h2>
          {s.paragrafos.map((p, i) => (
            <p key={i} style={{ margin: "0 0 10px", lineHeight: 1.6, fontSize: 16.5 }}>{p}</p>
          ))}
        </section>
      ))}
    </main>
  );
}
