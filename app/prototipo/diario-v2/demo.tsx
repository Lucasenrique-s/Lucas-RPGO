"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Caveat } from "next/font/google";
import {
  ENTIDADES,
  TIPOS,
  achar,
  acharGatilho,
  rotuloData,
  sugerirEntidades,
  sugerirTempo,
  tipoDe,
  tokenizar,
  type Entidade,
  type Retrato,
  type Seg,
  type TipoEntidade,
} from "./dados";
import "./diario-v2.css";

const mao = Caveat({ subsets: ["latin"], weight: ["400", "500"], display: "swap" });

/* ─── Texto com menções: palavra destacada, sem chip ─────────── */

function Rico({
  texto,
  aoEnt,
  aoTempo,
  inerte = false,
  sintaxe = false,
}: {
  texto: string;
  aoEnt?: (id: string) => void;
  aoTempo?: (s: Extract<Seg, { k: "tempo" }>) => void;
  // Espelho do editor: só pinta, não responde a clique.
  inerte?: boolean;
  // Mostra `@` e `[[ ]]` (no editor) em vez de só a palavra.
  sintaxe?: boolean;
}) {
  const segs = useMemo(() => tokenizar(texto), [texto]);
  return (
    <>
      {segs.map((s, i) => {
        if (s.k === "txt") return <span key={i}>{s.v}</span>;
        if (s.k === "novo") {
          return (
            <span key={i} className="mc mc--novo" title={`Página nova: “${s.nome}” será criada ao guardar`}>
              {sintaxe ? s.raw : s.nome}
            </span>
          );
        }
        if (s.k === "ent") {
          const t = tipoDe(s.ent.tipo);
          const titulo = `${s.ent.nome} · ${t.nome}${s.ent.status ? ` · ${s.ent.status}` : ""}`;
          const cls = `mc mc--${s.ent.tipo}`;
          const conteudo = sintaxe ? s.raw : s.digitado;
          return inerte ? (
            <span key={i} className={cls}>
              {conteudo}
            </span>
          ) : (
            <button key={i} type="button" className={cls} title={titulo} onClick={() => aoEnt?.(s.ent.id)}>
              {conteudo}
            </button>
          );
        }
        const cls = `mt mt--${s.tipo}${s.ok ? "" : " mt--vazio"}`;
        const conteudo = sintaxe ? s.raw : s.inner;
        return inerte ? (
          <span key={i} className={cls}>
            {conteudo}
          </span>
        ) : (
          <button key={i} type="button" className={cls} title={s.titulo} onClick={() => aoTempo?.(s)}>
            {conteudo}
          </button>
        );
      })}
    </>
  );
}

function Retratinho({ r, grande = false }: { r: Retrato; grande?: boolean }) {
  return (
    <span className={`v2-foto${grande ? " v2-foto--grande" : ""}`} style={{ background: r.tom }}>
      <i className={`fas ${r.glifo}`} />
    </span>
  );
}

const membrosDe = (id: string): Entidade[] =>
  ENTIDADES.filter((e) => e.id !== id && e.relacoes.some((r) => r.alvo === id && /membro/.test(r.verbo)));

/* ─── Folha de entidade (a página gerada sobre alguém ou algo) ── */

function FolhaEntidade({
  ent,
  aoAbrir,
  aoVoltar,
  aoIrWiki,
  aoIrPagina,
}: {
  ent: Entidade;
  aoAbrir: (id: string) => void;
  aoVoltar: () => void;
  aoIrWiki: (id: string) => void;
  aoIrPagina: (txt: string) => void;
}) {
  const [sel, setSel] = useState(0);
  const t = tipoDe(ent.tipo);
  const retrato = ent.retratos[Math.min(sel, ent.retratos.length - 1)];
  const porSessao = useMemo(() => {
    const m = new Map<number, typeof ent.minhas>();
    for (const n of ent.minhas) m.set(n.sessao, [...(m.get(n.sessao) ?? []), n]);
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [ent]);
  const membros = membrosDe(ent.id);

  return (
    <div className="v2-folha">
      <div className="v2-clipe">
        <span>
          <i className="fas fa-paperclip" /> página gerada das suas anotações
        </span>
        <button type="button" onClick={aoVoltar}>
          voltar ao texto
        </button>
      </div>

      {ent.wiki && (
        <div className="v2-wikibox">
          <span className="v2-wikibox-rotulo">
            <i className="fas fa-earth-americas" /> Na wiki da mesa
          </span>
          <div className="v2-wikibox-texto">
            <Rico texto={ent.wiki.resumo} aoEnt={aoAbrir} />
          </div>
          <button type="button" className="v2-link" onClick={() => aoIrWiki(ent.id)}>
            ver na wiki ↗
          </button>
        </div>
      )}

      <div className="v2-cab">
        <div className="v2-retratos">
          <div className="v2-polaroid">
            <Retratinho r={retrato} grande />
            <span className="v2-polaroid-leg">{retrato.rotulo}</span>
          </div>
          <div className="v2-miniaturas">
            {ent.retratos.map((r, i) => (
              <button key={r.id} type="button" className={i === sel ? "v2-mini on" : "v2-mini"} onClick={() => setSel(i)} title={r.rotulo} aria-label={r.rotulo}>
                <Retratinho r={r} />
              </button>
            ))}
            <button type="button" className="v2-mini v2-mini--mais" title="Adicionar retrato" onClick={() => aoIrPagina("Aqui você cola ou envia outra imagem. Pode ter várias, com legenda e a sessão.")}>
              +
            </button>
          </div>
        </div>
        <div className="v2-quem">
          <h3>{ent.nome}</h3>
          <div className="v2-sub">
            <i className={`fas ${t.icone}`} style={{ color: t.cor }} /> {t.nome}
            {ent.status ? ` · ${ent.status}` : ""}
            {ent.relacaoComigo ? ` · ${ent.relacaoComigo}` : ""}
          </div>
          <div className="v2-apelidos">
            {ent.apelidos.length > 0 ? (
              <>
                também chamado de {ent.apelidos.map((a, i) => (
                  <span key={a}>
                    {i > 0 ? ", " : ""}
                    <em>{a}</em>
                  </span>
                ))}
              </>
            ) : (
              <span className="v2-vazio">sem apelidos</span>
            )}
            <button type="button" className="v2-mais" onClick={() => aoIrPagina("Cada apelido vira um sinônimo: escrever “o Barba” já liga à página do Barba Negra.")}>
              + apelido
            </button>
          </div>
        </div>
      </div>

      {membros.length > 0 && (
        <>
          <div className="v2-titulo-sec">Membros</div>
          <div className="v2-linha">
            {membros.map((m) => (
              <button key={m.id} type="button" className={`mc mc--${m.tipo}`} onClick={() => aoAbrir(m.id)}>
                {m.nome}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="v2-titulo-sec">Relações</div>
      <div className="v2-relacoes">
        {ent.relacoes.map((r) => {
          const alvo = achar(r.alvo);
          const sess = /^s(\d+)$/.exec(r.alvo);
          return (
            <div key={r.verbo + r.alvo} className="v2-relacao">
              <span>{r.verbo}</span>
              {alvo ? (
                <button type="button" className={`mc mc--${alvo.tipo}`} onClick={() => aoAbrir(alvo.id)}>
                  {alvo.nome}
                </button>
              ) : sess ? (
                <span className="mt mt--sessao">Sessão {sess[1]}</span>
              ) : (
                <span className="mc mc--novo">{r.alvo}</span>
              )}
            </div>
          );
        })}
        <button type="button" className="v2-mais" onClick={() => aoIrPagina("Relações são escolhidas com o mesmo @: “aliado de @Nami”.")}>
          + relação
        </button>
      </div>

      <div className="v2-titulo-sec">O que eu sei</div>
      {porSessao.length === 0 && <p className="v2-vazio">Você ainda não anotou nada sobre {ent.nome}. Escreva @{ent.nome} numa anotação e ela aparece aqui.</p>}
      {porSessao.map(([n, notas]) => (
        <div key={n} className="v2-bloco-sessao">
          <button type="button" className="v2-sessao-rot" onClick={() => aoIrPagina(`Viraria para a página ${notas[0].pagina}, na Sessão ${n}.`)}>
            Sessão {n} · p. {notas[0].pagina}
          </button>
          {notas.map((nt, i) => (
            <div key={i} className="v2-trecho">
              {nt.titulo && <b>{nt.titulo}: </b>}
              <Rico texto={nt.texto} aoEnt={aoAbrir} aoTempo={(s) => aoIrPagina(s.titulo)} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ─── Tela 1: caderno com busca e índice vivo ─────────────────── */

const N1 =
  "A porta só abre com a @Chave do cofre, que está com a @Marinha. @Rob Lucci estava de guarda e nos viu.";
const N2 =
  "O @Barba Negra apareceu no cofre com o @Mapa de Alabasta. Ele já tinha sido visto no porto em [[Sessão 10]].";
const N3 =
  "A @Nami disse que o [[aniversário]] dela é daqui a três semanas. Combinamos de chegar a @Alabasta antes de [[02/06/512]].";

function TelaCaderno({ aberta, setAberta, aoIrWiki }: { aberta: string | null; setAberta: (id: string | null) => void; aoIrWiki: (id: string) => void }) {
  const [busca, setBusca] = useState("");
  const [foco, setFoco] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const ent = aberta ? achar(aberta) : null;
  const q = busca.trim();
  const ents = useMemo(() => sugerirEntidades(q), [q]);
  const tempo = useMemo(() => sugerirTempo(q), [q]);
  const exato = ents.some((x) => x.e.nome.toLowerCase() === q.toLowerCase());
  const mostrarLista = foco && (q.length > 0 || true);

  function abrir(id: string) {
    setAberta(id);
    setAviso(null);
    setBusca("");
    setFoco(false);
  }

  return (
    <div className="v2-tela">
      <div className="v2-busca-caixa">
        <i className="fas fa-magnifying-glass" />
        <input
          value={busca}
          placeholder="Buscar pessoa, lugar, grupo, pista, sessão ou data…"
          onChange={(e) => setBusca(e.target.value)}
          onFocus={() => setFoco(true)}
          onBlur={() => window.setTimeout(() => setFoco(false), 150)}
          aria-label="Buscar no caderno"
        />
        {mostrarLista && (
          <div className="v2-resultados" role="listbox">
            {ents.length > 0 && <div className="v2-res-sec">Páginas</div>}
            {ents.map(({ e, via }) => {
              const t = tipoDe(e.tipo);
              return (
                <button key={e.id} type="button" className="v2-res" onMouseDown={(ev) => ev.preventDefault()} onClick={() => abrir(e.id)}>
                  <span className="v2-res-ico" style={{ background: t.cor }}>
                    <i className={`fas ${t.icone}`} />
                  </span>
                  <span>
                    {e.nome}
                    {via && <em> (apelido: {via})</em>}
                  </span>
                  <small>
                    {t.nome} · {e.minhas.length} {e.minhas.length === 1 ? "anotação" : "anotações"}
                  </small>
                </button>
              );
            })}
            {(tempo.sess.length > 0 || tempo.evs.length > 0 || tempo.dataDigitada) && <div className="v2-res-sec">Tempo</div>}
            {tempo.sess.map((s) => (
              <button key={s.n} type="button" className="v2-res" onMouseDown={(ev) => ev.preventDefault()} onClick={() => setAviso(`Abriria a Sessão ${s.n} (p. ${s.pagina}).`)}>
                <span className="v2-res-ico v2-res-ico--tempo">
                  <i className="fas fa-book-open" />
                </span>
                <span>Sessão {s.n}</span>
                <small>
                  {s.titulo} · p. {s.pagina}
                </small>
              </button>
            ))}
            {tempo.evs.map((e) => (
              <button key={e.nome} type="button" className="v2-res" onMouseDown={(ev) => ev.preventDefault()} onClick={() => setAviso(`${e.nome}: ${rotuloData(e.dia, e.mes, e.ano)}. Mostraria o que você anotou por volta dessa data.`)}>
                <span className="v2-res-ico v2-res-ico--tempo">
                  <i className="fas fa-calendar-check" />
                </span>
                <span>{e.nome}</span>
                <small>{rotuloData(e.dia, e.mes, e.ano)}</small>
              </button>
            ))}
            {tempo.dataDigitada && (
              <button type="button" className="v2-res" onMouseDown={(ev) => ev.preventDefault()} onClick={() => setAviso(`Mostraria tudo o que você anotou em ${q}.`)}>
                <span className="v2-res-ico v2-res-ico--tempo">
                  <i className="fas fa-calendar-day" />
                </span>
                <span>Anotações de {q}</span>
                <small>data do calendário da campanha</small>
              </button>
            )}
            {q && !exato && (
              <button type="button" className="v2-res v2-res--criar" onMouseDown={(ev) => ev.preventDefault()} onClick={() => setAviso(`Criaria uma página nova chamada “${q}”. Você escolhe o tipo na hora.`)}>
                <span className="v2-res-ico v2-res-ico--criar">+</span>
                <span>Criar página “{q}”</span>
                <small>vazia, pra preencher depois</small>
              </button>
            )}
            {!q && <div className="v2-res-dica">Comece a digitar. Os apelidos também valem.</div>}
          </div>
        )}
      </div>

      <div className={`v2-livro ${mao.className}`}>
        <div className="v2-spread">
          <section className="v2-pg v2-pg--esq">
            <div className="v2-pg-sub">Sessão 12 · 12 de Maio, 512 · ao vivo</div>
            <h3 className="v2-h">A fuga de Enies Lobby</h3>
            <article className="v2-nota">
              <h4>O cofre</h4>
              <p>
                <Rico texto={N1} aoEnt={abrir} aoTempo={(s) => setAviso(s.titulo)} />
              </p>
              <div className="v2-meta">21:02</div>
            </article>
            <article className="v2-nota">
              <h4>
                <i className="fas fa-star v2-estrela" /> O mapa
              </h4>
              <p>
                <Rico texto={N2} aoEnt={abrir} aoTempo={(s) => setAviso(s.titulo)} />
              </p>
              <div className="v2-meta">21:14</div>
            </article>
            <span className="v2-num">23</span>
          </section>

          <section className="v2-pg v2-pg--dir">
            {ent ? (
              <FolhaEntidade ent={ent} aoAbrir={abrir} aoVoltar={() => setAberta(null)} aoIrWiki={aoIrWiki} aoIrPagina={setAviso} />
            ) : (
              <>
                <article className="v2-nota">
                  <h4>A saída</h4>
                  <p>
                    <Rico texto={N3} aoEnt={abrir} aoTempo={(s) => setAviso(s.titulo)} />
                  </p>
                  <div className="v2-polaroid v2-polaroid--nota">
                    <span className="v2-fita-adesiva" />
                    <span className="v2-foto v2-foto--planta" style={{ background: "#c9d6df" }}>
                      <i className="fas fa-image" />
                    </span>
                    <span className="v2-polaroid-leg">planta do cofre</span>
                  </div>
                  <div className="v2-meta">21:40</div>
                </article>
                <div className="v2-dica-pagina">
                  Toque em qualquer nome destacado para abrir a página dele aqui.
                </div>
              </>
            )}
            <span className="v2-num">24</span>
          </section>

          <div className="v2-lombada" aria-hidden />
          <div className="v2-fita-marcadora" aria-hidden />
          <div className="v2-aba v2-aba--esq" title="Sessão atual">
            Sessão 12
          </div>
          <div className="v2-aba v2-aba--dir v2-aba--a" title="Índice">
            Índice
          </div>
          <div className="v2-aba v2-aba--dir v2-aba--b" title="Escrever">
            ✎
          </div>
        </div>
      </div>

      {aviso && (
        <div className="v2-aviso" role="status">
          <i className="fas fa-circle-info" /> {aviso}
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar">
            ×
          </button>
        </div>
      )}
      <p className="v2-legenda">
        Nomes destacados são menções (@). Sublinhado azul são tempo ([[ ]]): sessão, data ou evento. O resto é só texto. Clique num nome para abrir a página dele, ou use a busca.
      </p>
    </div>
  );
}

/* ─── Tela 2: escrever com @ e [[ ]] ─────────────────────────── */

const EXEMPLO = "Hoje o @Barba falou com a @Nami no porto. Ele pediu o @Mapa de Alabasta e marcou o encontro para [[12/05/512]].";

type ItemSug = { chave: string; rotulo: string; detalhe?: string; icone: string; cor?: string; inserir: string; secao: string };

function TelaEscrever() {
  const [texto, setTexto] = useState(EXEMPLO);
  const [titulo, setTitulo] = useState("O encontro no porto");
  const [caret, setCaret] = useState(EXEMPLO.length);
  const [ativo, setAtivo] = useState(0);
  // Esc vale pra aquele `@` (a posição dele) até o cursor sair da menção.
  const [fechadoEm, setFechadoEm] = useState<number | null>(null);
  const [criadas, setCriadas] = useState<{ nome: string; tipo: TipoEntidade }[]>([]);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ta = useRef<HTMLTextAreaElement>(null);
  const marca = useRef<HTMLSpanElement>(null);

  const gatilho = useMemo(() => acharGatilho(texto, caret), [texto, caret]);

  const itens = useMemo<ItemSug[]>(() => {
    if (!gatilho) return [];
    if (gatilho.tipo === "@") {
      return sugerirEntidades(gatilho.q).map(({ e, via }) => {
        const t = tipoDe(e.tipo);
        return {
          chave: e.id,
          rotulo: e.nome,
          detalhe: via ? `apelido: ${via}` : t.nome,
          icone: t.icone,
          cor: t.cor,
          inserir: `@${e.nome} `,
          secao: "Páginas",
        };
      });
    }
    const { sess, evs, dataDigitada, datasSug } = sugerirTempo(gatilho.q);
    const lista: ItemSug[] = [];
    for (const dsg of datasSug) lista.push({ chave: `d-${dsg.txt}`, rotulo: dsg.txt, detalhe: `${dsg.rot} · ${dsg.nota}`, icone: "fa-calendar-day", inserir: `[[${dsg.txt}]] `, secao: "Datas" });
    if (dataDigitada && datasSug.length === 0) {
      const d = Number(dataDigitada[1]);
      const m = Number(dataDigitada[2]);
      const a = dataDigitada[3] ? Number(dataDigitada[3]) : 512;
      if (m >= 1 && m <= 12 && d >= 1 && d <= 30) {
        lista.push({ chave: "data", rotulo: `${d}/${m}/${a}`, detalhe: rotuloData(d, m, a), icone: "fa-calendar-day", inserir: `[[${d}/${m}/${a}]] `, secao: "Datas" });
      }
    }
    for (const s of sess) lista.push({ chave: `s${s.n}`, rotulo: `Sessão ${s.n}`, detalhe: s.titulo, icone: "fa-book-open", inserir: `[[Sessão ${s.n}]] `, secao: "Sessões" });
    for (const e of evs) lista.push({ chave: e.nome, rotulo: e.nome, detalhe: rotuloData(e.dia, e.mes, e.ano), icone: "fa-calendar-check", inserir: `[[${e.nome}]] `, secao: "Eventos" });
    if (gatilho.q.trim() && lista.length === 0) {
      lista.push({ chave: "marco", rotulo: `Criar marco “${gatilho.q.trim()}”`, detalhe: "fica no seu caderno; liga a um evento depois", icone: "fa-flag", inserir: `[[${gatilho.q.trim()}]] `, secao: "Marco" });
    }
    return lista;
  }, [gatilho]);

  const aberto = !!gatilho && fechadoEm !== gatilho.inicio && (itens.length > 0 || gatilho.tipo === "@");

  // Posição do menu: logo abaixo do cursor (medida num espelho invisível).
  useLayoutEffect(() => {
    const el = marca.current;
    if (!el) return;
    const t = window.setTimeout(() => setPos({ x: el.offsetLeft, y: el.offsetTop + 30 }), 0);
    return () => window.clearTimeout(t);
  }, [texto, caret]);

  function pousar(novoTexto: string, novoCaret: number) {
    setTexto(novoTexto);
    setCaret(novoCaret);
    setFechadoEm(null);
    setAtivo(0);
    window.setTimeout(() => {
      const el = ta.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(novoCaret, novoCaret);
    }, 0);
  }

  function aceitar(item: ItemSug) {
    if (!gatilho) return;
    const novo = texto.slice(0, gatilho.inicio) + item.inserir + texto.slice(caret);
    pousar(novo, gatilho.inicio + item.inserir.length);
  }

  function criarComTipo(tipo: TipoEntidade) {
    if (!gatilho || !gatilho.q.trim()) return;
    const nome = gatilho.q.trim();
    setCriadas((c) => (c.some((x) => x.nome.toLowerCase() === nome.toLowerCase()) ? c : [...c, { nome, tipo }]));
    const inserir = /\s/.test(nome) ? `@[${nome}] ` : `@${nome} `;
    const novo = texto.slice(0, gatilho.inicio) + inserir + texto.slice(caret);
    pousar(novo, gatilho.inicio + inserir.length);
  }

  function aoTeclar(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (!aberto) return;
    if (e.key === "ArrowDown" && itens.length) {
      e.preventDefault();
      setAtivo((a) => (a + 1) % itens.length);
    } else if (e.key === "ArrowUp" && itens.length) {
      e.preventDefault();
      setAtivo((a) => (a - 1 + itens.length) % itens.length);
    } else if ((e.key === "Enter" || e.key === "Tab") && itens[ativo]) {
      e.preventDefault();
      aceitar(itens[ativo]);
    } else if (e.key === "Escape" && gatilho) {
      setFechadoEm(gatilho.inicio);
    }
  }

  function digitar(c: string) {
    const el = ta.current;
    const pos0 = el ? el.selectionStart : texto.length;
    pousar(texto.slice(0, pos0) + c + texto.slice(pos0), pos0 + c.length);
  }

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(150, el.scrollHeight)}px`;
  }, [texto]);

  const quemSai = useMemo(() => tokenizar(texto).filter((s) => s.k === "ent"), [texto]);
  const secoes = [...new Set(itens.map((i) => i.secao))];

  return (
    <div className="v2-tela">
      <div className="v2-editor-barra">
        <span>Experimente:</span>
        <button type="button" onClick={() => digitar("@")}>
          digitar @
        </button>
        <button type="button" onClick={() => digitar("[[")}>
          digitar [[
        </button>
        <button type="button" onClick={() => pousar(EXEMPLO, EXEMPLO.length)}>
          texto de exemplo
        </button>
        <button type="button" onClick={() => pousar("", 0)}>
          limpar
        </button>
      </div>

      <div className={`v2-livro ${mao.className}`}>
        <div className="v2-spread">
          <section className="v2-pg v2-pg--esq">
            <div className="v2-pg-sub">Sessão 12 · escrevendo agora</div>
            <input className="v2-titulo-campo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título (opcional)" aria-label="Título" />
            <div className="v2-edit-wrap" style={{ position: "relative" } as CSSProperties}>
              <div className="v2-espelho" aria-hidden>
                <Rico texto={texto} inerte sintaxe />
                {"\n"}
              </div>
              <textarea
                ref={ta}
                className="v2-ta"
                value={texto}
                spellCheck={false}
                onChange={(e) => {
                  setTexto(e.target.value);
                  setCaret(e.target.selectionStart);
                  setFechadoEm((f) => (acharGatilho(e.target.value, e.target.selectionStart) ? f : null));
                  setAtivo(0);
                }}
                onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
                onKeyDown={aoTeclar}
                placeholder="Escreva aqui… @ menciona alguém, [[ ]] liga a um tempo."
                aria-label="Texto da anotação"
              />
              <div className="v2-medida" aria-hidden>
                {texto.slice(0, caret)}
                <span ref={marca} />
              </div>

              {aberto && gatilho && (
                <div className="v2-sug" style={{ left: Math.min(pos.x, 150), top: pos.y }} role="listbox">
                  {gatilho.tipo === "[[" && <div className="v2-sug-topo">Tempo · sessão, data ou evento</div>}
                  {secoes.map((sec) => (
                    <div key={sec}>
                      <div className="v2-res-sec">{sec}</div>
                      {itens.map((it, i) =>
                        it.secao !== sec ? null : (
                          <button key={it.chave} type="button" className={`v2-res${i === ativo ? " on" : ""}`} onMouseDown={(ev) => ev.preventDefault()} onClick={() => aceitar(it)} onMouseEnter={() => setAtivo(i)}>
                            <span className="v2-res-ico" style={it.cor ? { background: it.cor } : undefined}>
                              <i className={`fas ${it.icone}`} />
                            </span>
                            <span>{it.rotulo}</span>
                            <small>{it.detalhe}</small>
                          </button>
                        ),
                      )}
                    </div>
                  ))}
                  {gatilho.tipo === "@" && gatilho.q.trim() && (gatilho.colchete || !/\s/.test(gatilho.q.trim())) && !itens.some((i) => i.rotulo.toLowerCase() === gatilho.q.trim().toLowerCase()) && (
                    <div className="v2-criar-linha">
                      <span>Criar “{gatilho.q.trim()}” como:</span>
                      <div>
                        {TIPOS.map((t) => (
                          <button key={t.id} type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => criarComTipo(t.id)}>
                            <i className={`fas ${t.icone}`} /> {t.nome}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="v2-sug-rodape">↑↓ escolhe · Enter aceita · Esc fecha{gatilho.tipo === "@" && !gatilho.colchete ? " · nome com espaço: @[Fulano Misterioso]" : ""}</div>
                </div>
              )}
            </div>
            <span className="v2-num">23</span>
          </section>

          <section className="v2-pg v2-pg--dir">
            <div className="v2-pg-sub">Como fica na página, depois de guardar</div>
            {titulo && <h4 className="v2-titulo-prev">{titulo}</h4>}
            <p className="v2-prev">
              <Rico texto={texto || " "} />
            </p>
            <div className="v2-meta">21:52</div>

            <div className="v2-quadro-info">
              <b>O que acontece ao guardar</b>
              <ul>
                <li>
                  {quemSai.length > 0 ? `${new Set(quemSai.map((s) => (s.k === "ent" ? s.ent.id : ""))).size} página(s) ganham esta anotação em “o que eu sei”.` : "Nenhuma menção ainda."}
                </li>
                {criadas.map((c) => (
                  <li key={c.nome}>
                    Página nova “{c.nome}” ({tipoDe(c.tipo).nome}), vazia, pronta pra preencher.
                  </li>
                ))}
                <li>As datas seguem o calendário da campanha. [[12/05/512]] cai na Sessão 12.</li>
              </ul>
            </div>
            <span className="v2-num">24</span>
          </section>
          <div className="v2-lombada" aria-hidden />
          <div className="v2-fita-marcadora" aria-hidden />
        </div>
      </div>

      <div className="v2-legenda-grade">
        <div>
          <span className="mc mc--personagem">@Nome</span>
          <p>Uma página de alguém ou algo (personagem, local, grupo, item, pista). Apelidos valem como o nome.</p>
        </div>
        <div>
          <span className="mt mt--sessao">[[Sessão 12]]</span> <span className="mt mt--data">[[12/05/512]]</span> <span className="mt mt--evento">[[aniversário]]</span>
          <p>Tempo: sessão, data do calendário ou evento. Sublinhado azul, sem chip.</p>
        </div>
        <div>
          <span className="mt mt--marco mt--vazio">[[Festival da Lua]]</span> <span className="mc mc--novo">@Fulano</span>
          <p>Tracejado: ainda não existe. Vira um marco seu, ou uma página nova ao guardar.</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Tela 3: wiki da mesa ───────────────────────────────────── */

function PaginaWiki({
  ent,
  aoAbrir,
  aoVoltar,
  aoIrCaderno,
}: {
  ent: Entidade;
  aoAbrir: (id: string) => void;
  aoVoltar: () => void;
  aoIrCaderno: (id: string) => void;
}) {
  const [sel, setSel] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const t = tipoDe(ent.tipo);
  const retrato = ent.retratos[Math.min(sel, ent.retratos.length - 1)];
  const membros = membrosDe(ent.id);
  const w = ent.wiki!;
  const minhas = ent.minhas.length;

  return (
    <div className="w-pagina">
      <div className="w-migalha">
        <button type="button" onClick={aoVoltar}>
          Wiki
        </button>{" "}
        › {t.plural} › <b>{ent.nome}</b>
      </div>

      {ent.oculta && (
        <div className="w-oculta">
          <i className="fas fa-lock" /> Oculta para os jogadores. Só você (narrador) vê.
          <button type="button" onClick={() => setAviso("Revelar mostraria a página à mesa inteira, com o aviso “revelada na Sessão 12”.")}>
            Revelar à mesa
          </button>
        </div>
      )}

      <div className="w-grade">
        <div className="w-esq">
          <div className="w-retrato-grande" style={{ background: retrato.tom }}>
            <i className={`fas ${retrato.glifo}`} />
          </div>
          <div className="w-leg">{retrato.rotulo}</div>
          <div className="w-galeria">
            {ent.retratos.map((r, i) => (
              <button key={r.id} type="button" className={i === sel ? "on" : ""} style={{ background: r.tom }} onClick={() => setSel(i)} title={r.rotulo} aria-label={r.rotulo}>
                <i className={`fas ${r.glifo}`} />
              </button>
            ))}
            <button type="button" className="w-galeria-mais" onClick={() => setAviso("Qualquer editor da página adiciona imagens, com legenda e sessão.")}>
              +
            </button>
          </div>
          <div className="w-lado-card">
            <b>Quem edita</b>
            <div className="w-editores">
              {w.editores.map((e) => (
                <span key={e} className="w-avatar" title={e}>
                  {e[0]}
                </span>
              ))}
              <button type="button" onClick={() => setAviso("O autor escolhe quem mais edita. O narrador sempre pode.")}>
                + adicionar
              </button>
            </div>
          </div>
          {minhas > 0 && (
            <div className="w-lado-card w-lado-card--caderno">
              <b>No seu caderno</b>
              <p>
                Você tem {minhas} {minhas === 1 ? "anotação" : "anotações"} sobre {ent.nome}.
              </p>
              <button type="button" onClick={() => aoIrCaderno(ent.id)}>
                Abrir minha página →
              </button>
            </div>
          )}
        </div>

        <div className="w-dir">
          <div className="w-titulo">
            <h2>{ent.nome}</h2>
            <div className="w-acoes">
              <button type="button" onClick={() => setAviso("Editaria o resumo e os campos aqui mesmo, como um documento.")}>
                <i className="fas fa-pen" /> Editar
              </button>
              <button type="button" onClick={() => setAviso("Mostraria quem mudou o quê e quando, com desfazer.")}>
                <i className="fas fa-clock-rotate-left" /> Histórico
              </button>
            </div>
          </div>
          <div className="w-tags">
            <span style={{ background: t.cor }}>
              <i className={`fas ${t.icone}`} /> {t.nome}
            </span>
            {ent.status && <span className="w-tag-neutra">{ent.status}</span>}
            <span className="w-tag-neutra">revelada na Sessão {w.revelada || "—"}</span>
            {ent.apelidos.map((a) => (
              <span key={a} className="w-tag-neutra w-tag-apelido">
                “{a}”
              </span>
            ))}
          </div>

          <h4 className="w-sec">Resumo da mesa</h4>
          <p className="w-texto">
            <Rico texto={w.resumo} aoEnt={aoAbrir} />
          </p>

          {membros.length > 0 && (
            <>
              <h4 className="w-sec">Membros</h4>
              <div className="w-cartoes-mini">
                {membros.map((m) => (
                  <button key={m.id} type="button" onClick={() => aoAbrir(m.id)}>
                    <span className="w-mini-foto" style={{ background: m.retratos[0].tom }}>
                      <i className={`fas ${m.retratos[0].glifo}`} />
                    </span>
                    {m.nome}
                  </button>
                ))}
              </div>
            </>
          )}

          <h4 className="w-sec">Relações</h4>
          <div className="w-relacoes">
            {ent.relacoes.map((r) => {
              const alvo = achar(r.alvo);
              return (
                <div key={r.verbo + r.alvo} className="w-relacao">
                  <span>{r.verbo}</span>
                  {alvo ? (
                    <button type="button" className={`mc mc--${alvo.tipo}`} onClick={() => alvo.wiki && aoAbrir(alvo.id)}>
                      {alvo.nome}
                    </button>
                  ) : (
                    <span className="mt mt--sessao">Sessão {r.alvo.replace("s", "")}</span>
                  )}
                </div>
              );
            })}
          </div>

          <h4 className="w-sec">Anotações da mesa</h4>
          {w.notasPublicas.length === 0 && <p className="w-vazio">Ninguém publicou anotações sobre isso ainda.</p>}
          {w.notasPublicas.map((n, i) => (
            <div key={i} className="w-nota">
              <span className="w-nota-sessao">Sessão {n.sessao}</span>
              <Rico texto={n.texto} aoEnt={aoAbrir} />
            </div>
          ))}
        </div>
      </div>

      {aviso && (
        <div className="v2-aviso" role="status">
          <i className="fas fa-circle-info" /> {aviso}
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar">
            ×
          </button>
        </div>
      )}
    </div>
  );
}

function TelaWiki({ aberta, setAberta, aoIrCaderno }: { aberta: string | null; setAberta: (id: string | null) => void; aoIrCaderno: (id: string) => void }) {
  const [tipo, setTipo] = useState<TipoEntidade | "tudo">("tudo");
  const [busca, setBusca] = useState("");
  const [narrador, setNarrador] = useState(false);

  const lista = ENTIDADES.filter((e) => e.wiki && (narrador || !e.oculta))
    .filter((e) => tipo === "tudo" || e.tipo === tipo)
    .filter((e) => !busca.trim() || [e.nome, ...e.apelidos].some((n) => n.toLowerCase().includes(busca.trim().toLowerCase())));
  const ent = aberta ? achar(aberta) : null;

  return (
    <div className="v2-tela w-wiki">
      <div className="w-topo">
        <div>
          <span className="w-kicker">Wiki da mesa</span>
          <h2>Novo Mundo</h2>
        </div>
        <div className="w-ver-como" role="group" aria-label="Ver como">
          <span>Ver como</span>
          <button type="button" className={!narrador ? "on" : ""} onClick={() => setNarrador(false)}>
            Jogador
          </button>
          <button type="button" className={narrador ? "on" : ""} onClick={() => setNarrador(true)}>
            Narrador
          </button>
        </div>
      </div>

      {ent && ent.wiki ? (
        <PaginaWiki key={ent.id} ent={ent} aoAbrir={(id) => setAberta(id)} aoVoltar={() => setAberta(null)} aoIrCaderno={aoIrCaderno} />
      ) : (
        <>
          <div className="w-busca-linha">
            <div className="w-busca">
              <i className="fas fa-magnifying-glass" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar na wiki…" aria-label="Buscar na wiki" />
            </div>
            <div className="w-abas" role="tablist">
              <button type="button" className={tipo === "tudo" ? "on" : ""} onClick={() => setTipo("tudo")}>
                Tudo
              </button>
              {TIPOS.map((t) => (
                <button key={t.id} type="button" className={tipo === t.id ? "on" : ""} onClick={() => setTipo(t.id)}>
                  {t.plural}
                </button>
              ))}
            </div>
          </div>

          <div className="w-cartoes">
            {lista.map((e) => {
              const t = tipoDe(e.tipo);
              return (
                <button key={e.id} type="button" className={`w-cartao${e.oculta ? " w-cartao--oculto" : ""}`} onClick={() => setAberta(e.id)}>
                  <span className="w-cartao-foto" style={{ background: e.retratos[0].tom }}>
                    <i className={`fas ${e.retratos[0].glifo}`} />
                    {e.oculta && (
                      <span className="w-cadeado">
                        <i className="fas fa-lock" /> só narrador
                      </span>
                    )}
                  </span>
                  <span className="w-cartao-corpo">
                    <span className="w-cartao-nome">{e.nome}</span>
                    <span className="w-cartao-tipo">
                      <i className={`fas ${t.icone}`} style={{ color: t.cor }} /> {t.nome}
                      {e.status ? ` · ${e.status}` : ""}
                    </span>
                    <span className="w-cartao-resumo">{e.wiki!.resumo.replace(/@/g, "")}</span>
                    <span className="w-cartao-rodape">
                      revelada na Sessão {e.wiki!.revelada || "—"} · {e.retratos.length} {e.retratos.length === 1 ? "imagem" : "imagens"}
                    </span>
                  </span>
                </button>
              );
            })}
            {narrador && (
              <button type="button" className="w-cartao w-cartao--novo">
                <i className="fas fa-plus" />
                Nova página
              </button>
            )}
            {lista.length === 0 && <p className="w-vazio">Nada encontrado.</p>}
          </div>
          <p className="v2-legenda">
            A wiki é a face pública do diário: cartões e páginas, sem o clima de caderno. Uma só linha de abas e uma busca. Nada de escopos ou filtros em camadas.
          </p>
        </>
      )}
    </div>
  );
}

/* ─── Demo ───────────────────────────────────────────────────── */

export function DemoDiarioV2() {
  const [aba, setAba] = useState<"caderno" | "escrever" | "wiki">("caderno");
  const [abertaCaderno, setAbertaCaderno] = useState<string | null>("barba");
  const [abertaWiki, setAbertaWiki] = useState<string | null>(null);

  return (
    <div className="v2-raiz">
      <header className="v2-topo">
        <div>
          <span className="v2-kicker">Protótipo · diário v2 · dados de mentira</span>
          <h1>Diário de bordo</h1>
        </div>
        <nav className="v2-abas-topo" aria-label="Telas do protótipo">
          <button type="button" className={aba === "caderno" ? "on" : ""} onClick={() => setAba("caderno")}>
            <i className="fas fa-book" /> 1 · Meu caderno
          </button>
          <button type="button" className={aba === "escrever" ? "on" : ""} onClick={() => setAba("escrever")}>
            <i className="fas fa-pen-nib" /> 2 · Escrever com @ e [[ ]]
          </button>
          <button type="button" className={aba === "wiki" ? "on" : ""} onClick={() => setAba("wiki")}>
            <i className="fas fa-earth-americas" /> 3 · Wiki da mesa
          </button>
        </nav>
      </header>

      {aba === "caderno" && (
        <TelaCaderno
          aberta={abertaCaderno}
          setAberta={setAbertaCaderno}
          aoIrWiki={(id) => {
            setAbertaWiki(id);
            setAba("wiki");
          }}
        />
      )}
      {aba === "escrever" && <TelaEscrever />}
      {aba === "wiki" && (
        <TelaWiki
          aberta={abertaWiki}
          setAberta={setAbertaWiki}
          aoIrCaderno={(id) => {
            setAbertaCaderno(id);
            setAba("caderno");
          }}
        />
      )}
    </div>
  );
}
