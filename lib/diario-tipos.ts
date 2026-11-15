// Constantes e tipos do diário de bordo, sem servidor: o cliente também usa.

import { dataParaDias, type CalendarioConfig } from "@/lib/calendario/engine";

export type TipoFichaDiario = "personagem" | "local" | "item" | "grupo" | "pista";

// `cor`: a faixa do card na linha do tempo (tons médios: valem no claro e no escuro).
export const TIPOS_FICHA: { id: TipoFichaDiario; nome: string; plural: string; icone: string; cor: string }[] = [
  { id: "personagem", nome: "Personagem", plural: "Personagens", icone: "fa-user", cor: "#7f77dd" },
  { id: "local", nome: "Local", plural: "Locais", icone: "fa-location-dot", cor: "#1d9e75" },
  { id: "item", nome: "Item", plural: "Itens", icone: "fa-box", cor: "#ba7517" },
  { id: "grupo", nome: "Grupo", plural: "Grupos", icone: "fa-users", cor: "#d85a30" },
  { id: "pista", nome: "Pista", plural: "Pistas", icone: "fa-magnifying-glass", cor: "#d4537e" },
];

export const STATUS_FICHA = ["vivo", "morto", "desconhecido"] as const;
export const RELACAO_FICHA = ["aliado", "neutro", "hostil", "desconhecida"] as const;

export type CamposFicha = { status?: string; relacao?: string; visto?: string };

export const LIMITES_DIARIO = {
  nome: 80,
  apelido: 60,
  apelidos: 10,
  campo: 120,
  texto: 20000,
  tag: 30,
  tags: 10,
  titulo: 80,
} as const;

// Linhas antigas guardavam "faccao": hoje é "grupo".
export const normalizarTipoFicha = (t: string): TipoFichaDiario =>
  t === "faccao" ? "grupo" : TIPOS_FICHA.some((x) => x.id === t) ? (t as TipoFichaDiario) : "personagem";

export const ehTipoFicha = (t: unknown): t is TipoFichaDiario => TIPOS_FICHA.some((x) => x.id === t);

// Dados que a tela recebe (datas já em ISO: vão pelo limite servidor → cliente).
// Um retrato da página de uma entidade (vários, o primeiro é o principal).
export type RetratoDTO = { id: string; url: string; legenda: string };

// "capitão de", "membro de"… de uma entidade pra outra.
export type RelacaoDTO = { id: string; deId: string; verbo: string; paraId: string };

// Momento que só a pessoa nomeou ([[Festival da Lua]] sem evento no calendário).
export type MarcoDiarioDTO = { id: string; nome: string };

export type FichaDiarioDTO = {
  id: string;
  autorId: string;
  tipo: TipoFichaDiario;
  nome: string;
  apelidos: string[];
  retratoUrl: string | null;
  retratos: RetratoDTO[];
  campos: CamposFicha;
  resumo: string;
  visibilidade: string;
  editores: string[];
  // Wiki: sessão em que a página foi publicada/revelada (null = ainda não, ou sem sessão).
  reveladaSessaoId: string | null;
  reveladaEm: string | null;
  criadaEm: string;
  atualizadaEm: string;
};

// Anotação que o autor escolheu mostrar na página pública ("Anotações da mesa").
export type NotaWikiDTO = {
  fichaId: string;
  notaId: string;
  autorId: string;
  sessaoId: string | null;
  titulo: string | null;
  corpo: string;
  criadaEm: string;
};

// Uma versão antiga de uma página pública (o estado de antes de uma edição).
export type VersaoFichaDTO = { id: string; editorId: string; nome: string; resumo: string; criadaEm: string };

export type NotaDiarioDTO = {
  id: string;
  autorId: string;
  sessaoId: string | null;
  diaJogo: number | null;
  titulo: string | null;
  corpo: string;
  tags: string[];
  importante: boolean;
  visibilidade: string;
  criadaEm: string;
};

// Backlink: `origem` cita `alvo`. Vem da tabela `DiarioMencao`, só das origens que
// a pessoa pode ler (o servidor filtra antes de mandar).
export type MencaoDiarioDTO = {
  origemTipo: "ficha" | "nota";
  origemId: string;
  alvoTipo: "ficha" | "nota" | "sessao";
  alvoId: string;
};

export type SessaoDiarioDTO = {
  id: string;
  numero: number | null;
  titulo: string | null;
  iniciadaEm: string;
  encerradaEm: string | null;
  ativa: boolean;
  // Jogada antes do sistema: não tem data de verdade (`iniciadaEm` só ordena).
  retroativa: boolean;
};

// A data a mostrar ao lado da sessão; null nas anteriores (a data delas seria inventada).
export const dataDaSessao = (s: Pick<SessaoDiarioDTO, "iniciadaEm" | "retroativa">): string | null =>
  s.retroativa ? null : new Date(s.iniciadaEm).toLocaleDateString("pt-BR");

export function rotuloSessao(s: Pick<SessaoDiarioDTO, "numero" | "titulo" | "iniciadaEm">): string {
  const data = new Date(s.iniciadaEm).toLocaleDateString("pt-BR");
  if (s.numero == null) return s.titulo ? `${s.titulo} (${data})` : `Sessão de ${data}`;
  return s.titulo ? `Sessão ${s.numero}: ${s.titulo}` : `Sessão ${s.numero}`;
}

// Atalhos de digitação: `#tag` vira tag e "! " no começo marca como importante.
// A hashtag fica no texto (lê-se normalmente); o "! " é tirado.
export function extrairAtalhos(corpo: string): { corpo: string; tags: string[]; importante: boolean } {
  let c = corpo.trim();
  let importante = false;
  if (/^!\s/.test(c)) {
    importante = true;
    c = c.replace(/^!\s+/, "");
  }
  const tags = [...c.matchAll(/(^|\s)#([\p{L}\p{N}_-]{1,30})/gu)].map((m) => m[2].toLowerCase());
  return { corpo: c, tags: [...new Set(tags)], importante };
}

// O calendário da mesa, no que o diário usa: citar dias e eventos.
export type CalendarioDiarioDTO = {
  config: CalendarioConfig;
  // Dia de hoje no jogo (dia absoluto).
  hoje: number;
  // Só os que esta pessoa pode ver (evento oculto não vem pro jogador).
  eventos: { id: string; titulo: string; dataDias: number }[];
};

// "13 de novembro, 1523": a data de um dia absoluto, como o chip e os cards mostram.
export function rotuloDia(dias: number, config: CalendarioConfig): string {
  try {
    const d = dataParaDias(dias, config);
    return `${d.dia} de ${d.nomeMes}, ${d.ano}`;
  } catch {
    return `dia ${dias}`;
  }
}
