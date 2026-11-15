"use client";

import { useEffect, useRef, useState } from "react";
import { Handle, NodeResizer, NodeToolbar, Position, type Node, type NodeProps } from "@xyflow/react";
import { corDaPessoa } from "@/lib/diario-quadro-presenca";
import { TIPOS_FICHA, dataDaSessao, rotuloSessao } from "@/lib/diario-tipos";
import { CORES_CARTAO, CORES_TEXTO, FONTE_MAX, FONTE_MIN, FONTE_PADRAO, type Alinhamento, type CartaoDTO } from "@/lib/diario-quadro-tipos";
import { useQuadro, type NoCartao } from "./quadro-contexto";

const NOME_COR: Record<string, string> = {
  amarelo: "Amarelo",
  rosa: "Rosa",
  verde: "Verde",
  azul: "Azul",
  laranja: "Laranja",
  roxo: "Roxo",
  cinza: "Cinza",
};

const NOME_ALINHAMENTO: Record<Alinhamento, string> = { esquerda: "Alinhar à esquerda", centro: "Centralizar", direita: "Alinhar à direita" };
const ICONE_ALINHAMENTO: Record<Alinhamento, string> = { esquerda: "fa-align-left", centro: "fa-align-center", direita: "fa-align-right" };
const CSS_ALINHAMENTO: Record<Alinhamento, "left" | "center" | "right"> = { esquerda: "left", centro: "center", direita: "right" };

// Tamanho, alinhamento e negrito do texto de um cartão (a cor vai por data-cor-texto, que aponta pro tema).
const estiloTexto = (c: CartaoDTO): React.CSSProperties => ({
  fontSize: `${c.fonte ?? FONTE_PADRAO[c.tipo]}px`,
  textAlign: CSS_ALINHAMENTO[c.alinhamento],
  fontWeight: c.negrito ? 700 : 400,
});

const tipoDaPagina = (t: string) => TIPOS_FICHA.find((x) => x.id === t);

// Quatro alças, uma por lado: arrastar de uma até outro cartão cria o barbante.
function Alcas() {
  return (
    <>
      <Handle id="t" type="source" position={Position.Top} className="qn-alca" />
      <Handle id="r" type="source" position={Position.Right} className="qn-alca" />
      <Handle id="b" type="source" position={Position.Bottom} className="qn-alca" />
      <Handle id="l" type="source" position={Position.Left} className="qn-alca" />
    </>
  );
}

// Mini-barra sobre o cartão selecionado: cor, duplicar, abrir e apagar.
function MiniBarra({ cartao, comCor }: { cartao: CartaoDTO; comCor: boolean }) {
  const ctx = useQuadro();
  const [formatando, setFormatando] = useState(false);
  const ref = cartao.tipo === "pagina" || cartao.tipo === "nota" || cartao.tipo === "sessao";
  const comTexto = !ref;
  if (!ctx.podeEditar && !ref) return null;
  return (
    <NodeToolbar position={Position.Top} offset={12} className="qn-minibarra nodrag nopan">
      <div className="qn-mb-linha">
      {ctx.podeEditar && comCor && (
        <span className="qn-cores" role="group" aria-label="Cor">
          {CORES_CARTAO.map((c) => (
            <button
              key={c}
              type="button"
              data-cor={c}
              className={`qn-cor${cartao.cor === c ? " qn-cor--on" : ""}`}
              title={NOME_COR[c]}
              aria-label={NOME_COR[c]}
              aria-pressed={cartao.cor === c}
              onClick={() => ctx.mudarCor([cartao.id], c)}
            />
          ))}
        </span>
      )}
      {ctx.podeEditar && comTexto && (
        <button type="button" className={`qn-mb-btn qn-mb-btn--texto${formatando ? " qn-mb-btn--on" : ""}`} title="Formatar o texto" aria-label="Formatar o texto" aria-pressed={formatando} onClick={() => setFormatando((v) => !v)}>
          Aa
        </button>
      )}
      {ref && (
        <button type="button" className="qn-mb-btn" title="Abrir no diário" aria-label="Abrir no diário" onClick={() => ctx.abrirReferencia(cartao)}>
          <i className="fas fa-arrow-up-right-from-square" />
        </button>
      )}
      {ctx.podeEditar && ctx.temMapa && (cartao.tipo === "postit" || cartao.tipo === "pagina") && (
        <button
          type="button"
          className={`qn-mb-btn${cartao.formato === "alfinete" ? " qn-mb-btn--on" : ""}`}
          title={cartao.formato === "alfinete" ? "Voltar a ser cartão" : "Virar alfinete no mapa"}
          aria-label={cartao.formato === "alfinete" ? "Voltar a ser cartão" : "Virar alfinete"}
          aria-pressed={cartao.formato === "alfinete"}
          onClick={() => ctx.alfinete(cartao.id, cartao.formato !== "alfinete")}
        >
          <i className="fas fa-location-dot" />
        </button>
      )}
      {ctx.podeOcultar && (
        <button
          type="button"
          className={`qn-mb-btn${cartao.oculto ? " qn-mb-btn--on" : ""}`}
          title={cartao.oculto ? "Revelar à mesa (registra a sessão)" : "Ocultar da mesa (só o narrador vê)"}
          aria-label={cartao.oculto ? "Revelar à mesa" : "Ocultar da mesa"}
          aria-pressed={cartao.oculto}
          onClick={() => ctx.ocultar([cartao.id], !cartao.oculto)}
        >
          <i className={`fas ${cartao.oculto ? "fa-lock" : "fa-lock-open"}`} />
        </button>
      )}
      {ctx.podeEditar && (
        <>
          <button type="button" className="qn-mb-btn" title="Duplicar (Ctrl+D)" aria-label="Duplicar" onClick={() => ctx.duplicar([cartao.id])}>
            <i className="fas fa-clone" />
          </button>
          <button type="button" className="qn-mb-btn qn-mb-btn--perigo" title="Apagar (Delete)" aria-label="Apagar" onClick={() => ctx.apagar([cartao.id])}>
            <i className="fas fa-trash" />
          </button>
        </>
      )}
      </div>
      {formatando && ctx.podeEditar && comTexto && <FormatoDoTexto cartao={cartao} />}
    </NodeToolbar>
  );
}

// Painel de formatação do texto: tamanho (número com − e +), negrito, alinhamento e cor.
function FormatoDoTexto({ cartao }: { cartao: CartaoDTO }) {
  const ctx = useQuadro();
  const atual = cartao.fonte ?? FONTE_PADRAO[cartao.tipo];
  const passo = (sobe: boolean) => {
    const d = atual >= 40 ? 4 : atual >= 20 ? 2 : 1;
    ctx.formatar([cartao.id], { fonte: Math.max(FONTE_MIN, Math.min(FONTE_MAX, atual + (sobe ? d : -d))) });
  };
  const aplicar = (v: string) => {
    const n = Math.round(Number(v));
    if (Number.isFinite(n) && n >= FONTE_MIN && n <= FONTE_MAX && n !== atual) ctx.formatar([cartao.id], { fonte: n });
  };
  return (
    <div className="qn-fmt" role="group" aria-label="Formatação do texto">
      <span className="qn-fmt-grupo" role="group" aria-label="Tamanho da fonte">
        <button type="button" className="qn-mb-btn" title="Diminuir a fonte" aria-label="Diminuir a fonte" onClick={() => passo(false)} disabled={atual <= FONTE_MIN}>
          <i className="fas fa-minus" />
        </button>
        <input
          key={atual}
          className="qn-fmt-tam"
          type="number"
          min={FONTE_MIN}
          max={FONTE_MAX}
          defaultValue={atual}
          aria-label="Tamanho da fonte em pixels"
          onBlur={(e) => aplicar(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <button type="button" className="qn-mb-btn" title="Aumentar a fonte" aria-label="Aumentar a fonte" onClick={() => passo(true)} disabled={atual >= FONTE_MAX}>
          <i className="fas fa-plus" />
        </button>
        <button type="button" className="qn-mb-btn" title="Voltar ao tamanho padrão" aria-label="Voltar ao tamanho padrão" onClick={() => ctx.formatar([cartao.id], { fonte: null })} disabled={cartao.fonte === null}>
          <i className="fas fa-rotate-left" />
        </button>
      </span>
      <span className="qn-fmt-grupo">
        <button type="button" className={`qn-mb-btn qn-mb-btn--texto${cartao.negrito ? " qn-mb-btn--on" : ""}`} title="Negrito" aria-label="Negrito" aria-pressed={cartao.negrito} onClick={() => ctx.formatar([cartao.id], { negrito: !cartao.negrito })}>
          <b>B</b>
        </button>
      </span>
      <span className="qn-fmt-grupo" role="group" aria-label="Alinhamento">
        {(Object.keys(ICONE_ALINHAMENTO) as Alinhamento[]).map((a) => (
          <button key={a} type="button" className={`qn-mb-btn${cartao.alinhamento === a ? " qn-mb-btn--on" : ""}`} title={NOME_ALINHAMENTO[a]} aria-label={NOME_ALINHAMENTO[a]} aria-pressed={cartao.alinhamento === a} onClick={() => ctx.formatar([cartao.id], { alinhamento: a })}>
            <i className={`fas ${ICONE_ALINHAMENTO[a]}`} />
          </button>
        ))}
      </span>
      <span className="qn-fmt-grupo" role="group" aria-label="Cor do texto">
        {CORES_TEXTO.map((c) => (
          <button
            key={c}
            type="button"
            data-cor-texto={c}
            className={`qn-cor-texto${cartao.corTexto === c ? " qn-cor-texto--on" : ""}`}
            title={c === "padrao" ? "Cor padrão" : NOME_COR[c]}
            aria-label={c === "padrao" ? "Cor padrão" : NOME_COR[c]}
            aria-pressed={cartao.corTexto === c}
            onClick={() => ctx.formatar([cartao.id], { corTexto: c })}
          >
            A
          </button>
        ))}
      </span>
    </div>
  );
}

function Redimensionar({ cartao, selected, proporcional = false, min = [80, 40] }: { cartao: CartaoDTO; selected: boolean | undefined; proporcional?: boolean; min?: [number, number] }) {
  const ctx = useQuadro();
  return (
    <NodeResizer
      isVisible={!!selected && ctx.podeEditar}
      minWidth={min[0]}
      minHeight={min[1]}
      keepAspectRatio={proporcional}
      lineClassName="qn-resize-linha"
      handleClassName="qn-resize-ponto"
      onResizeStart={() => ctx.iniciarTamanho(cartao.id)}
      onResizeEnd={(_, p) => ctx.salvarTamanho(cartao.id, { x: p.x, y: p.y, largura: p.width, altura: p.height })}
    />
  );
}

// Texto digitado direto no cartão: duplo clique edita, sai com clique fora; Esc descarta.
function TextoEditavel({ cartao, classe, placeholder, linhaUnica = false }: { cartao: CartaoDTO; classe: string; placeholder: string; linhaUnica?: boolean }) {
  const ctx = useQuadro();
  if (ctx.editandoId === cartao.id && ctx.podeEditar) return <EditorTexto cartao={cartao} classe={classe} placeholder={placeholder} linhaUnica={linhaUnica} />;
  return (
    <div className={classe} style={estiloTexto(cartao)} data-cor-texto={cartao.corTexto} onDoubleClick={() => ctx.podeEditar && ctx.editar(cartao.id)}>
      {cartao.texto ? cartao.texto : <span className="qn-placeholder">{placeholder}</span>}
    </div>
  );
}

// Só existe enquanto edita: o texto parte do que o cartão tem na hora de abrir.
function EditorTexto({ cartao, classe, placeholder, linhaUnica }: { cartao: CartaoDTO; classe: string; placeholder: string; linhaUnica: boolean }) {
  const ctx = useQuadro();
  const [valor, setValor] = useState(cartao.texto);
  const descartar = useRef(false);
  const area = useRef<HTMLTextAreaElement>(null);

  // O nó recém-criado fica oculto até o React Flow medi-lo, e foco em elemento oculto não pega: tenta de novo.
  useEffect(() => {
    let tentativas = 0;
    let quadro = 0;
    const tentar = () => {
      const a = area.current;
      if (!a) return;
      a.focus();
      if (document.activeElement === a) {
        a.setSelectionRange(a.value.length, a.value.length);
      } else if (++tentativas < 30) {
        quadro = requestAnimationFrame(tentar);
      }
    };
    tentar();
    return () => cancelAnimationFrame(quadro);
  }, []);

  return (
    <textarea
      ref={area}
      className={`${classe} qn-entrada nodrag nopan nowheel`}
      style={estiloTexto(cartao)}
      data-cor-texto={cartao.corTexto}
      value={valor}
      placeholder={placeholder}
      onChange={(e) => setValor(e.target.value)}
      onBlur={() => {
        if (!descartar.current) ctx.salvarTexto(cartao.id, valor);
        ctx.editar(null);
      }}
      onKeyDown={(e) => {
        // Teclas do texto não são atalhos do quadro (Delete apagaria o cartão).
        e.stopPropagation();
        if (e.key === "Escape") {
          descartar.current = true;
          e.currentTarget.blur();
        } else if (e.key === "Enter" && (linhaUnica || e.ctrlKey || e.metaKey)) {
          // Título e legenda são de uma linha; no resto, Ctrl+Enter termina.
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

// Cadeado (só o narrador vê o cartão oculto) e "revelado na Sessão N" (aparece ao passar o mouse ou selecionar).
function Selos({ cartao }: { cartao: CartaoDTO }) {
  const ctx = useQuadro();
  if (cartao.oculto) {
    return (
      <span className="qn-selo qn-selo--oculto" title="Oculto: só o narrador vê este cartão">
        <i className="fas fa-lock" /> Oculto
      </span>
    );
  }
  const s = cartao.reveladoSessaoId ? ctx.sessoes.get(cartao.reveladoSessaoId) : undefined;
  if (!s) return null;
  const nome = s.numero != null ? `Sessão ${s.numero}` : rotuloSessao(s);
  return (
    <span className="qn-selo qn-selo--revelado" title={`O narrador revelou este cartão à mesa na ${nome}`}>
      <i className="fas fa-eye" /> Revelado · {nome}
    </span>
  );
}

// Alfinete (mapa): o cartão vira um pino com o nome embaixo. A ponta do pino é a base do nó (40 x 48).
function Alfinete({ cartao, selected, rotulo, cor, editavel }: { cartao: CartaoDTO; selected: boolean | undefined; rotulo: string; cor?: string; editavel?: boolean }) {
  const ctx = useQuadro();
  return (
    <div className="qn qn-alfinete" data-cor={cartao.cor} data-selecionado={selected || undefined} data-autor={corDaPessoa(cartao.autorId)}>
      <MiniBarra cartao={cartao} comCor={cartao.tipo === "postit"} />
      <i className="fas fa-location-dot qn-pino" style={cor ? { color: cor } : undefined} aria-hidden />
      <div className="qn-alfinete-rotulo">
        {editavel ? (
          <TextoEditavel cartao={cartao} classe="qn-alfinete-texto" placeholder="Alfinete" linhaUnica />
        ) : (
          <span onDoubleClick={() => ctx.abrirReferencia(cartao)}>{rotulo}</span>
        )}
      </div>
      <Alcas />
      <Selos cartao={cartao} />
    </div>
  );
}

// A imagem de fundo do quadro (o mapa). Fica atrás de tudo e não se mexe nem se seleciona.
export function MapaNo({ data }: NodeProps<Node<{ url: string }>>) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="qn-mapa" src={data.url} alt="Mapa do quadro" draggable={false} />;
}

function Autor({ cartao }: { cartao: CartaoDTO }) {
  const ctx = useQuadro();
  const nome = cartao.autorId === ctx.meuId ? "Você" : (ctx.autores[cartao.autorId] ?? "Jogador");
  return <span className="qn-autor">{nome}</span>;
}

/* ─── Post-it ─── */
export function PostitNo({ data, selected }: NodeProps<NoCartao>) {
  const c = data.cartao;
  if (c.formato === "alfinete") return <Alfinete cartao={c} selected={selected} rotulo={c.texto} editavel />;
  return (
    <div className="qn qn-postit" data-cor={c.cor} data-selecionado={selected || undefined} data-autor={corDaPessoa(c.autorId)}>
      <Redimensionar cartao={c} selected={selected} min={[120, 100]} />
      <MiniBarra cartao={c} comCor />
      <TextoEditavel cartao={c} classe="qn-postit-texto" placeholder="Duplo clique para escrever" />
      <Autor cartao={c} />
      <Alcas />
      <Selos cartao={c} />
    </div>
  );
}

/* ─── Texto solto ─── */
export function TextoSoltoNo({ data, selected }: NodeProps<NoCartao>) {
  const c = data.cartao;
  return (
    <div className="qn qn-texto-solto" data-cor={c.cor} data-selecionado={selected || undefined} data-autor={corDaPessoa(c.autorId)}>
      <Redimensionar cartao={c} selected={selected} min={[80, 32]} />
      <MiniBarra cartao={c} comCor={false} />
      <TextoEditavel cartao={c} classe="qn-texto-grande" placeholder="Duplo clique para escrever" />
      <Alcas />
      <Selos cartao={c} />
    </div>
  );
}

/* ─── Moldura de grupo ─── */
export function MolduraNo({ data, selected }: NodeProps<NoCartao>) {
  const c = data.cartao;
  return (
    <div className="qn qn-moldura" data-cor={c.cor} data-selecionado={selected || undefined} data-autor={corDaPessoa(c.autorId)}>
      <Redimensionar cartao={c} selected={selected} min={[160, 120]} />
      <MiniBarra cartao={c} comCor />
      <div className="qn-moldura-cabeca">
        <i className="fas fa-object-group" aria-hidden />
        <TextoEditavel cartao={c} classe="qn-moldura-titulo" placeholder="Grupo sem nome" linhaUnica />
      </div>
      {/* O miolo deixa o clique passar (dá pra mexer no que está dentro); só a borda e o título pegam. */}
      <span className="qn-moldura-borda qn-moldura-borda--t" />
      <span className="qn-moldura-borda qn-moldura-borda--b" />
      <span className="qn-moldura-borda qn-moldura-borda--l" />
      <span className="qn-moldura-borda qn-moldura-borda--r" />
      <Alcas />
      <Selos cartao={c} />
    </div>
  );
}

/* ─── Imagem ─── */
export function ImagemNo({ data, selected }: NodeProps<NoCartao>) {
  const c = data.cartao;
  return (
    <div className="qn qn-imagem" data-cor={c.cor} data-selecionado={selected || undefined} data-autor={corDaPessoa(c.autorId)}>
      <Redimensionar cartao={c} selected={selected} proporcional min={[80, 60]} />
      <MiniBarra cartao={c} comCor={false} />
      <div className="qn-imagem-moldura">
        {c.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.url} alt={c.texto} draggable={false} />
        ) : (
          <i className="fas fa-image" aria-hidden />
        )}
      </div>
      <TextoEditavel cartao={c} classe="qn-imagem-legenda" placeholder="Legenda" linhaUnica />
      <Alcas />
      <Selos cartao={c} />
    </div>
  );
}

/* ─── Referências: página, anotação e sessão ─── */
function Referencia({ cartao, selected, icone, titulo, previa, rodape, foto, semAcesso, corIcone }: {
  cartao: CartaoDTO;
  selected: boolean | undefined;
  icone: string;
  titulo: string;
  previa: string;
  rodape?: string;
  foto?: string | null;
  semAcesso: boolean;
  corIcone?: string;
}) {
  const ctx = useQuadro();
  return (
    <div
      className={`qn qn-ref${semAcesso ? " qn-ref--sem-acesso" : ""}`}
      data-selecionado={selected || undefined} data-autor={corDaPessoa(cartao.autorId)}
      onDoubleClick={() => !semAcesso && ctx.abrirReferencia(cartao)}
    >
      <Redimensionar cartao={cartao} selected={selected} min={[180, 80]} />
      <MiniBarra cartao={cartao} comCor={false} />
      <span className="qn-ref-foto" style={corIcone ? { color: corIcone } : undefined}>
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} alt="" draggable={false} />
        ) : (
          <i className={`fas ${icone}`} aria-hidden />
        )}
      </span>
      <span className="qn-ref-corpo">
        <span className="qn-ref-titulo">{titulo}</span>
        {previa && <span className="qn-ref-previa">{previa}</span>}
        {rodape && <span className="qn-ref-rodape">{rodape}</span>}
      </span>
      <Alcas />
      <Selos cartao={cartao} />
    </div>
  );
}

export function PaginaNo({ data, selected }: NodeProps<NoCartao>) {
  const c = data.cartao;
  const ctx = useQuadro();
  const p = c.refId ? ctx.paginas.get(c.refId) : undefined;
  const t = p ? tipoDaPagina(p.tipo) : undefined;
  if (c.formato === "alfinete") return <Alfinete cartao={c} selected={selected} rotulo={p ? p.nome : "Página sem acesso"} cor={t?.cor} />;
  return (
    <Referencia
      cartao={c}
      selected={selected}
      icone={t?.icone ?? "fa-lock"}
      corIcone={t?.cor}
      titulo={p ? p.nome : "Página sem acesso"}
      previa={p ? p.previa : "Ela foi apagada ou é privada de outra pessoa."}
      rodape={p ? (t?.nome ?? "Página") + (p.visibilidade === "oculta" ? " · só narrador" : "") : undefined}
      foto={p?.fotoUrl}
      semAcesso={!p}
    />
  );
}

export function NotaNo({ data, selected }: NodeProps<NoCartao>) {
  const c = data.cartao;
  const ctx = useQuadro();
  const n = c.refId ? ctx.notas.get(c.refId) : undefined;
  const sessao = n?.sessaoId ? ctx.sessoes.get(n.sessaoId) : undefined;
  return (
    <Referencia
      cartao={c}
      selected={selected}
      icone={n ? "fa-note-sticky" : "fa-lock"}
      titulo={n ? (n.titulo ?? "Anotação") : "Anotação sem acesso"}
      previa={n ? n.previa : "Ela foi apagada ou é privada de outra pessoa."}
      rodape={n ? [sessao ? rotuloSessao(sessao) : "Entre sessões", n.autorId === ctx.meuId ? "sua" : (ctx.autores[n.autorId] ?? "")].filter(Boolean).join(" · ") : undefined}
      semAcesso={!n}
    />
  );
}

export function SessaoNo({ data, selected }: NodeProps<NoCartao>) {
  const c = data.cartao;
  const ctx = useQuadro();
  const s = c.refId ? ctx.sessoes.get(c.refId) : undefined;
  return (
    <Referencia
      cartao={c}
      selected={selected}
      icone="fa-flag"
      titulo={s ? rotuloSessao(s) : "Sessão apagada"}
      previa={s ? (dataDaSessao(s) ?? "") : ""}
      rodape={s?.ativa ? "ao vivo" : "Sessão"}
      semAcesso={!s}
    />
  );
}

