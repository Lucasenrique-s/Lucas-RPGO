"use client";

import { useMemo, useState } from "react";
import Swal from "sweetalert2";
import { createClient } from "@/lib/supabase/client";
import { exigir } from "@/lib/acoes";
import { imagensDeRica } from "@/lib/descricao-rica";
import type { ConfigMencao } from "@/lib/diario-mencao";
import { numeroSugerido } from "@/lib/diario-sessao";
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
  type RelacaoDTO,
  type SessaoDiarioDTO,
  type TipoFichaDiario,
} from "@/lib/diario-tipos";
import { DescricaoRica } from "@/components/descricao-rica/descricao-rica";
import { NovaRelacao } from "./relacao-editor";
import { EditorRico } from "@/components/descricao-rica/editor-rico";
import type { ContextoRico, OpcaoRef } from "@/components/descricao-rica/atomos";
import {
  apagarFichaDiario,
  apagarNotaDiario,
  criarFichaDiario,
  criarSessaoAnteriorDiario,
  criarNotaDiario,
  editarFichaDiario,
  definirEditoresFichaDiario,
  editarNotaDiario,
  mesclarFichaDiario,
  adicionarRetratoDiario,
  atualizarRetratoDiario,
  nomearSessaoDiario,
  publicarFichaDiario,
  removerRelacaoDiario,
  removerRetratoDiario,
  publicarNotaDiario,
  revelarFichaDiario,
} from "./actions";

export const ENTRE = "entre"; // "Entre sessões" (sessaoId nulo)
const NOVA_SESSAO = "__nova-sessao__";

// Pede número e título de uma sessão jogada antes do sistema e a registra. Erros do servidor
// (ex.: "a sessão 7 já está registrada") aparecem dentro do próprio diálogo, sem fechá-lo.
export async function registrarSessaoAnterior(mesaId: string, sessoes: SessaoDiarioDTO[]): Promise<SessaoDiarioDTO | null> {
  const sugerido = numeroSugerido(sessoes.map((s) => s.numero));
  const r = await Swal.fire<SessaoDiarioDTO>({
    title: "Registrar sessão anterior",
    html:
      `<p style="margin:0 0 12px;font-size:14px;opacity:.8">Uma sessão que vocês jogaram antes de usar o diário. ` +
      `Ela entra na ordem pelo número, e qualquer um da mesa pode anotar nela.</p>` +
      `<input id="sa-numero" class="swal2-input" type="number" min="1" max="9999" placeholder="Número da sessão" value="${sugerido ?? ""}">` +
      `<input id="sa-titulo" class="swal2-input" maxlength="80" placeholder="Título (opcional)">`,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: "Registrar",
    cancelButtonText: "Cancelar",
    background: "var(--bg-card)",
    color: "var(--text-main)",
    didOpen: () => document.getElementById("sa-numero")?.focus(),
    preConfirm: async () => {
      const numero = Number((document.getElementById("sa-numero") as HTMLInputElement | null)?.value);
      const titulo = (document.getElementById("sa-titulo") as HTMLInputElement | null)?.value ?? "";
      if (!Number.isInteger(numero) || numero < 1 || numero > 9999) {
        Swal.showValidationMessage("Informe o número da sessão (1 a 9999).");
        return false;
      }
      try {
        return exigir(await criarSessaoAnteriorDiario(mesaId, { numero, titulo })).sessao;
      } catch (e) {
        Swal.showValidationMessage(e instanceof Error ? e.message : "Falha ao registrar a sessão.");
        return false;
      }
    },
  });
  return r.isConfirmed && r.value ? r.value : null;
}

// As sessões do servidor mais as que acabaram de ser registradas aqui (a lista do servidor
// só chega com a próxima atualização). Mais recente primeiro, como o servidor manda.
export function useSessoesComNovas(sessoes: SessaoDiarioDTO[]) {
  const [novas, setNovas] = useState<SessaoDiarioDTO[]>([]);
  const todas = useMemo(
    () => [...sessoes, ...novas.filter((n) => !sessoes.some((s) => s.id === n.id))].sort((a, b) => b.iniciadaEm.localeCompare(a.iniciadaEm)),
    [sessoes, novas],
  );
  return { todas, adicionar: (s: SessaoDiarioDTO) => setNovas((l) => [...l, s]) };
}

// Escolhe a sessão de uma anotação: as da mesa, "Entre sessões" ou uma sessão anterior ao
// sistema, que é registrada na hora. `valor` é o id da sessão ou ENTRE.
export function SeletorSessao({
  mesaId,
  sessoes,
  valor,
  aoMudar,
  aoRegistrar,
  className,
  rotulo = "Escolher a sessão da anotação",
}: {
  mesaId: string;
  // Já com as sessões novas (useSessoesComNovas).
  sessoes: SessaoDiarioDTO[];
  valor: string;
  aoMudar: (valor: string) => void;
  aoRegistrar: (sessao: SessaoDiarioDTO) => void;
  className?: string;
  rotulo?: string;
}) {
  async function mudou(v: string) {
    if (v !== NOVA_SESSAO) return aoMudar(v);
    const nova = await registrarSessaoAnterior(mesaId, sessoes);
    if (!nova) return;
    aoRegistrar(nova);
    aoMudar(nova.id);
  }
  return (
    <select className={className} value={valor} onChange={(e) => void mudou(e.target.value)} aria-label={rotulo}>
      {sessoes.map((s) => (
        <option key={s.id} value={s.id}>
          {rotuloSessao(s)}
          {s.ativa ? " (ativa)" : ""}
        </option>
      ))}
      <option value={ENTRE}>Entre sessões</option>
      <option value={NOVA_SESSAO}>＋ Registrar sessão anterior…</option>
    </select>
  );
}

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
  const oculta = visibilidade === "oculta";
  return (
    <span
      className={`diario-selo${publica ? " diario-selo--publica" : ""}`}
      title={publica ? "Visível para toda a mesa" : oculta ? "Na wiki, mas só o narrador vê, até revelar" : "Só você e o narrador"}
    >
      <i className={`fas ${publica ? "fa-earth-americas" : "fa-lock"}`} /> {publica ? "Pública" : oculta ? "Oculta" : "Privada"}
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
    if (f.visibilidade === "oculta") {
      exigir(await publicarFichaDiario(mesaId, f.id, "privada"));
      return aoMudou();
    }
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

export function EditoresFicha({
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
  cfg,
  contexto,
  placeholder,
}: {
  mesaId: string;
  meuId: string;
  valor: string;
  onChange: (v: string) => void;
  refs: OpcaoRef[];
  // O que o `@` e o `[[ ]]` oferecem (páginas, sessões, eventos, calendário).
  cfg: ConfigMencao;
  contexto: ContextoRico;
  placeholder: string;
}) {
  return (
    <div className="diario-editor-caixa">
      <EditorRico
        valor={valor}
        onChange={onChange}
        refs={refs}
        contexto={contexto}
        placeholder={placeholder}
        enviarImagem={(arquivo) => enviarImagem(mesaId, meuId, arquivo)}
        mencoes={cfg}
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
  cfg,
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
  cfg: ConfigMencao;
  contexto: ContextoRico;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [titulo, setTitulo] = useState(inicial?.titulo ?? "");
  const [corpo, setCorpo] = useState(inicial?.corpo ?? "");
  const [tags, setTags] = useState(inicial?.tags.join(", ") ?? "");
  const [importante, setImportante] = useState(inicial?.importante ?? false);
  const [sessao, setSessao] = useState<string>(inicial ? (inicial.sessaoId ?? ENTRE) : (sessaoPadrao ?? ENTRE));
  const { todas: todasSessoes, adicionar: adicionarSessao } = useSessoesComNovas(sessoes);
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
        cfg={cfg}
        contexto={contexto}
        placeholder="O que aconteceu? (@ menciona uma página · [[ ]] liga a um tempo)"
      />
      <div className="diario-form-linha">
        <label>
          Sessão
          <SeletorSessao mesaId={mesaId} sessoes={todasSessoes} valor={sessao} aoMudar={setSessao} aoRegistrar={adicionarSessao} />
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

// Edita a página: o autor, ou (na pública) o narrador e os editores que o autor escolheu.
const souAutorOuEditor = (f: FichaDiarioDTO, meuId: string, ehNarrador: boolean) =>
  f.autorId === meuId || (f.visibilidade === "publica" && (ehNarrador || f.editores.includes(meuId)));

/* ─── Retratos: vários, com legenda ──────────────────────── */

function GaleriaRetratos({
  mesaId,
  meuId,
  ficha,
  podeEditar,
  aoAtualizar,
}: {
  mesaId: string;
  meuId: string;
  ficha: FichaDiarioDTO;
  podeEditar: boolean;
  aoAtualizar: () => void;
}) {
  const lista = ficha.retratos.length > 0 ? ficha.retratos : ficha.retratoUrl ? [{ id: "legado", url: ficha.retratoUrl, legenda: "" }] : [];
  const [sel, setSel] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const atual = lista[Math.min(sel, Math.max(0, lista.length - 1))];

  async function adicionar(arq: File) {
    setEnviando(true);
    try {
      const url = await enviarImagem(mesaId, meuId, arq);
      exigir(await adicionarRetratoDiario(mesaId, ficha.id, url));
      setSel(lista.length);
      aoAtualizar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Falha ao enviar a imagem.");
    } finally {
      setEnviando(false);
    }
  }

  async function mudar(id: string, mudanca: { legenda?: string; principal?: boolean }) {
    try {
      exigir(await atualizarRetratoDiario(mesaId, id, mudanca));
      if (mudanca.principal) setSel(0);
      aoAtualizar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Falha ao salvar.");
    }
  }

  async function remover(id: string) {
    if (!(await confirmar("Remover este retrato?"))) return;
    try {
      exigir(await removerRetratoDiario(mesaId, id));
      setSel(0);
      aoAtualizar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Falha ao remover.");
    }
  }

  return (
    <div className="diario-retratos">
      <div className="diario-polaroid">
        {atual ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={atual.url} alt={atual.legenda} />
        ) : (
          <div className="diario-polaroid-vazio">
            <i className={`fas ${iconeDoTipo(ficha.tipo)}`} />
          </div>
        )}
      </div>
      {atual && podeEditar && atual.id !== "legado" ? (
        <input
          key={atual.id}
          className="diario-legenda"
          type="text"
          maxLength={120}
          defaultValue={atual.legenda}
          placeholder="Legenda (ex.: cartaz · Sessão 8)"
          aria-label="Legenda do retrato"
          onBlur={(e) => e.target.value !== atual.legenda && void mudar(atual.id, { legenda: e.target.value })}
        />
      ) : (
        atual?.legenda && <div className="diario-legenda diario-legenda--texto">{atual.legenda}</div>
      )}
      <div className="diario-miniaturas">
        {lista.map((r, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <button key={r.id} type="button" className={i === sel ? "on" : ""} onClick={() => setSel(i)} title={r.legenda || `Retrato ${i + 1}`} aria-label={r.legenda || `Retrato ${i + 1}`}>
            <img src={r.url} alt="" />
          </button>
        ))}
        {podeEditar && (
          <label className="diario-miniatura-mais" title="Adicionar retrato">
            {enviando ? "…" : "+"}
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={enviando}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void adicionar(f);
              }}
            />
          </label>
        )}
      </div>
      {atual && podeEditar && atual.id !== "legado" && (
        <div className="diario-retrato-acoes">
          {sel > 0 && (
            <button type="button" className="diario-link" onClick={() => void mudar(atual.id, { principal: true })}>
              tornar principal
            </button>
          )}
          <button type="button" className="diario-link" onClick={() => void remover(atual.id)}>
            remover
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Relações com outras páginas ────────────────────────── */

function RelacoesFicha({
  mesaId,
  ficha,
  fichas,
  relacoes,
  podeEditar,
  aoAbrirFicha,
  aoAtualizar,
}: {
  mesaId: string;
  ficha: FichaDiarioDTO;
  fichas: FichaDiarioDTO[];
  relacoes: RelacaoDTO[];
  podeEditar: boolean;
  aoAbrirFicha: (id: string) => void;
  aoAtualizar: () => void;
}) {
  const de = relacoes.filter((r) => r.deId === ficha.id);
  const para = relacoes.filter((r) => r.paraId === ficha.id);
  const nome = (id: string) => fichas.find((f) => f.id === id);
  const membros = para.filter((r) => /membro/i.test(r.verbo)).map((r) => nome(r.deId)).filter((f): f is FichaDiarioDTO => !!f);
  const classe = (f: FichaDiarioDTO) => `desc-mencao desc-mencao--${f.tipo}`;

  async function tirar(id: string) {
    try {
      exigir(await removerRelacaoDiario(mesaId, id));
      aoAtualizar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Falha ao remover.");
    }
  }

  if (de.length === 0 && para.length === 0 && !podeEditar) return null;
  return (
    <>
      <h3 className="diario-grupo-titulo">Relações</h3>
      {membros.length > 0 && (
        <p className="diario-aviso">
          Membros:{" "}
          {membros.map((m, i) => (
            <span key={m.id}>
              {i > 0 ? ", " : ""}
              <button type="button" className={`${classe(m)} diario-mencao-botao`} onClick={() => aoAbrirFicha(m.id)}>
                {m.nome}
              </button>
            </span>
          ))}
        </p>
      )}
      <div className="diario-relacoes">
        {de.map((r) => {
          const f = nome(r.paraId);
          return (
            <div key={r.id} className="diario-relacao">
              <span>{r.verbo}</span>
              {f ? (
                <button type="button" className={`${classe(f)} diario-mencao-botao`} onClick={() => aoAbrirFicha(f.id)}>
                  {f.nome}
                </button>
              ) : (
                <span className="desc-mencao desc-mencao--vazia">página que não existe</span>
              )}
              {podeEditar && (
                <button type="button" className="diario-link" onClick={() => void tirar(r.id)} aria-label="Remover relação">
                  ×
                </button>
              )}
            </div>
          );
        })}
        {para
          .filter((r) => !/membro/i.test(r.verbo))
          .map((r) => {
            const f = nome(r.deId);
            return f ? (
              <div key={r.id} className="diario-relacao diario-relacao--entrada">
                <button type="button" className={`${classe(f)} diario-mencao-botao`} onClick={() => aoAbrirFicha(f.id)}>
                  {f.nome}
                </button>
                <span>{r.verbo} esta página</span>
              </div>
            ) : null;
          })}
      </div>
      {podeEditar && <NovaRelacao mesaId={mesaId} ficha={ficha} fichas={fichas} aoErro={avisar} aoAdicionou={aoAtualizar} />}
    </>
  );
}

export function FichaDetalhe({
  mesaId,
  meuId,
  ficha,
  notas,
  sessoes,
  fichas,
  mencoes,
  relacoes,
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
  aoPublicar,
  aoVerNaWiki,
}: {
  mesaId: string;
  meuId: string;
  ficha: FichaDiarioDTO | null;
  notas: NotaDiarioDTO[];
  sessoes: SessaoDiarioDTO[];
  fichas: FichaDiarioDTO[];
  mencoes: MencaoDiarioDTO[];
  relacoes: RelacaoDTO[];
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
  // Abre o diálogo de publicar na wiki (escolher as anotações que vão junto).
  aoPublicar: (f: FichaDiarioDTO) => void;
  aoVerNaWiki: (id: string) => void;
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
        <GaleriaRetratos mesaId={mesaId} meuId={meuId} ficha={ficha} podeEditar={!somenteLeitura && (souAutorOuEditor(ficha, meuId, ehNarrador))} aoAtualizar={aoAtualizar} />
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
          {ficha.visibilidade === "oculta" && ehNarrador && (
            <button
              type="button"
              className="diario-btn diario-btn--primario"
              onClick={async () => {
                try {
                  exigir(await revelarFichaDiario(mesaId, ficha.id));
                  aoAtualizar();
                } catch (e) {
                  avisar(e instanceof Error ? e.message : "Falha ao revelar.");
                }
              }}
            >
              <i className="fas fa-earth-americas" /> Revelar à mesa
            </button>
          )}
          <button
            type="button"
            className="diario-btn"
            onClick={() =>
              publica || ficha.visibilidade === "oculta"
                ? void alternarVisibilidadeFicha(mesaId, ficha, (id) => (id ? aoAbrirFicha(id) : aoAtualizar()))
                : aoPublicar(ficha)
            }
          >
            <i className={`fas ${publica || ficha.visibilidade === "oculta" ? "fa-lock" : "fa-earth-americas"}`} />{" "}
            {publica || ficha.visibilidade === "oculta" ? "Tornar privada" : "Publicar para a mesa"}
          </button>
          {publica && (
            <button type="button" className="diario-btn" onClick={() => aoVerNaWiki(ficha.id)}>
              <i className="fas fa-book-open" /> Ver na wiki
            </button>
          )}
          {publica && <EditoresFicha key={ficha.editores.join(",")} mesaId={mesaId} ficha={ficha} membros={membros} aoSalvar={aoAtualizar} />}
        </div>
      )}

      {ficha.resumo ? <DescricaoRica texto={ficha.resumo} contexto={contexto} /> : <p className="diario-aviso">Sem biografia ainda.</p>}

      <RelacoesFicha
        mesaId={mesaId}
        ficha={ficha}
        fichas={fichas}
        relacoes={relacoes}
        podeEditar={!somenteLeitura && souAutorOuEditor(ficha, meuId, ehNarrador)}
        aoAbrirFicha={aoAbrirFicha}
        aoAtualizar={aoAtualizar}
      />

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
  cfg,
  contexto,
  aoFechar,
  aoSalvar,
}: {
  mesaId: string;
  meuId: string;
  inicial: FichaDiarioDTO | null;
  refs: OpcaoRef[];
  cfg: ConfigMencao;
  contexto: ContextoRico;
  aoFechar: () => void;
  aoSalvar: (id: string | null) => void;
}) {
  const [tipo, setTipo] = useState<TipoFichaDiario>(inicial?.tipo ?? "personagem");
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [apelidos, setApelidos] = useState(inicial?.apelidos.join(", ") ?? "");
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
        retratoUrl: inicial?.retratoUrl ?? null,
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
      <p className="diario-aviso">Os retratos (vários, com legenda) ficam na página da pessoa ou do lugar.</p>
      <label>
        Biografia: o que se sabe
        <EditorComImagem
          mesaId={mesaId}
          meuId={meuId}
          valor={resumo}
          onChange={setResumo}
          refs={refsSemEla}
          cfg={cfg}
          contexto={contexto}
          placeholder="Escreva como preferir: quem é, o que já aconteceu, tudo o que se sabe. (@ menciona, cole imagens)"
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
