// Menções do diário: `@Nome` (uma entidade) e `[[...]]` (tempo: sessão, data, evento
// ou marco). Puro: o editor, a leitura e o servidor usam as mesmas regras.
//
// No texto salvo a menção é o átomo de sempre, com id (renomear não quebra nada):
//   [[ficha:ID|Barba]]  [[sessao:ID|Sessão 12]]  [[dia:420|12/05/512]]
//   [[evento:ID|aniversário]]  [[marco:ID|Festival da Lua]]
// Ainda não existe? O id leva `novo:` e o servidor cria ao guardar:
//   [[ficha:novo:personagem:UUID|Fulano]]  [[marco:novo:UUID|Festival da Lua]]

import { diasParaData, type CalendarioConfig } from "@/lib/calendario/engine";
import { TIPOS_FICHA, rotuloDia, type TipoFichaDiario } from "@/lib/diario-tipos";

export type EntidadeMenu = { id: string; nome: string; tipo: TipoFichaDiario; apelidos: string[] };
export type SessaoMenu = { id: string; rotulo: string; detalhe?: string };
export type EventoMenu = { id: string; nome: string; dataDias: number };

export type ConfigMencao = {
  entidades: EntidadeMenu[];
  sessoes: SessaoMenu[];
  eventos: EventoMenu[];
  calendario: { config: CalendarioConfig; hoje: number } | null;
};

export type RefMencao = {
  tipo: "ficha" | "sessao" | "dia" | "evento" | "marco";
  id: string;
  nome: string;
};

export type ItemMencao = {
  chave: string;
  secao: string;
  rotulo: string;
  detalhe?: string;
  icone: string;
  cor?: string;
  ref: RefMencao;
};

export const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const ehIdNovo = (id: string) => id.startsWith("novo:");

// `novo:personagem:UUID` → o tipo; `novo:UUID` (marco) → null.
export function tipoDoIdNovo(id: string): TipoFichaDiario | null {
  const m = /^novo:([a-z]+):/.exec(id);
  return m && TIPOS_FICHA.some((t) => t.id === m[1]) ? (m[1] as TipoFichaDiario) : null;
}

const novoUuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

export const refDeEntidadeNova = (tipo: TipoFichaDiario, nome: string): RefMencao => ({ tipo: "ficha", id: `novo:${tipo}:${novoUuid()}`, nome });
export const refDeMarcoNovo = (nome: string): RefMencao => ({ tipo: "marco", id: `novo:${novoUuid()}`, nome });

/* ─── Gatilho: onde há uma menção sendo digitada ─────────────── */

export type Gatilho = { tipo: "@" | "[["; q: string; inicio: number; colchete: boolean };

// Termina o nome: quebra de linha, outro `@`, colchetes e a pontuação do dia a dia.
const PARA_NOME = "\\n@[\\],.;:!?()\"”";

// O que foi digitado depois do `@` ainda pode virar o nome (ou apelido) de alguma entidade?
// Enquanto puder, o menu fica aberto mesmo com espaço ("Barba N" → "Barba Negra").
export function comecoDeNome(q: string, entidades: EntidadeMenu[]): boolean {
  const n = sem(q);
  return entidades.some((e) => [e.nome, ...e.apelidos].some((t) => sem(t).startsWith(n)));
}

export function acharGatilho(antes: string, entidades: EntidadeMenu[]): Gatilho | null {
  const caret = antes.length;
  // `@[Nome composto]`: dentro dos colchetes vale tudo, até fechar.
  const mBr = /(?:^|[^\p{L}\p{N}_])@\[([^\]\n]{0,40})$/u.exec(antes);
  if (mBr) return { tipo: "@", q: mBr[1], inicio: caret - mBr[1].length - 2, colchete: true };
  const mAt = new RegExp(`(?:^|[^\\p{L}\\p{N}_])@([^${PARA_NOME}]{0,30})$`, "u").exec(antes);
  if (mAt) {
    const q = mAt[1];
    // Com espaço no meio, só continua se ainda for começo de um nome que existe.
    if (/\s/.test(q) && !comecoDeNome(q, entidades)) return null;
    return { tipo: "@", q, inicio: caret - q.length - 1, colchete: false };
  }
  const mCol = /\[\[([^\]\n]{0,30})$/.exec(antes);
  if (mCol) return { tipo: "[[", q: mCol[1], inicio: caret - mCol[1].length - 2, colchete: false };
  return null;
}

/* ─── Sugestões ─────────────────────────────────────────────── */

export function itensDeEntidades(q: string, entidades: EntidadeMenu[]): ItemMencao[] {
  const n = sem(q.trim());
  const out: ItemMencao[] = [];
  for (const e of entidades) {
    const t = TIPOS_FICHA.find((x) => x.id === e.tipo);
    const apelido = n ? e.apelidos.find((a) => sem(a).includes(n)) : undefined;
    if (n && !sem(e.nome).includes(n) && !apelido) continue;
    // O que entra no texto: o apelido, se foi ele que a pessoa começou a escrever.
    const exato = e.apelidos.find((a) => sem(a) === n);
    out.push({
      chave: e.id,
      secao: "Páginas",
      rotulo: e.nome,
      detalhe: apelido && !sem(e.nome).includes(n) ? `apelido: ${apelido}` : (t?.nome ?? ""),
      icone: t?.icone ?? "fa-address-card",
      cor: t?.cor,
      ref: { tipo: "ficha", id: e.id, nome: exato ?? e.nome },
    });
  }
  return out.slice(0, 7);
}

// `12/05/512` pelo calendário da campanha (meses e dias dele).
export function parseDataCampanha(q: string, config: CalendarioConfig): { dias: number; rotulo: string } | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(-?\d{1,5})$/.exec(q.trim());
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const ano = Number(m[3]);
  const mesInfo = config.meses[mes - 1];
  if (!mesInfo || dia < 1 || dia > mesInfo.dias) return null;
  const dias = diasParaData({ ano, mes, dia }, config);
  return { dias, rotulo: rotuloDia(dias, config) };
}

export function itensDeTempo(q: string, cfg: ConfigMencao): ItemMencao[] {
  const n = sem(q.trim());
  const out: ItemMencao[] = [];
  const cal = cfg.calendario;

  if (cal) {
    const data = parseDataCampanha(q, cal.config);
    if (data) {
      out.push({ chave: `d-${data.dias}`, secao: "Datas", rotulo: q.trim(), detalhe: data.rotulo, icone: "fa-calendar-day", ref: { tipo: "dia", id: String(data.dias), nome: q.trim() } });
    }
    for (const [nome, delta] of [["hoje", 0], ["ontem", -1], ["amanhã", 1]] as const) {
      if (n && !sem(nome).startsWith(n)) continue;
      out.push({ chave: `d-${nome}`, secao: "Datas", rotulo: nome, detalhe: rotuloDia(cal.hoje + delta, cal.config), icone: "fa-calendar-day", ref: { tipo: "dia", id: String(cal.hoje + delta), nome } });
    }
  }
  for (const s of cfg.sessoes) {
    if (n && !sem(s.rotulo).includes(n) && !sem(s.detalhe ?? "").includes(n)) continue;
    out.push({ chave: `s-${s.id}`, secao: "Sessões", rotulo: s.rotulo, detalhe: s.detalhe, icone: "fa-book-open", ref: { tipo: "sessao", id: s.id, nome: s.rotulo } });
    if (out.filter((x) => x.secao === "Sessões").length >= 4) break;
  }
  for (const e of cfg.eventos) {
    if (n && !sem(e.nome).includes(n)) continue;
    out.push({
      chave: `e-${e.id}`,
      secao: "Eventos",
      rotulo: e.nome,
      detalhe: cal ? rotuloDia(e.dataDias, cal.config) : undefined,
      icone: "fa-calendar-check",
      ref: { tipo: "evento", id: e.id, nome: e.nome },
    });
    if (out.filter((x) => x.secao === "Eventos").length >= 3) break;
  }
  const texto = q.trim();
  if (texto && !out.some((x) => sem(x.rotulo) === n)) {
    out.push({ chave: "marco", secao: "Marco", rotulo: `Criar marco “${texto}”`, detalhe: "fica no seu caderno; liga a um evento depois", icone: "fa-flag", ref: refDeMarcoNovo(texto) });
  }
  return out;
}

/* ─── Classes de estilo da menção (sem chip) ─────────────────── */

export function classeDaMencao(tipo: string, tipoEntidade?: TipoFichaDiario): string {
  if (tipo === "ficha") return `desc-mencao--${tipoEntidade ?? "personagem"}`;
  if (tipo === "sessao") return "desc-mencao--tempo desc-mencao--sessao";
  if (tipo === "dia") return "desc-mencao--tempo desc-mencao--dia";
  if (tipo === "evento") return "desc-mencao--tempo desc-mencao--evento";
  if (tipo === "marco") return "desc-mencao--tempo desc-mencao--marco";
  return "";
}

/* ─── Montagem a partir dos dados do diário ──────────────────── */

type SessaoParaMenu = { id: string; numero: number | null; titulo: string | null; iniciadaEm: string };
type CalParaMenu = { config: CalendarioConfig; hoje: number; eventos: { id: string; titulo: string; dataDias: number }[] } | null;

export const rotuloCurtoSessao = (s: SessaoParaMenu) =>
  s.numero != null ? `Sessão ${s.numero}` : `Sessão de ${new Date(s.iniciadaEm).toLocaleDateString("pt-BR")}`;

// O que o editor precisa pra oferecer o `@` e o `[[ ]]`.
export function montarConfigMencao(
  fichas: { id: string; nome: string; tipo: TipoFichaDiario; apelidos: string[] }[],
  sessoes: SessaoParaMenu[],
  cal: CalParaMenu,
): ConfigMencao {
  return {
    entidades: fichas.map((f) => ({ id: f.id, nome: f.nome, tipo: f.tipo, apelidos: f.apelidos })),
    sessoes: sessoes.map((s) => ({ id: s.id, rotulo: rotuloCurtoSessao(s), detalhe: s.titulo ?? undefined })),
    eventos: (cal?.eventos ?? []).map((e) => ({ id: e.id, nome: e.titulo, dataDias: e.dataDias })),
    calendario: cal ? { config: cal.config, hoje: cal.hoje } : null,
  };
}

type InfoMencao = { titulo: string; icone: string; selo: string; texto?: string; classe: string };

// Os destaques do texto: classe (cor por tipo), ícone e dica de cada coisa que se pode mencionar.
export function montarInfoMencao(
  fichas: { id: string; nome: string; tipo: TipoFichaDiario; apelidos: string[] }[],
  sessoes: SessaoParaMenu[],
  cal: CalParaMenu,
  marcos: { id: string; nome: string }[],
): Record<string, InfoMencao> {
  const info: Record<string, InfoMencao> = {};
  for (const f of fichas) {
    const t = TIPOS_FICHA.find((x) => x.id === f.tipo);
    info[`ficha:${f.id}`] = {
      titulo: f.nome,
      icone: t?.icone ?? "fa-address-card",
      selo: t?.nome ?? "Página",
      texto: f.apelidos.length ? `também: ${f.apelidos.join(", ")}` : undefined,
      classe: classeDaMencao("ficha", f.tipo),
    };
  }
  for (const s of sessoes) {
    info[`sessao:${s.id}`] = { titulo: rotuloCurtoSessao(s), icone: "fa-book-open", selo: "Sessão", texto: s.titulo ?? undefined, classe: classeDaMencao("sessao") };
  }
  for (const e of cal?.eventos ?? []) {
    info[`evento:${e.id}`] = { titulo: e.titulo, icone: "fa-calendar-check", selo: "Evento do calendário", texto: cal ? rotuloDia(e.dataDias, cal.config) : undefined, classe: classeDaMencao("evento") };
  }
  for (const m of marcos) {
    info[`marco:${m.id}`] = { titulo: m.nome, icone: "fa-flag", selo: "Marco seu", texto: "Um momento que só você nomeou.", classe: classeDaMencao("marco") };
  }
  return info;
}
