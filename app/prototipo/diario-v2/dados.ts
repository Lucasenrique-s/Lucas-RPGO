// Dados de exemplo do protótipo do diário v2. Nada daqui vai pro banco.
// O mesmo `tokenizar` lê as anotações de exemplo e o que se digita no editor.

export type TipoEntidade = "personagem" | "local" | "grupo" | "item" | "pista";

export const TIPOS: { id: TipoEntidade; nome: string; plural: string; icone: string; cor: string }[] = [
  { id: "personagem", nome: "Personagem", plural: "Pessoas", icone: "fa-user", cor: "#7f77dd" },
  { id: "local", nome: "Local", plural: "Locais", icone: "fa-location-dot", cor: "#1d9e75" },
  { id: "grupo", nome: "Grupo", plural: "Grupos", icone: "fa-users", cor: "#d85a30" },
  { id: "item", nome: "Item", plural: "Itens", icone: "fa-box", cor: "#ba7517" },
  { id: "pista", nome: "Pista", plural: "Pistas", icone: "fa-magnifying-glass", cor: "#d4537e" },
];

export const tipoDe = (t: TipoEntidade) => TIPOS.find((x) => x.id === t)!;

export type Retrato = { id: string; rotulo: string; tom: string; glifo: string };
export type Relacao = { verbo: string; alvo: string };
export type NotaDaEntidade = { sessao: number; pagina: number; titulo?: string; texto: string };

export type Entidade = {
  id: string;
  nome: string;
  tipo: TipoEntidade;
  apelidos: string[];
  status?: string;
  relacaoComigo?: string;
  retratos: Retrato[];
  relacoes: Relacao[];
  // Só o que a mesa publicou (a wiki).
  wiki?: { resumo: string; revelada: number; editores: string[]; notasPublicas: NotaDaEntidade[] };
  // Só o narrador enxerga até revelar.
  oculta?: boolean;
  // As minhas anotações (o "o que eu sei").
  minhas: NotaDaEntidade[];
};

export const ENTIDADES: Entidade[] = [
  {
    id: "barba",
    nome: "Barba Negra",
    tipo: "personagem",
    apelidos: ["Barba", "o Capitão Negro"],
    status: "vivo",
    relacaoComigo: "hostil",
    retratos: [
      { id: "b1", rotulo: "Cartaz de procurado · Sessão 8", tom: "#4a3f6b", glifo: "fa-user" },
      { id: "b2", rotulo: "No porto · Sessão 10", tom: "#35506e", glifo: "fa-user-secret" },
      { id: "b3", rotulo: "Diante do cofre · Sessão 12", tom: "#6e3a3a", glifo: "fa-user-ninja" },
    ],
    relacoes: [
      { verbo: "capitão de", alvo: "bando" },
      { verbo: "tem", alvo: "mapa" },
      { verbo: "visto em", alvo: "alabasta" },
      { verbo: "inimigo de", alvo: "chapeu" },
    ],
    wiki: {
      resumo: "Capitão rival e procurado pela @Marinha. Revelado à mesa na Sessão 8. Costuma agir perto de @Alabasta.",
      revelada: 8,
      editores: ["Zoro", "Nami"],
      notasPublicas: [
        { sessao: 10, pagina: 13, texto: "Apareceu no porto e ofereceu um acordo ao grupo." },
        { sessao: 8, pagina: 6, texto: "Primeiro cartaz de procurado: recompensa alta." },
      ],
    },
    minhas: [
      { sessao: 12, pagina: 24, titulo: "O mapa", texto: "O @Barba Negra apareceu no cofre com o @Mapa de Alabasta. Ele já tinha sido visto no porto em [[Sessão 10]]." },
      { sessao: 10, pagina: 13, titulo: "No porto", texto: "O @Barba falou baixo e só olhava para @Nami. Desconfio que ele sabe do mapa." },
      { sessao: 8, pagina: 6, texto: "Primeira vez que ouço o nome do @Barba Negra: um cartaz de procurado." },
    ],
  },
  {
    id: "alabasta",
    nome: "Alabasta",
    tipo: "local",
    apelidos: ["o reino do deserto"],
    retratos: [
      { id: "a1", rotulo: "Mapa da região", tom: "#8a6d3b", glifo: "fa-map" },
      { id: "a2", rotulo: "Porto de Nanohana", tom: "#3b6d8a", glifo: "fa-anchor" },
    ],
    relacoes: [
      { verbo: "visitado em", alvo: "s10" },
      { verbo: "onde está", alvo: "barba" },
    ],
    wiki: { resumo: "Reino do deserto em guerra civil. A mesa chegou lá na Sessão 10.", revelada: 10, editores: ["Nami"], notasPublicas: [{ sessao: 10, pagina: 12, texto: "Chegada ao porto. A cidade está tensa." }] },
    minhas: [
      { sessao: 12, pagina: 24, texto: "Combinamos de chegar a @Alabasta antes de [[02/06/512]]." },
      { sessao: 10, pagina: 12, titulo: "Chegada", texto: "O porto de @Alabasta estava cheio de soldados." },
    ],
  },
  {
    id: "lucci",
    nome: "Rob Lucci",
    tipo: "personagem",
    apelidos: ["Lucci", "o leopardo"],
    status: "vivo",
    relacaoComigo: "hostil",
    retratos: [{ id: "l1", rotulo: "De guarda no cofre · Sessão 12", tom: "#3f3f46", glifo: "fa-user-tie" }],
    relacoes: [
      { verbo: "membro de", alvo: "cp9" },
      { verbo: "guarda", alvo: "chave" },
    ],
    wiki: { resumo: "Agente do @CP9. Muito forte, não subestimar.", revelada: 12, editores: ["Zoro"], notasPublicas: [{ sessao: 12, pagina: 23, texto: "Estava de guarda no cofre e viu o grupo." }] },
    minhas: [{ sessao: 12, pagina: 23, titulo: "O cofre", texto: "A porta só abre com a @Chave do cofre, que está com a @Marinha. @Rob Lucci estava de guarda e nos viu." }],
  },
  {
    id: "nami",
    nome: "Nami",
    tipo: "personagem",
    apelidos: [],
    status: "vivo",
    relacaoComigo: "aliada",
    retratos: [{ id: "n1", rotulo: "No convés", tom: "#b36b2c", glifo: "fa-user" }],
    relacoes: [{ verbo: "membro de", alvo: "chapeu" }],
    minhas: [{ sessao: 12, pagina: 24, texto: "A @Nami disse que o [[aniversário]] dela é daqui a três semanas." }],
  },
  {
    id: "chapeu",
    nome: "Tripulação do Chapéu",
    tipo: "grupo",
    apelidos: ["o bando", "nossa tripulação"],
    retratos: [{ id: "c1", rotulo: "Bandeira", tom: "#5a3a1e", glifo: "fa-skull-crossbones" }],
    relacoes: [
      { verbo: "inimiga de", alvo: "marinha" },
      { verbo: "rival de", alvo: "bando" },
    ],
    wiki: { resumo: "O nosso grupo. Membros: @Nami e mais.", revelada: 1, editores: ["Zoro", "Nami"], notasPublicas: [] },
    minhas: [],
  },
  {
    id: "marinha",
    nome: "Marinha",
    tipo: "grupo",
    apelidos: ["a Marinha"],
    retratos: [{ id: "m1", rotulo: "Brasão", tom: "#2a4a7a", glifo: "fa-shield-halved" }],
    relacoes: [{ verbo: "inclui", alvo: "cp9" }],
    wiki: { resumo: "A lei do mar. Persegue o grupo.", revelada: 2, editores: ["Zoro"], notasPublicas: [] },
    minhas: [{ sessao: 12, pagina: 23, texto: "A @Chave do cofre está com a @Marinha." }],
  },
  {
    id: "cp9",
    nome: "CP9",
    tipo: "grupo",
    apelidos: [],
    retratos: [{ id: "cp1", rotulo: "Insígnia", tom: "#333", glifo: "fa-eye" }],
    relacoes: [
      { verbo: "parte de", alvo: "marinha" },
      { verbo: "membro", alvo: "lucci" },
    ],
    wiki: { resumo: "Agentes secretos do governo.", revelada: 12, editores: ["Zoro"], notasPublicas: [] },
    minhas: [],
  },
  {
    id: "bando",
    nome: "Bando do Barba Negra",
    tipo: "grupo",
    apelidos: [],
    retratos: [{ id: "bb1", rotulo: "Bandeira negra", tom: "#222", glifo: "fa-flag" }],
    relacoes: [{ verbo: "liderado por", alvo: "barba" }],
    minhas: [],
  },
  {
    id: "mapa",
    nome: "Mapa de Alabasta",
    tipo: "item",
    apelidos: ["o mapa"],
    retratos: [{ id: "mp1", rotulo: "Metade do mapa", tom: "#9a7b3b", glifo: "fa-map" }],
    relacoes: [{ verbo: "com", alvo: "barba" }],
    wiki: { resumo: "Falta metade. Quem tem a outra metade?", revelada: 12, editores: ["Nami"], notasPublicas: [] },
    minhas: [{ sessao: 12, pagina: 24, texto: "O @Barba Negra apareceu no cofre com o @Mapa de Alabasta." }],
  },
  {
    id: "chave",
    nome: "Chave do cofre",
    tipo: "pista",
    apelidos: ["a chave"],
    status: "em aberto",
    retratos: [{ id: "k1", rotulo: "Desenho feito de memória", tom: "#7a6a2a", glifo: "fa-key" }],
    relacoes: [{ verbo: "está com", alvo: "marinha" }],
    wiki: { resumo: "A chave que abre o cofre de Enies Lobby.", revelada: 12, editores: ["Zoro", "Nami"], notasPublicas: [] },
    minhas: [{ sessao: 12, pagina: 23, texto: "A porta só abre com a @Chave do cofre." }],
  },
  {
    id: "cipher",
    nome: "Cipher Pol Zero",
    tipo: "grupo",
    apelidos: [],
    retratos: [{ id: "z1", rotulo: "Sem imagem", tom: "#111", glifo: "fa-lock" }],
    relacoes: [{ verbo: "acima de", alvo: "cp9" }],
    oculta: true,
    wiki: { resumo: "Segredo do narrador, ainda não revelado.", revelada: 0, editores: [], notasPublicas: [] },
    minhas: [],
  },
];

export const achar = (id: string) => ENTIDADES.find((e) => e.id === id);

/* ─── Tempo: sessões, datas e eventos ─────────────────────── */

export const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export type Sessao = { n: number; titulo: string; dia: number; mes: number; ano: number; pagina: number };
export const SESSOES: Sessao[] = [
  { n: 12, titulo: "A fuga de Enies Lobby", dia: 12, mes: 5, ano: 512, pagina: 23 },
  { n: 11, titulo: "Rumo ao cofre", dia: 10, mes: 5, ano: 512, pagina: 19 },
  { n: 10, titulo: "O deserto de Alabasta", dia: 8, mes: 5, ano: 512, pagina: 12 },
  { n: 8, titulo: "Os cartazes", dia: 3, mes: 5, ano: 512, pagina: 6 },
];

export type Evento = { nome: string; aliases: string[]; dia: number; mes: number; ano: number };
export const EVENTOS: Evento[] = [
  { nome: "Aniversário da Nami", aliases: ["aniversário", "aniversario"], dia: 2, mes: 6, ano: 512 },
  { nome: "Festival da Lua", aliases: [], dia: 21, mes: 6, ano: 512 },
];

export const rotuloData = (d: number, m: number, a: number) => `${d} de ${MESES[m - 1]}, ${a}`;

/* ─── Tokenizar: `@Nome` e `[[tempo]]` ──────────────────────── */

export type Seg =
  | { k: "txt"; v: string }
  | { k: "ent"; raw: string; ent: Entidade; digitado: string }
  | { k: "novo"; raw: string; nome: string }
  | { k: "tempo"; raw: string; inner: string; tipo: "sessao" | "data" | "evento" | "marco"; titulo: string; ok: boolean };

const eLetra = (c: string | undefined) => !!c && /[\p{L}\p{N}_]/u.test(c);
const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const NOMES = ENTIDADES.flatMap((e) => [e.nome, ...e.apelidos].map((t) => ({ t, e })))
  .sort((a, b) => b.t.length - a.t.length);

export function acharEntidadeEm(texto: string, i: number): { ent: Entidade; len: number } | null {
  for (const n of NOMES) {
    const trecho = texto.slice(i, i + n.t.length);
    if (trecho.length === n.t.length && sem(trecho) === sem(n.t) && !eLetra(texto[i + n.t.length])) return { ent: n.e, len: n.t.length };
  }
  return null;
}

// O que foi digitado depois do `@` ainda pode virar o nome (ou apelido) de alguma entidade?
// Enquanto puder, o menu continua aberto mesmo com espaço ("Barba N" → "Barba Negra").
export function comecoDeNome(q: string): boolean {
  const n = sem(q);
  return NOMES.some((x) => sem(x.t).startsWith(n));
}

// Onde há uma menção sendo digitada na posição do cursor. Pura: o editor usa em tudo.
export type Gatilho = { tipo: "@" | "[["; q: string; inicio: number; colchete: boolean };
const PARA_NOME = "\\n@[\\],.;:!?()\"\u201d";
export function acharGatilho(texto: string, caret: number): Gatilho | null {
  const antes = texto.slice(0, caret);
  // `@[Nome composto]`: dentro dos colchetes vale tudo, até fechar.
  const mBr = /(?:^|[^\p{L}\p{N}_])@\[([^\]\n]{0,40})$/u.exec(antes);
  if (mBr) return { tipo: "@", q: mBr[1], inicio: caret - mBr[1].length - 2, colchete: true };
  const mAt = new RegExp(`(?:^|[^\\p{L}\\p{N}_])@([^${PARA_NOME}]{0,30})$`, "u").exec(antes);
  if (mAt) {
    const q = mAt[1];
    // Com espaço no meio, só continua se ainda for começo de um nome que existe.
    if (/\s/.test(q) && !comecoDeNome(q)) return null;
    return { tipo: "@", q, inicio: caret - q.length - 1, colchete: false };
  }
  const mCol = /\[\[([^\]\n]{0,30})$/.exec(antes);
  if (mCol) return { tipo: "[[", q: mCol[1], inicio: caret - mCol[1].length - 2, colchete: false };
  return null;
}

export function resolverTempo(inner: string): { tipo: "sessao" | "data" | "evento" | "marco"; titulo: string; ok: boolean } {
  const t = inner.trim();
  let m: RegExpExecArray | null;
  if ((m = /^sess[aã]o\s+(\d+)$/i.exec(t))) {
    const s = SESSOES.find((x) => x.n === Number(m![1]));
    return s
      ? { tipo: "sessao", titulo: `Sessão ${s.n} · ${s.titulo} · ${rotuloData(s.dia, s.mes, s.ano)} · p. ${s.pagina}`, ok: true }
      : { tipo: "sessao", titulo: `Não há Sessão ${m[1]} no caderno`, ok: false };
  }
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{1,4})$/.exec(t))) {
    const d = Number(m[1]);
    const mes = Number(m[2]);
    const a = Number(m[3]);
    if (mes < 1 || mes > 12 || d < 1 || d > 30) return { tipo: "data", titulo: "Data fora do calendário da campanha", ok: false };
    const s = SESSOES.find((x) => x.dia === d && x.mes === mes && x.ano === a);
    return { tipo: "data", titulo: `${rotuloData(d, mes, a)}${s ? ` · Sessão ${s.n}` : " · nenhuma sessão nesse dia"}`, ok: true };
  }
  if (/^(hoje|ontem)$/i.test(t)) {
    const s = SESSOES[0];
    return { tipo: "data", titulo: `${t.toLowerCase() === "hoje" ? "Hoje" : "Ontem"} · ${rotuloData(s.dia - (t.toLowerCase() === "ontem" ? 1 : 0), s.mes, s.ano)}`, ok: true };
  }
  const ev = EVENTOS.find((e) => sem(e.nome) === sem(t) || e.aliases.some((a) => sem(a) === sem(t)));
  if (ev) return { tipo: "evento", titulo: `${ev.nome} · ${rotuloData(ev.dia, ev.mes, ev.ano)}`, ok: true };
  return { tipo: "marco", titulo: `Marco seu: “${t}”. Se o narrador criar o evento, o link passa a apontar pra ele.`, ok: false };
}

export function tokenizar(texto: string): Seg[] {
  const out: Seg[] = [];
  let buf = "";
  const solta = () => {
    if (buf) out.push({ k: "txt", v: buf });
    buf = "";
  };
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (c === "@" && !eLetra(texto[i - 1])) {
      if (texto[i + 1] === "[" && texto[i + 2] !== "[") {
        const fim = texto.indexOf("]", i + 2);
        if (fim > i + 2 && !texto.slice(i + 2, fim).includes("\n")) {
          solta();
          const inner = texto.slice(i + 2, fim);
          const casou = acharEntidadeEm(inner, 0);
          if (casou && casou.len === inner.length) out.push({ k: "ent", raw: texto.slice(i, fim + 1), ent: casou.ent, digitado: inner });
          else out.push({ k: "novo", raw: texto.slice(i, fim + 1), nome: inner });
          i = fim + 1;
          continue;
        }
      }
      const achou = acharEntidadeEm(texto, i + 1);
      if (achou) {
        solta();
        out.push({ k: "ent", raw: texto.slice(i, i + 1 + achou.len), ent: achou.ent, digitado: texto.slice(i + 1, i + 1 + achou.len) });
        i += 1 + achou.len;
        continue;
      }
      const w = /^[\p{L}\p{N}_-]+/u.exec(texto.slice(i + 1));
      if (w) {
        solta();
        out.push({ k: "novo", raw: `@${w[0]}`, nome: w[0] });
        i += 1 + w[0].length;
        continue;
      }
    }
    if (c === "[" && texto[i + 1] === "[") {
      const fim = texto.indexOf("]]", i + 2);
      if (fim > i + 2 && !texto.slice(i + 2, fim).includes("\n")) {
        solta();
        const inner = texto.slice(i + 2, fim);
        out.push({ k: "tempo", raw: texto.slice(i, fim + 2), inner, ...resolverTempo(inner) });
        i = fim + 2;
        continue;
      }
    }
    buf += c;
    i++;
  }
  solta();
  return out;
}

/* ─── Sugestões do editor ───────────────────────────────────── */

export function sugerirEntidades(q: string) {
  const n = sem(q.trim());
  const itens = ENTIDADES.filter((e) => !e.oculta).flatMap((e) => {
    if (!n) return [{ e, via: null as string | null }];
    if (sem(e.nome).includes(n)) return [{ e, via: null as string | null }];
    const ap = e.apelidos.find((a) => sem(a).includes(n));
    return ap ? [{ e, via: ap }] : [];
  });
  return itens.slice(0, 6);
}

export function sugerirTempo(q: string) {
  const n = sem(q.trim());
  const sess = SESSOES.filter((s) => !n || sem(`sessao ${s.n}`).includes(n) || sem(s.titulo).includes(n)).slice(0, 4);
  const evs = EVENTOS.filter((e) => !n || sem(e.nome).includes(n) || e.aliases.some((a) => sem(a).includes(n))).slice(0, 3);
  const dataDigitada = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{1,4}))?$/.exec(q.trim());
  // Datas que a campanha de fato tem (de sessões e eventos) começando pelo que foi digitado.
  const p2 = (n: number) => String(n).padStart(2, "0");
  const digitado = q.trim().replace(/\s/g, "");
  const sem0 = (x: string) => x.split("/").map((p) => String(Number(p))).join("/");
  const datasSug = digitado.includes("/")
    ? [
        ...SESSOES.map((x) => ({ d: x.dia, m: x.mes, a: x.ano, rot: rotuloData(x.dia, x.mes, x.ano), nota: `Sessão ${x.n}` })),
        ...EVENTOS.map((x) => ({ d: x.dia, m: x.mes, a: x.ano, rot: rotuloData(x.dia, x.mes, x.ano), nota: x.nome })),
      ]
        .map((x) => ({ ...x, txt: `${p2(x.d)}/${p2(x.m)}/${x.a}`, curto: `${x.d}/${x.m}/${x.a}` }))
        .filter((x) => x.txt.startsWith(digitado) || x.curto.startsWith(digitado) || sem0(x.txt).startsWith(digitado))
    : [];
  return { sess, evs, dataDigitada, datasSug };
}
