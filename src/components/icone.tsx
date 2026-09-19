import {
  Ban, Banknote, Bell, Bike, BookOpen, Building2, Cake, Calculator, CalendarClock, CalendarDays,
  Camera, ChartColumn, ChartLine, Check, ChefHat, ChevronRight, CircleAlert, CircleCheck,
  CircleDollarSign, CircleHelp, CircleX, ClipboardCheck, ClipboardList, Clock, Coins, CookingPot,
  CreditCard, Crown, CupSoda, DoorOpen, Download, Eye, EyeOff, FileText, Flame, Gift, Globe,
  Hourglass, House, IdCard, Inbox, KeyRound, Landmark, Laptop, ListChecks, Lock, LogOut, Map,
  MapPin, Megaphone, MessageSquare, Monitor, Moon, Package, PartyPopper, Pencil, Percent, Phone,
  PiggyBank, Pizza, Plus, Printer, Receipt, RefreshCw, RotateCcw, Salad, Scale, Scissors, Search,
  Send, Settings, ShoppingBag, ShoppingCart, Smartphone, Snowflake, Sparkles, Split, Star, Store,
  Sun, HandPlatter, Target,
  Thermometer, Ticket, Trash2, TreePalm, TrendingDown, TrendingUp, TriangleAlert, Truck, Tv, Upload, User,
  UserCheck, UserMinus, Users, UtensilsCrossed, Volume2, Wallet, Wrench, X, Zap,
  type LucideIcon,
} from "lucide-react";

// Ícones do sistema.
//
// Antes cada tela escrevia um emoji direto no código. Emoji tem três problemas:
// muda de desenho em cada aparelho (o do Android não é o do iPhone nem o do
// Windows), não aceita a cor do tema, e desalinha com o texto. Aqui todos viram
// desenho de traço, na cor de quem está em volta (currentColor).
//
// Como usar:   <Icone nome="lixeira" />            tamanho padrão, 18px
//              <Icone nome="pizza" tamanho={22} />
//              <Icone nome="alerta" titulo="Atenção" />   quando o ícone está
//              sozinho e precisa ser lido por leitor de tela.
//
// Pra trocar o conjunto de ícones inteiro um dia, mexe só neste arquivo.

const MAPA = {
  // Comida e salão
  pizza: Pizza,
  salao: UtensilsCrossed,
  cozinha: ChefHat,
  panela: CookingPot,
  salada: Salad,
  bebida: CupSoda,
  marmita: Package,
  bolo: Cake,
  fogo: Flame,
  gelo: Snowflake,
  temperatura: Thermometer,
  balanca: Scale,
  viagem: ShoppingBag,   // pedido pra levar
  garcom: HandPlatter,

  // Turno (o dia e a noite da escala, não o tema da tela)
  dia: Sun,
  noite: Moon,

  // Dinheiro
  dinheiro: Banknote,
  cartao: CreditCard,
  carteira: Wallet,
  moedas: Coins,
  cofre: PiggyBank,
  banco: Landmark,
  valor: CircleDollarSign,
  porcentagem: Percent,
  calculadora: Calculator,

  // Documentos
  cupom: Receipt,
  documento: FileText,
  lista: ClipboardList,
  checklist: ClipboardCheck,
  conferido: ListChecks,
  caderno: BookOpen,
  etiqueta: Ticket,

  // Movimento e entrega
  entrega: Bike,
  caminhao: Truck,
  local: MapPin,
  mapa: Map,
  compras: ShoppingCart,
  pacote: Package,
  entrada: Inbox,
  loja: Store,
  empresa: Building2,

  // Pessoas
  pessoa: User,
  equipe: Users,
  dono: Crown,
  contratado: UserCheck,
  desligado: UserMinus,
  cracha: IdCard,

  // Tempo
  agenda: CalendarDays,
  horario: CalendarClock,
  relogio: Clock,
  ampulheta: Hourglass,
  folga: TreePalm,

  // Estado
  certo: CircleCheck,
  errado: CircleX,
  alerta: TriangleAlert,
  aviso: CircleAlert,
  duvida: CircleHelp,
  proibido: Ban,
  ok: Check,
  fechar: X,

  // Ações
  buscar: Search,
  novo: Plus,
  editar: Pencil,
  lixeira: Trash2,
  imprimir: Printer,
  atualizar: RefreshCw,
  desfazer: RotateCcw,
  baixar: Download,
  enviar: Upload,
  mandar: Send,
  dividir: Split,
  cortar: Scissors,
  ver: Eye,
  esconder: EyeOff,
  seguir: ChevronRight,

  // Avisos e conversa
  sino: Bell,
  conversa: MessageSquare,
  telefone: Phone,
  megafone: Megaphone,
  som: Volume2,

  // Aparelhos
  celular: Smartphone,
  computador: Laptop,
  tela: Monitor,
  tv: Tv,
  internet: Globe,

  // Relatórios
  grafico: ChartColumn,
  linha: ChartLine,
  subindo: TrendingUp,
  descendo: TrendingDown,
  alvo: Target,

  // Diversos
  ajustes: Settings,
  cadeado: Lock,
  chave: KeyRound,
  ferramenta: Wrench,
  presente: Gift,
  festa: PartyPopper,
  brilho: Sparkles,
  estrela: Star,
  rapido: Zap,
  camera: Camera,
  inicio: House,
  sair: LogOut,
  porta: DoorOpen,
  claro: Sun,
  escuro: Moon,
  aparelho: Monitor,
} satisfies Record<string, LucideIcon>;

export type NomeIcone = keyof typeof MAPA;

export function Icone({
  nome,
  tamanho = 18,
  className = "",
  titulo,
}: {
  nome: NomeIcone;
  tamanho?: number;
  className?: string;
  /** Preencha quando o ícone aparece sozinho, sem texto do lado. */
  titulo?: string;
}) {
  const Desenho = MAPA[nome];
  return (
    <Desenho
      size={tamanho}
      strokeWidth={1.75}
      className={`inline-block shrink-0 ${className}`}
      aria-hidden={titulo ? undefined : true}
      aria-label={titulo}
      role={titulo ? "img" : undefined}
    />
  );
}
