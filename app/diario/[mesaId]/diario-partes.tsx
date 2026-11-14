"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { createClient } from "@/lib/supabase/client";
import { exigir } from "@/lib/acoes";
import { imagensDeRica } from "@/lib/descricao-rica";
import {
  RELACAO_FICHA,
  STATUS_FICHA,
  TIPOS_FICHA,
  extrairAtalhos,
  rotuloSessao,
  type CamposFicha,
  type FichaDiarioDTO,
  type MencaoDiarioDTO,
  type NotaDiarioDTO,
  type SessaoDiarioDTO,
  type TipoFichaDiario,
} from "@/lib/diario-tipos";
import { DescricaoRica } from "@/components/descricao-rica/descricao-rica";
import { EditorRico } from "@/components/descricao-rica/editor-rico";
import type { ContextoRico, OpcaoRef } from "@/components/descricao-rica/atomos";
import { RetratoUpload } from "@/app/bestiario/retrato-upload";
import {
  apagarFichaDiario,
  apagarNotaDiario,
  criarFichaDiario,
  criarNotaDiario,
  editarFichaDiario,
  definirEditoresFichaDiario,
  editarNotaDiario,
  mesclarFichaDiario,
  nomearSessaoDiario,
  publicarFichaDiario,
  publicarNotaDiario,
} from "./actions";

export const ENTRE = "entre"; // "Entre sessões" (sessaoId nulo)

export function avisar(texto: string) {
  void Swal.fire({ icon: "error", title: "Erro", text: texto, background: "var(--bg-card)", color: "var(--text-main)" });
}

export async function confirmar(texto: string): Promise<boolean> {
  const r = await Swal.fire({
    icon: "warning",
    title: texto,
    showCancelButton: true,
    confirmButtonText: "Apagar",
    cancelButtonText: "Cancelar",
    background: "var(--bg-card)",
    color: "var(--text-main)",
  });
  return r.isConfirmed;
}

export const iconeDoTipo = (t: TipoFichaDiario) => TIPOS_FICHA.find((x) => x.id === t)?.icone ?? "fa-address-card";


export function NomearSessao({
  mesaId,
  sessao,
  aoFechar,
  aoSalvar,
}: {
  mesaId: string;
  sessao: SessaoDiarioDTO;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [numero, setNumero] = useState(sessao.numero?.toString() ?? "");
  const [titulo, setTitulo] = useState(sessao.titulo ?? "");
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    setSalvando(true);
    try {
      exigir(await nomearSessaoDiario(mesaId, sessao.id, numero.trim() ? Number(numero) : null, titulo));
      aoSalvar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }
  return (
    <div className="diario-form diario-nota">
      <div className="diario-form-linha">
        <label style={{ flex: "0 0 110px" }}>
          Número
          <input type="number" min={1} max={9999} value={numero} onChange={(e) => setNumero(e.target.value)} />
        </label>
        <label>
          Título
          <input type="text" maxLength={80} value={titulo} placeholder="A fuga de Enies Lobby" onChange={(e) => setTitulo(e.target.value)} />
        </label>
      </div>
      <div className="diario-form-acoes">
        <button type="button" className="diario-btn" onClick={aoFechar} disabled={salvando}>
          Cancelar
        </button>
        <button type="button" className="diario-btn diario-btn--primario" onClick={() => void salvar()} disabled={salvando}>
          Salvar
        </button>
      </div>
    </div>
  );
}


/* ─── Visibilidade ───────────────────────────────────────── */

export function SeloVisibilidade({ visibilidade }: { visibilidade: string }) {
  const publica = visibilidade === "publica";
  return (
    <span className={`diario-selo${publica ? " diario-selo--publica" : ""}`} title={publica ? "Visível para toda a mesa" : "Só você e o narrador"}>
      <i className={`fas ${publica ? "fa-earth-americas" : "fa-lock"}`} /> {publica ? "Pública" : "Privada"}
    </span>
  );
}

// Publica ou volta a privada. Publicar uma ficha com o nome de uma pública que já
// existe pergunta se é pra mesclar (as menções passam pra pública) ou publicar assim mesmo.
export async function alternarVisibilidadeFicha(
  mesaId: string,
  f: FichaDiarioDTO,
  aoMudou: (abrirId?: string) => void,
) {
  try {
    if (f.visibilidade === "publica") {
      const r = await Swal.fire({
        icon: "question",
        title: "Tornar a ficha privada?",
        text: "Os outros jogadores deixam de vê-la e os editores extras são removidos.",
        showCancelButton: true,
        confirmButtonText: "Tornar privada",
        cancelButtonText: "Cancelar",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      if (!r.isConfirmed) return;
      exigir(await publicarFichaDiario(mesaId, f.id, "privada"));
      return aoMudou();
    }
    const r = exigir(await publicarFichaDiario(mesaId, f.id, "publica"));
    if (!r.conflito) return aoMudou();
    const c = r.conflito;
    const resp = await Swal.fire({
      icon: "question",
      title: `Já existe “${c.nome}” na área pública`,
      text: "Mesclar liga as suas menções à ficha pública e guarda o que você sabia como anotação privada. Publicar assim mesmo cria uma segunda ficha.",
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: "Mesclar",
      denyButtonText: "Publicar assim mesmo",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (resp.isConfirmed) {
      const m = exigir(await mesclarFichaDiario(mesaId, f.id, c.id));
      return aoMudou(m.destinoId);
    }
    if (resp.isDenied) {
      exigir(await publicarFichaDiario(mesaId, f.id, "publica", true));
      return aoMudou();
    }
  } catch (e) {
    avisar(e instanceof Error ? e.message : "Falha ao mudar a visibilidade.");
  }
}

export async function alternarVisibilidadeNota(mesaId: string, n: NotaDiarioDTO, aoMudou: () => void) {
  try {
    exigir(await publicarNotaDiario(mesaId, n.id, n.visibilidade === "publica" ? "privada" : "publica"));
    aoMudou();
  } catch (e) {
    avisar(e instanceof Error ? e.message : "Falha ao mudar a visibilidade.");
  }
}

function EditoresFicha({
  mesaId,
  ficha,
  membros,
  aoSalvar,
}: {
  mesaId: string;
  ficha: FichaDiarioDTO;
  membros: { id: string; nome: string }[];
  aoSalvar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [sel, setSel] = useState<string[]>(ficha.editores);
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    setSalvando(true);
    try {
      exigir(await definirEditoresFichaDiario(mesaId, ficha.id, sel));
      setAberto(false);
      aoSalvar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }
  return (
    <div className="diario-editores">
      <button type="button" className="diario-btn" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
        <i className="fas fa-user-pen" /> Editores{ficha.editores.length > 0 ? ` (${ficha.editores.length})` : ""}
      </button>
      {aberto && (
        <div className="diario-editores-painel">
          <p className="diario-aviso">Além de você e do narrador, quem pode editar esta ficha:</p>
          {membros.length === 0 && <p className="diario-aviso">Ninguém mais na mesa.</p>}
          {membros.map((m) => (
            <label key={m.id} className="diario-check">
              <input
                type="checkbox"
                checked={sel.includes(m.id)}
                onChange={(e) => setSel(e.target.checked ? [...sel, m.id] : sel.filter((x) => x !== m.id))}
              />{" "}
              {m.nome}
            </label>
          ))}
          <div className="diario-form-acoes">
            <button type="button" className="diario-btn" onClick={() => setAberto(false)} disabled={salvando}>
              Cancelar
            </button>
            <button type="button" className="diario-btn diario-btn--primario" onClick={() => void salvar()} disabled={salvando}>
              Salvar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function NotaCard({
  nota,
  contexto,
  autor,
  dataJogo,
  podeEditar,
  aoEditar,
  aoApagar,
  aoAlternarVisibilidade,
}: {
  nota: NotaDiarioDTO;
  contexto: ContextoRico;
  autor: string | null;
  // A data do jogo em que foi anotada (calendário da mesa).
  dataJogo?: string | null;
  podeEditar: boolean;
  aoEditar: () => void;
  aoApagar: () => void;
  // Só o autor: publica ou volta a privada.
  aoAlternarVisibilidade?: () => void;
}) {
  return (
    <article className={`diario-nota${nota.importante ? " diario-nota--importante" : ""}`}>
      <div className="diario-nota-meta">
        {nota.importante && <i className="fas fa-star" style={{ color: "var(--warning)" }} title="Importante" />}
        <span>{new Date(nota.criadaEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
        {dataJogo && (
          <span title="Data no jogo">
            <i className="fas fa-calendar-day" /> {dataJogo}
          </span>
        )}
        {autor && (
          <span>
            <i className="fas fa-user" /> {autor}
          </span>
        )}
        <SeloVisibilidade visibilidade={nota.visibilidade} />
        {nota.tags.map((t) => (
          <span key={t} className="diario-tag">
            #{t}
          </span>
        ))}
        {podeEditar && (
          <span className="diario-nota-acoes">
            {aoAlternarVisibilidade && (
              <button
                type="button"
                className="diario-btn"
                onClick={aoAlternarVisibilidade}
                title={nota.visibilidade === "publica" ? "Tornar privada" : "Publicar para a mesa"}
                aria-label={nota.visibilidade === "publica" ? "Tornar privada" : "Publicar para a mesa"}
              >
                <i className={`fas ${nota.visibilidade === "publica" ? "fa-lock" : "fa-earth-americas"}`} />
              </button>
            )}
            <button type="button" className="diario-btn" onClick={aoEditar} aria-label="Editar anotação">
              <i className="fas fa-pen" />
            </button>
            <button type="button" className="diario-btn diario-btn--perigo" onClick={aoApagar} aria-label="Apagar anotação">
              <i className="fas fa-trash" />
            </button>
          </span>
        )}
      </div>
      {nota.titulo && <h4 className="diario-nota-titulo">{nota.titulo}</h4>}
      <DescricaoRica texto={nota.corpo} contexto={contexto} />
    </article>
  );
}

/* ─── Editor com imagem ──────────────────────────────────── */

// Envia a imagem pro Storage (caminho difícil de adivinhar, como os retratos).
export async function enviarImagem(mesaId: string, meuId: string, arquivo: File): Promise<string> {
  if (!arquivo.type.startsWith("image/")) throw new Error("Só imagens.");
  if (arquivo.size > 8 * 1024 * 1024) throw new Error("Imagem passa de 8 MB.");
  const ext = (arquivo.type.split("/")[1] ?? "png").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "png";
  const caminho = `diario/${mesaId}/${meuId}/${crypto.randomUUID()}.${ext}`;
  const supabase = createClient();
  const { error } = await supabase.storage.from("avatars").upload(caminho, arquivo, { contentType: arquivo.type });
  if (error) throw error;
  return supabase.storage.from("avatars").getPublicUrl(caminho).data.publicUrl;
}

// Editor rico com imagem: colar (Ctrl+V), arrastar ou o botão "Imagem". Ela
// entra no ponto do cursor e aparece no próprio editor.
export function EditorComImagem({
  mesaId,
  meuId,
  valor,
  onChange,
  refs,
  contexto,
  placeholder,
}: {
  mesaId: string;
  meuId: string;
  valor: string;
  onChange: (v: string) => void;
  refs: OpcaoRef[];
  contexto: ContextoRico;
  placeholder: string;
}) {
  const router = useRouter();
  return (
    <div className="diario-editor-caixa">
      <EditorRico
        valor={valor}
        onChange={onChange}
        refs={refs}
        contexto={contexto}
        placeholder={placeholder}
        enviarImagem={(arquivo) => enviarImagem(mesaId, meuId, arquivo)}
        criarFicha={{
          tipos: TIPOS_FICHA.map((t) => ({ id: t.id, nome: t.nome, icone: t.icone })),
          criar: async (nome, tipo) => {
            const r = exigir(await criarFichaDiario(mesaId, { tipo: tipo as TipoFichaDiario, nome }));
            // A ficha nova entra na linha e vira opção do @ nas próximas menções.
            router.refresh();
            return { tipo: "ficha", id: r.id, nome };
          },
        }}
      />
    </div>
  );
}

/* ─── Formulário de anotação ─────────────────────────────── */

export function NotaForm({
  mesaId,
  meuId,
  inicial,
  sessaoPadrao,
  sessoes,
  refs,
  contexto,
  aoFechar,
  aoSalvar,
}: {
  mesaId: string;
  meuId: string;
  inicial: NotaDiarioDTO | null;
  sessaoPadrao: string | null;
  sessoes: SessaoDiarioDTO[];
  refs: OpcaoRef[];
  contexto: ContextoRico;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [titulo, setTitulo] = useState(inicial?.titulo ?? "");
  const [corpo, setCorpo] = useState(inicial?.corpo ?? "");
  const [tags, setTags] = useState(inicial?.tags.join(", ") ?? "");
  const [importante, setImportante] = useState(inicial?.importante ?? false);
  const [sessao, setSessao] = useState<string>(inicial ? (inicial.sessaoId ?? ENTRE) : (sessaoPadrao ?? ENTRE));
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    try {
      // `#tag` no texto e "! " no começo valem como tag e importante.
      const a = extrairAtalhos(corpo);
      const dados = {
        titulo,
        corpo: a.corpo,
        tags: [...new Set([...tags.split(/[,\s]+/).filter(Boolean), ...a.tags])],
        importante: importante || a.importante,
        sessaoId: sessao === ENTRE ? null : sessao,
      };
      if (inicial) exigir(await editarNotaDiario(mesaId, inicial.id, dados));
      else exigir(await criarNotaDiario(mesaId, dados));
      aoSalvar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="diario-form">
      <h2>{inicial ? "Editar anotação" : "Nova anotação"}</h2>
      <label>
        Título (opcional)
        <input type="text" maxLength={80} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: O mapa de Alabasta" />
      </label>
      <EditorComImagem
        mesaId={mesaId}
        meuId={meuId}
        valor={corpo}
        onChange={setCorpo}
        refs={refs}
        contexto={contexto}
        placeholder="O que aconteceu? (@ menciona uma ficha ou sessão)"
      />
      <div className="diario-form-linha">
        <label>
          Sessão
          <select value={sessao} onChange={(e) => setSessao(e.target.value)}>
            {sessoes.map((s) => (
              <option key={s.id} value={s.id}>
                {rotuloSessao(s)}
                {s.ativa ? " (ativa)" : ""}
              </option>
            ))}
            <option value={ENTRE}>Entre sessões</option>
          </select>
        </label>
        <label>
          Tags (separadas por vírgula)
          <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="pista, mapa" />
        </label>
      </div>
      <label className="diario-check">
        <input type="checkbox" checked={importante} onChange={(e) => setImportante(e.target.checked)} /> Importante
      </label>
      <div className="diario-form-acoes">
        <button type="button" className="diario-btn" onClick={aoFechar} disabled={salvando}>
          Cancelar
        </button>
        <button
          type="button"
          className="diario-btn diario-btn--primario"
          onClick={() => void salvar()}
          disabled={salvando || !corpo.trim()}
        >
          {salvando ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}

/* ─── Fichas ─────────────────────────────────────────────── */

export function FichaDetalhe({
  mesaId,
  meuId,
  ficha,
  notas,
  sessoes,
  fichas,
  mencoes,
  contexto,
  nomeAutor,
  mostrarAutor,
  aoEditarFicha,
  aoEditarNota,
  aoMudou,
  aoAtualizar,
  aoAbrirFicha,
  ehNarrador,
  membros,
  somenteLeitura = false,
}: {
  mesaId: string;
  meuId: string;
  ficha: FichaDiarioDTO | null;
  notas: NotaDiarioDTO[];
  sessoes: SessaoDiarioDTO[];
  fichas: FichaDiarioDTO[];
  mencoes: MencaoDiarioDTO[];
  contexto: ContextoRico;
  nomeAutor: (id: string) => string;
  mostrarAutor: boolean;
  aoEditarFicha: (f: FichaDiarioDTO) => void;
  aoEditarNota: (n: NotaDiarioDTO) => void;
  // Apagou: fecha o painel e recarrega.
  aoMudou: () => void;
  // Mudou visibilidade ou editores: só recarrega.
  aoAtualizar: () => void;
  aoAbrirFicha: (id: string) => void;
  ehNarrador: boolean;
  membros: { id: string; nome: string }[];
  // Sem editar, apagar nem publicar (narrador vendo o diário de um jogador).
  somenteLeitura?: boolean;
}) {
  // Linha do tempo: as anotações que mencionam a ficha, agrupadas por sessão.
  const grupos = useMemo(() => {
    if (!ficha) return [];
    // Quem cita a ficha vem da tabela de menções (já filtrada pelo servidor).
    const idsQueCitam = new Set(
      mencoes.filter((m) => m.alvoTipo === "ficha" && m.alvoId === ficha.id && m.origemTipo === "nota").map((m) => m.origemId),
    );
    const citam = notas.filter((n) => idsQueCitam.has(n.id));
    const porSessao = new Map<string, NotaDiarioDTO[]>();
    for (const n of citam) {
      const k = n.sessaoId ?? ENTRE;
      porSessao.set(k, [...(porSessao.get(k) ?? []), n]);
    }
    const ordem = [...sessoes.map((s) => s.id), ENTRE];
    return ordem
      .filter((k) => porSessao.has(k))
      .map((k) => ({
        id: k,
        rotulo: k === ENTRE ? "Entre sessões" : rotuloSessao(sessoes.find((s) => s.id === k)!),
        notas: porSessao.get(k)!.sort((a, b) => a.criadaEm.localeCompare(b.criadaEm)),
      }));
  }, [ficha, notas, sessoes, mencoes]);

  // "Visto pela última vez": a sessão mais recente com anotação que cita a ficha.
  const vistoPorUltimo = useMemo(() => {
    const comSessao = grupos.filter((g) => g.id !== ENTRE);
    if (comSessao.length === 0) return null;
    const ordenadas = comSessao
      .map((g) => sessoes.find((s) => s.id === g.id))
      .filter((s): s is SessaoDiarioDTO => !!s)
      .sort((a, b) => b.iniciadaEm.localeCompare(a.iniciadaEm));
    return ordenadas[0] ?? null;
  }, [grupos, sessoes]);

  // "Citada junto com": outras fichas mencionadas nas mesmas anotações, mais frequentes primeiro.
  const juntoCom = useMemo(() => {
    if (!ficha) return [];
    const notasQueCitam = new Set(grupos.flatMap((g) => g.notas.map((n) => n.id)));
    const cont = new Map<string, number>();
    for (const m of mencoes) {
      if (m.origemTipo === "nota" && m.alvoTipo === "ficha" && m.alvoId !== ficha.id && notasQueCitam.has(m.origemId)) {
        cont.set(m.alvoId, (cont.get(m.alvoId) ?? 0) + 1);
      }
    }
    return [...cont.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .flatMap(([id]) => fichas.find((f) => f.id === id) ?? []);
  }, [ficha, grupos, mencoes, fichas]);

  // Galeria: toda imagem do resumo e das anotações que citam a ficha.
  const galeria = useMemo(() => {
    if (!ficha) return [];
    const vistas = new Set<string>();
    const out: { url: string; legenda: string }[] = [];
    const textos = [ficha.resumo, ...grupos.flatMap((g) => g.notas.map((n) => n.corpo))];
    for (const t of textos) {
      for (const im of imagensDeRica(t)) {
        if (!vistas.has(im.url)) {
          vistas.add(im.url);
          out.push(im);
        }
      }
    }
    return out;
  }, [ficha, grupos]);
  const [zoom, setZoom] = useState<{ url: string; legenda: string } | null>(null);

  if (!ficha) return <p className="diario-vazio">Ficha não encontrada.</p>;
  const tipo = TIPOS_FICHA.find((t) => t.id === ficha.tipo);
  const campos = ficha.campos;
  const souAutor = ficha.autorId === meuId;
  const publica = ficha.visibilidade === "publica";
  // Editar: o autor; na pública, também o narrador e os editores que o autor escolheu.
  const podeEditar = !somenteLeitura && (souAutor || (publica && (ehNarrador || ficha.editores.includes(meuId))));
  const podeApagar = !somenteLeitura && (souAutor || (publica && ehNarrador));

  return (
    <>
      <div className="diario-ficha-cab">
        {ficha.retratoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="diario-retrato" src={ficha.retratoUrl} alt="" />
        ) : (
          <div className="diario-retrato">
            <i className={`fas ${iconeDoTipo(ficha.tipo)}`} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ marginBottom: 2 }}>{ficha.nome}</h2>
          <div className="diario-chips">
            <span className="diario-chip">
              <i className={`fas ${iconeDoTipo(ficha.tipo)}`} /> {tipo?.nome}
            </span>
            {campos.status && <span className="diario-chip">{campos.status}</span>}
            {campos.relacao && <span className="diario-chip">{campos.relacao}</span>}
            {campos.visto && (
              <span className="diario-chip">
                <i className="fas fa-location-dot" /> {campos.visto}
              </span>
            )}
            {(mostrarAutor || !souAutor) && <span className="diario-chip">por {nomeAutor(ficha.autorId)}</span>}
            <SeloVisibilidade visibilidade={ficha.visibilidade} />
          </div>
          {ficha.apelidos.length > 0 && <p className="diario-aviso">Também: {ficha.apelidos.join(", ")}</p>}
          {vistoPorUltimo && (
            <p className="diario-aviso">
              <i className="fas fa-eye" /> Visto pela última vez: {rotuloSessao(vistoPorUltimo)}
            </p>
          )}
        </div>
        <div className="diario-nota-acoes">
          {podeEditar && (
            <button type="button" className="diario-btn" onClick={() => aoEditarFicha(ficha)} aria-label="Editar ficha">
              <i className="fas fa-pen" />
            </button>
          )}
          {podeApagar && (
            <button
              type="button"
              className="diario-btn diario-btn--perigo"
              aria-label="Apagar ficha"
              onClick={async () => {
                if (!(await confirmar(`Apagar “${ficha.nome}”?`))) return;
                try {
                  exigir(await apagarFichaDiario(mesaId, ficha.id));
                  aoMudou();
                } catch (e) {
                  avisar(e instanceof Error ? e.message : "Falha ao apagar.");
                }
              }}
            >
              <i className="fas fa-trash" />
            </button>
          )}
        </div>
      </div>

      {souAutor && !somenteLeitura && (
        <div className="diario-visibilidade">
          <button
            type="button"
            className="diario-btn"
            onClick={() => void alternarVisibilidadeFicha(mesaId, ficha, (id) => (id ? aoAbrirFicha(id) : aoAtualizar()))}
          >
            <i className={`fas ${publica ? "fa-lock" : "fa-earth-americas"}`} />{" "}
            {publica ? "Tornar privada" : ehNarrador ? "Revelar para a mesa" : "Publicar para a mesa"}
          </button>
          {publica && <EditoresFicha key={ficha.editores.join(",")} mesaId={mesaId} ficha={ficha} membros={membros} aoSalvar={aoAtualizar} />}
        </div>
      )}

      {ficha.resumo ? <DescricaoRica texto={ficha.resumo} contexto={contexto} /> : <p className="diario-aviso">Sem resumo ainda.</p>}

      {galeria.length > 0 && (
        <>
          <h3 className="diario-grupo-titulo">Galeria ({galeria.length})</h3>
          <div className="diario-galeria">
            {galeria.map((im) => (
              <button key={im.url} type="button" className="diario-galeria-item" onClick={() => setZoom(im)} title={im.legenda || "Ampliar"}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.url} alt={im.legenda} loading="lazy" />
              </button>
            ))}
          </div>
        </>
      )}
      {zoom && (
        <div className="diario-zoom" onClick={() => setZoom(null)} role="dialog" aria-label="Imagem ampliada">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom.url} alt={zoom.legenda} />
        </div>
      )}

      {juntoCom.length > 0 && (
        <>
          <h3 className="diario-grupo-titulo">Citada junto com</h3>
          <div className="diario-chips">
            {juntoCom.map((f) => (
              <button key={f.id} type="button" className="diario-chip diario-chip--botao" onClick={() => aoAbrirFicha(f.id)}>
                <i className={`fas ${iconeDoTipo(f.tipo)}`} /> {f.nome}
              </button>
            ))}
          </div>
        </>
      )}

      <h3 className="diario-grupo-titulo">Linha do tempo</h3>
      {grupos.length === 0 && <p className="diario-aviso">Nenhuma anotação menciona esta ficha. Use @ numa anotação.</p>}
      {grupos.map((g) => (
        <div key={g.id}>
          <h4 className="diario-grupo-titulo">{g.rotulo}</h4>
          {g.notas.map((n) => (
            <NotaCard
              key={n.id}
              nota={n}
              contexto={contexto}
              autor={mostrarAutor ? nomeAutor(n.autorId) : null}
              podeEditar={!somenteLeitura && n.autorId === meuId}
              aoAlternarVisibilidade={!somenteLeitura && n.autorId === meuId ? () => void alternarVisibilidadeNota(mesaId, n, aoAtualizar) : undefined}
              aoEditar={() => aoEditarNota(n)}
              aoApagar={async () => {
                if (!(await confirmar("Apagar esta anotação?"))) return;
                try {
                  exigir(await apagarNotaDiario(mesaId, n.id));
                  aoMudou();
                } catch (e) {
                  avisar(e instanceof Error ? e.message : "Falha ao apagar.");
                }
              }}
            />
          ))}
        </div>
      ))}
    </>
  );
}

export function FichaForm({
  mesaId,
  meuId,
  inicial,
  refs,
  contexto,
  aoFechar,
  aoSalvar,
}: {
  mesaId: string;
  meuId: string;
  inicial: FichaDiarioDTO | null;
  refs: OpcaoRef[];
  contexto: ContextoRico;
  aoFechar: () => void;
  aoSalvar: (id: string | null) => void;
}) {
  const [tipo, setTipo] = useState<TipoFichaDiario>(inicial?.tipo ?? "personagem");
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [apelidos, setApelidos] = useState(inicial?.apelidos.join(", ") ?? "");
  const [retrato, setRetrato] = useState<string | null>(inicial?.retratoUrl ?? null);
  const [campos, setCampos] = useState<CamposFicha>(inicial?.campos ?? {});
  const [resumo, setResumo] = useState(inicial?.resumo ?? "");
  const [salvando, setSalvando] = useState(false);
  // O resumo só enxerga as outras fichas (não ela mesma, que ainda pode nem existir).
  const refsSemEla = useMemo(() => refs.filter((r) => !(r.tipo === "ficha" && r.id === inicial?.id)), [refs, inicial]);

  async function salvar() {
    setSalvando(true);
    try {
      const dados = {
        tipo,
        nome,
        apelidos: apelidos.split(",").map((a) => a.trim()).filter(Boolean),
        retratoUrl: retrato,
        campos,
        resumo,
      };
      if (inicial) {
        exigir(await editarFichaDiario(mesaId, inicial.id, dados));
        aoSalvar(inicial.id);
      } else {
        const r = exigir(await criarFichaDiario(mesaId, dados));
        aoSalvar(r.id);
      }
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="diario-form">
      <h2>{inicial ? "Editar ficha" : "Nova ficha"}</h2>
      <div className="diario-form-linha">
        <label>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoFichaDiario)}>
            {TIPOS_FICHA.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Nome
          <input type="text" maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
        </label>
        <label>
          Apelidos (vírgula)
          <input type="text" value={apelidos} onChange={(e) => setApelidos(e.target.value)} />
        </label>
      </div>
      <div className="diario-form-linha">
        <label>
          Status
          <select value={campos.status ?? ""} onChange={(e) => setCampos({ ...campos, status: e.target.value || undefined })}>
            <option value="">—</option>
            {STATUS_FICHA.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Relação
          <select value={campos.relacao ?? ""} onChange={(e) => setCampos({ ...campos, relacao: e.target.value || undefined })}>
            <option value="">—</option>
            {RELACAO_FICHA.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Visto em
          <input
            type="text"
            maxLength={120}
            value={campos.visto ?? ""}
            onChange={(e) => setCampos({ ...campos, visto: e.target.value || undefined })}
          />
        </label>
      </div>
      <RetratoUpload valor={retrato} onChange={setRetrato} />
      <label>
        Resumo — o que se sabe
        <EditorComImagem
          mesaId={mesaId}
          meuId={meuId}
          valor={resumo}
          onChange={setResumo}
          refs={refsSemEla}
          contexto={contexto}
          placeholder="O que você sabe sobre isso? (@ menciona, cole imagens)"
        />
      </label>
      <div className="diario-form-acoes">
        <button type="button" className="diario-btn" onClick={aoFechar} disabled={salvando}>
          Cancelar
        </button>
        <button
          type="button"
          className="diario-btn diario-btn--primario"
          onClick={() => void salvar()}
          disabled={salvando || !nome.trim()}
        >
          {salvando ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}
