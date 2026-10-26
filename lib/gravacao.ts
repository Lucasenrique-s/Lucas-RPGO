// Configuração do overlay de gravação no OBS (docs/plano-gravacao-obs.md).
// Mora em ConfigGravacao.config (Json); `lerConfigGravacao` nunca lança e
// completa o que faltar com o padrão, então config velha sempre abre.

// Foco: só quem está em `foco` aparece (o narrador, se marcado, fica grande).
export type ModoGravacao = "narracao" | "cinematico" | "igualitario" | "foco";

// PV/PP: barra com número, só a barra ou nada.
export type ExibirBarra = "numero" | "barra" | "oculto";

export type MostrarGravacao = {
  nome: boolean;
  pv: ExibirBarra;
  pp: ExibirBarra;
  recursos: boolean;
  condicoes: boolean;
  fala: boolean;
};

// "narrador": no modo Narração o mapa ocupa o espaço grande do narrador.
export type PosicaoMapa = "esquerda" | "direita" | "centro" | "narrador";

// Ajustar: o mapa cabe inteiro. Preencher: corta as sobras.
export type EncaixeMapa = "ajustar" | "preencher";

export type MapaGravacao = {
  ligado: boolean;
  posicao: PosicaoMapa;
  encaixe: EncaixeMapa;
  // Nome da fonte do mapa no OBS (Fase 6).
  fonteObs: string;
};

export type ConfigGravacao = {
  modo: ModoGravacao;
  narrador: { nome: string; imagemUrl: string | null };
  // Quem está na gravação, marcado na mão (sem Discord). Inclui ID_NARRADOR
  // quando o narrador aparece.
  presentes: string[];
  // Ordem dos cards; quem não está aqui vai pro fim.
  ordem: string[];
  // Destaque manual do Cinemático.
  emCena: string[];
  // Quem aparece no modo Foco (pode incluir ID_NARRADOR). Vazio = só o narrador.
  foco: string[];
  mostrar: MostrarGravacao;
  // Por personagem, por cima do `mostrar` geral.
  excecoes: Record<string, Partial<MostrarGravacao>>;
  // Por personagem, ids dos recursos customizados que aparecem.
  recursos: Record<string, string[]>;
  // Combate (todas desligadas por padrão): destacar quem está no turno (selo
  // "Vez" e, no Cinemático, em cena), Cinemático automático e ordem pela iniciativa.
  auto: { destacarVez: boolean; cinematicoNoCombate: boolean; ordemPorIniciativa: boolean };
  // Com `auto.cinematicoNoCombate`: o modo escolhido na mão durante aquele
  // combate. Vale só enquanto ele dura; acabou, volta `modo`.
  modoNoCombate: { combateId: string; modo: ModoGravacao } | null;
  mapa: MapaGravacao;
  // Quando a tela de gravação mudou (Date.now()). A config nova chega ao
  // overlay pelo canal antes de ir pro banco: uma busca com versão menor não
  // desfaz a mudança.
  versao: number;
};

// Id do card do narrador no layout (personagens usam o próprio id).
export const ID_NARRADOR = "narrador";

export const MODOS_GRAVACAO: { slug: ModoGravacao; nome: string; icone: string }[] = [
  { slug: "narracao", nome: "Narração", icone: "fa-book-open" },
  { slug: "cinematico", nome: "Cinemático", icone: "fa-film" },
  { slug: "igualitario", nome: "Igualitário", icone: "fa-grip" },
  { slug: "foco", nome: "Foco", icone: "fa-user-check" },
];

export const POSICOES_MAPA: { slug: PosicaoMapa; nome: string }[] = [
  { slug: "esquerda", nome: "Esquerda" },
  { slug: "direita", nome: "Direita" },
  { slug: "centro", nome: "Centro" },
  { slug: "narrador", nome: "No lugar do narrador" },
];

export const MOSTRAR_PADRAO: MostrarGravacao = {
  nome: true,
  pv: "barra",
  pp: "oculto",
  recursos: false,
  condicoes: true,
  fala: true,
};

export const CONFIG_GRAVACAO_PADRAO: ConfigGravacao = {
  modo: "narracao",
  narrador: { nome: "Narrador", imagemUrl: null },
  presentes: [],
  ordem: [],
  emCena: [],
  foco: [],
  mostrar: MOSTRAR_PADRAO,
  excecoes: {},
  recursos: {},
  auto: { destacarVez: false, cinematicoNoCombate: false, ordemPorIniciativa: false },
  modoNoCombate: null,
  mapa: { ligado: false, posicao: "direita", encaixe: "ajustar", fonteObs: "Mapa" },
  versao: 0,
};

const MODOS = new Set<string>(["narracao", "cinematico", "igualitario", "foco"]);
const EXIBIR = new Set<string>(["numero", "barra", "oculto"]);
const POSICOES = new Set<string>(["esquerda", "direita", "centro", "narrador"]);
const MAX_IDS = 60;

function obj(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function texto(raw: unknown, padrao: string, max = 80): string {
  return typeof raw === "string" ? raw.slice(0, max) : padrao;
}

function ids(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const vistos = new Set<string>();
  for (const v of raw) {
    if (typeof v === "string" && v && v.length <= 64) vistos.add(v);
    if (vistos.size >= MAX_IDS) break;
  }
  return [...vistos];
}

function modo(raw: unknown): ModoGravacao | null {
  return typeof raw === "string" && MODOS.has(raw) ? (raw as ModoGravacao) : null;
}

function exibir(raw: unknown): ExibirBarra | undefined {
  return typeof raw === "string" && EXIBIR.has(raw) ? (raw as ExibirBarra) : undefined;
}

// Só os campos válidos; o resto fica de fora (vale o geral).
function mostrarParcial(raw: unknown): Partial<MostrarGravacao> {
  const o = obj(raw);
  const out: Partial<MostrarGravacao> = {};
  for (const campo of ["nome", "recursos", "condicoes", "fala"] as const) {
    if (typeof o[campo] === "boolean") out[campo] = o[campo];
  }
  const pv = exibir(o.pv);
  if (pv) out.pv = pv;
  const pp = exibir(o.pp);
  if (pp) out.pp = pp;
  return out;
}

function mapaIds<T>(raw: unknown, ler: (v: unknown) => T): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, v] of Object.entries(obj(raw)).slice(0, MAX_IDS)) {
    if (id.length <= 64) out[id] = ler(v);
  }
  return out;
}

function lerModoNoCombate(raw: unknown): ConfigGravacao["modoNoCombate"] {
  const o = obj(raw);
  const m = modo(o.modo);
  return m && typeof o.combateId === "string" && o.combateId ? { combateId: o.combateId.slice(0, 64), modo: m } : null;
}

/**
 * Modo que vale agora. Com o Cinemático automático e um combate ativo: o
 * escolhido na mão durante este combate, ou Cinemático.
 */
export function modoEfetivo(config: ConfigGravacao, combateId: string | null): ModoGravacao {
  if (!combateId || !config.auto.cinematicoNoCombate) return config.modo;
  return config.modoNoCombate?.combateId === combateId ? config.modoNoCombate.modo : "cinematico";
}

/** Escolher um modo: durante o combate automático, só vale até ele acabar. */
export function comModo(config: ConfigGravacao, modo: ModoGravacao, combateId: string | null): ConfigGravacao {
  if (combateId && config.auto.cinematicoNoCombate) return { ...config, modoNoCombate: { combateId, modo } };
  return { ...config, modo };
}

/** Nunca lança: roda no render e no GET do overlay. */
export function lerConfigGravacao(raw: unknown): ConfigGravacao {
  const o = obj(raw);
  const p = CONFIG_GRAVACAO_PADRAO;
  const narrador = obj(o.narrador);
  const auto = obj(o.auto);
  const mapa = obj(o.mapa);
  return {
    modo: modo(o.modo) ?? p.modo,
    narrador: {
      nome: texto(narrador.nome, p.narrador.nome),
      imagemUrl: typeof narrador.imagemUrl === "string" && narrador.imagemUrl ? narrador.imagemUrl.slice(0, 500) : null,
    },
    presentes: ids(o.presentes),
    ordem: ids(o.ordem),
    emCena: ids(o.emCena),
    foco: ids(o.foco),
    mostrar: { ...p.mostrar, ...mostrarParcial(o.mostrar) },
    excecoes: mapaIds(o.excecoes, mostrarParcial),
    recursos: mapaIds(o.recursos, ids),
    auto: {
      destacarVez: auto.destacarVez === true,
      cinematicoNoCombate: auto.cinematicoNoCombate === true,
      ordemPorIniciativa: auto.ordemPorIniciativa === true,
    },
    modoNoCombate: lerModoNoCombate(o.modoNoCombate),
    mapa: {
      ligado: mapa.ligado === true,
      posicao: typeof mapa.posicao === "string" && POSICOES.has(mapa.posicao) ? (mapa.posicao as PosicaoMapa) : p.mapa.posicao,
      encaixe: mapa.encaixe === "preencher" ? "preencher" : "ajustar",
      fonteObs: texto(mapa.fonteObs, p.mapa.fonteObs).trim() || p.mapa.fonteObs,
    },
    versao: typeof o.versao === "number" && Number.isFinite(o.versao) ? o.versao : 0,
  };
}

/** O que aparece no card de um personagem: o geral com a exceção dele por cima. */
export function mostrarDoPersonagem(config: ConfigGravacao, personagemId: string): MostrarGravacao {
  return { ...config.mostrar, ...config.excecoes[personagemId] };
}

/** Ciclo do atalho de PV/PP: barra + número → só barra → oculto. */
export function proximoExibir(atual: ExibirBarra): ExibirBarra {
  return atual === "numero" ? "barra" : atual === "barra" ? "oculto" : "numero";
}

/** Ids na ordem salva; os que não estão nela vão pro fim, na ordem recebida. */
export function ordenarPorConfig(idsPresentes: string[], ordem: string[]): string[] {
  const posicao = new Map(ordem.map((id, i) => [id, i]));
  return idsPresentes
    .map((id, i) => ({ id, chave: posicao.get(id) ?? ordem.length + i }))
    .sort((a, b) => a.chave - b.chave)
    .map((x) => x.id);
}

/**
 * Canal do Realtime (Broadcast) por onde a tela de gravação e o bot avisam o
 * overlay. Derivado do token, pra só quem tem o link saber o nome.
 */
export async function canalDaGravacao(token: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hex = [...new Uint8Array(hash).slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `gravacao:${hex}`;
}

// Eventos do canal. "mudou": algo da mesa mudou, o overlay busca o estado de
// novo. "config": a config nova inteira, aplicada na hora (sem ir ao banco).
export const EVENTO_MUDOU = "mudou";
export const EVENTO_CONFIG = "config";
// Do overlay pra tela: como está a conexão com o OBS (lib/obs-mapa.ts).
export const EVENTO_OBS = "obs";

/** Token do link do OBS: 24 bytes aleatórios em base64url. */
export function gerarTokenGravacao(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
