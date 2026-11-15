// Tipos e constantes dos quadros de investigação. Puro (sem banco, sem React).

import type { PermissoesQuadro } from "./diario-quadro-permissao";

export const TIPOS_QUADRO = ["mesa", "pessoal"] as const;
export type TipoQuadro = (typeof TIPOS_QUADRO)[number];

export const NIVEIS_ACESSO = ["ver", "editar"] as const;
export type NivelAcesso = (typeof NIVEIS_ACESSO)[number];

export const TIPOS_CARTAO = ["postit", "pagina", "nota", "sessao", "imagem", "moldura", "texto"] as const;
export type TipoCartao = (typeof TIPOS_CARTAO)[number];

// Cartões que apontam para algo do diário (a prévia vem de lá).
export const TIPOS_CARTAO_REFERENCIA = ["pagina", "nota", "sessao"] as const;

export const FORMATOS_CARTAO = ["cartao", "alfinete"] as const;
export type FormatoCartao = (typeof FORMATOS_CARTAO)[number];

// Nomes de cor, não valores: a tela traduz cada nome para variáveis do tema.
export const CORES_CARTAO = ["amarelo", "rosa", "verde", "azul", "laranja", "roxo", "cinza"] as const;
export type CorCartao = (typeof CORES_CARTAO)[number];

// Formatação do texto de um cartão.
export const ALINHAMENTOS = ["esquerda", "centro", "direita"] as const;
export type Alinhamento = (typeof ALINHAMENTOS)[number];
// "padrao" usa a cor de texto do tema; as outras seguem o nome das cores dos cartões.
export const CORES_TEXTO = ["padrao", ...CORES_CARTAO] as const;
export type CorTexto = (typeof CORES_TEXTO)[number];
export const FONTE_MIN = 8;
export const FONTE_MAX = 96;

export const CORES_LIGACAO = ["vermelho", "azul", "verde", "cinza"] as const;
export type CorLigacao = (typeof CORES_LIGACAO)[number];

export const TRACOS_LIGACAO = ["continuo", "tracejado", "pontilhado"] as const;
export type TracoLigacao = (typeof TRACOS_LIGACAO)[number];

export const LIMITES_QUADRO = {
  nome: 80,
  texto: 4000,
  rotulo: 80,
  // Por quadro (a lixeira não conta). "Alguns milhares", como o plano sugere.
  cartoes: 3000,
  ligacoes: 6000,
  // Quadros pessoais por pessoa e mesa.
  quadrosPorPessoa: 30,
  // Pessoas com quem um quadro pode ser compartilhado.
  acessos: 30,
  // Cartões apagados ficam na lixeira por este tempo.
  lixeiraDias: 7,
  // Tamanho dos cartões e do canvas: evita número absurdo vindo do cliente.
  coordenada: 1_000_000,
  larguraMin: 40,
  larguraMax: 4000,
  alturaMin: 24,
  alturaMax: 4000,
} as const;

export const ehTipoCartao = (v: unknown): v is TipoCartao => (TIPOS_CARTAO as readonly unknown[]).includes(v);
export const ehTipoReferencia = (v: unknown): boolean => (TIPOS_CARTAO_REFERENCIA as readonly unknown[]).includes(v);
export const ehCorCartao = (v: unknown): v is CorCartao => (CORES_CARTAO as readonly unknown[]).includes(v);
export const ehCorLigacao = (v: unknown): v is CorLigacao => (CORES_LIGACAO as readonly unknown[]).includes(v);
export const ehTracoLigacao = (v: unknown): v is TracoLigacao => (TRACOS_LIGACAO as readonly unknown[]).includes(v);
export const ehAlinhamento = (v: unknown): v is Alinhamento => (ALINHAMENTOS as readonly unknown[]).includes(v);
export const ehCorTexto = (v: unknown): v is CorTexto => (CORES_TEXTO as readonly unknown[]).includes(v);
export const ehNivelAcesso = (v: unknown): v is NivelAcesso => (NIVEIS_ACESSO as readonly unknown[]).includes(v);
export const ehFormatoCartao = (v: unknown): v is FormatoCartao => (FORMATOS_CARTAO as readonly unknown[]).includes(v);

// Limita um número recebido do cliente a um intervalo (NaN e infinito viram o mínimo).
export function limitar(n: unknown, min: number, max: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : min;
  return Math.min(max, Math.max(min, v));
}

// ─── DTOs (o que o servidor entrega à tela) ───────────────────────────────

// Como a pessoa se relaciona com o quadro, pra agrupar a lista.
export type PapelNoQuadro = "mesa" | "dono" | "compartilhado" | "narrador";

export type QuadroResumoDTO = {
  id: string;
  tipo: TipoQuadro;
  nome: string;
  donoId: string | null;
  papel: PapelNoQuadro;
  // Só quando o quadro foi compartilhado com a pessoa.
  nivel: NivelAcesso | null;
  cartoes: number;
  fundoUrl: string | null;
  atualizadoEm: string;
  permissoes: PermissoesQuadro;
};

// ─── Conteúdo de um quadro aberto ─────────────────────────────────────────

export type CartaoDTO = {
  id: string;
  tipo: TipoCartao;
  formato: FormatoCartao;
  x: number;
  y: number;
  largura: number;
  altura: number;
  z: number;
  cor: CorCartao;
  texto: string;
  // Formatação do texto (fonte nula = o tamanho padrão do tipo, ver FONTE_PADRAO).
  fonte: number | null;
  alinhamento: Alinhamento;
  corTexto: CorTexto;
  negrito: boolean;
  refId: string | null;
  url: string | null;
  autorId: string;
  sessaoId: string | null;
  oculto: boolean;
  reveladoSessaoId: string | null;
  criadoEm: string;
};

export type LigacaoDTO = {
  id: string;
  deId: string;
  paraId: string;
  rotulo: string;
  cor: CorLigacao;
  traco: TracoLigacao;
  seta: boolean;
  autorId: string;
  oculto: boolean;
  reveladoSessaoId: string | null;
};

// O que um cartão de referência mostra. Só vai pra quem pode ler a origem: o servidor
// não manda página nem anotação privada alheia (o cartão fica como "sem acesso").
export type RefPaginaDTO = {
  id: string;
  nome: string;
  tipo: string;
  fotoUrl: string | null;
  previa: string;
  visibilidade: string;
  autorId: string;
};
export type RefNotaDTO = {
  id: string;
  titulo: string | null;
  previa: string;
  sessaoId: string | null;
  autorId: string;
  visibilidade: string;
  criadaEm: string;
};
export type RefSessaoDTO = {
  id: string;
  numero: number | null;
  titulo: string | null;
  ativa: boolean;
  iniciadaEm: string;
  // Sessão anterior ao sistema: sem data de verdade.
  retroativa: boolean;
};

export type ConteudoQuadroDTO = {
  // Instante (do servidor) em que o conteúdo foi lido: de onde a sincronia continua.
  agora: string;
  cartoes: CartaoDTO[];
  ligacoes: LigacaoDTO[];
  paginas: RefPaginaDTO[];
  notas: RefNotaDTO[];
  sessoes: RefSessaoDTO[];
  // Sessão em que os cartões novos nascem (a ativa, ou a mais recente).
  sessaoAtualId: string | null;
};

// Tamanho da fonte (px, com o quadro em 100%) de cada tipo de cartão quando a pessoa não escolheu um.
export const FONTE_PADRAO: Record<TipoCartao, number> = {
  postit: 15,
  pagina: 15,
  nota: 15,
  sessao: 15,
  imagem: 13,
  moldura: 16,
  texto: 28,
};

// Tamanho de um cartão novo, por tipo.
export const TAMANHO_PADRAO: Record<TipoCartao, { largura: number; altura: number }> = {
  postit: { largura: 200, altura: 160 },
  pagina: { largura: 240, altura: 110 },
  nota: { largura: 240, altura: 130 },
  sessao: { largura: 240, altura: 96 },
  imagem: { largura: 260, altura: 200 },
  moldura: { largura: 520, altura: 340 },
  texto: { largura: 280, altura: 56 },
};

// Imagem de fundo (o quadro vira mapa) com o tamanho dela em pixels.
export type FundoQuadro = { url: string; largura: number; altura: number } | null;

// Mudanças desde um instante (o cliente pede de novo ao receber um aviso ou ao voltar pra aba).
export type MudancasQuadroDTO = {
  agora: string;
  cartoes: CartaoDTO[];
  removidos: string[];
  ligacoes: LigacaoDTO[];
  ligacoesRemovidas: string[];
  paginas: RefPaginaDTO[];
  notas: RefNotaDTO[];
  sessoes: RefSessaoDTO[];
  // O fundo (mapa) do quadro, pra quem está nele ver a troca na hora.
  fundo: FundoQuadro;
};

export type ItemLixeiraDTO = {
  cartao: CartaoDTO;
  apagadoEm: string;
  apagadoPor: string | null;
  venceEm: string;
  podeRestaurar: boolean;
};

// Compartilhar um quadro pessoal (por pessoa).
export type AcessoCompartilhadoDTO = { userId: string; nivel: NivelAcesso };

// Enviar cartões para o quadro da mesa: o que o servidor achou antes de copiar.
export type PreparoImportacaoDTO = {
  // Cartões escolhidos que o servidor pode ler e enviar.
  total: number;
  // Vão como estão (post-its, imagens, molduras, sessões e referências públicas).
  comuns: number;
  // Já estão no quadro da mesa: o cartão novo não nasce, as ligações vão para o que já existe.
  jaNoQuadro: string[];
  // Página oculta (só narrador): vai oculta, o narrador revela depois.
  ocultos: number;
  // Referência apagada ou que a pessoa não lê: fica de fora.
  inacessiveis: number;
  // Privados: o autor escolhe publicar cada um ou deixar de fora.
  privados: { cartaoId: string; tipo: "pagina" | "nota"; nome: string; podePublicar: boolean }[];
};

export type ResultadoImportacaoDTO = {
  destinoId: string;
  criados: number;
  reutilizados: number;
  ligacoes: number;
  publicados: number;
  deixadosDeFora: number;
};
