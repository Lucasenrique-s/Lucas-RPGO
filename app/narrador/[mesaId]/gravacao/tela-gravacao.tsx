"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BannerUploadModal } from "@/app/dashboard/banner-upload-modal";
import { CenaGravacao } from "@/components/gravacao/cena-gravacao";
import { montarCena } from "@/components/gravacao/montar-cena";
import { useEstadoGravacao } from "@/components/gravacao/use-estado-gravacao";
import {
  EVENTO_CONFIG,
  EVENTO_MUDOU,
  ID_NARRADOR,
  MODOS_GRAVACAO,
  comModo,
  modoEfetivo,
  ordenarPorConfig,
  proximoExibir,
  type ConfigGravacao,
  type ExibirBarra,
  type ModoGravacao,
  type MostrarGravacao,
} from "@/lib/gravacao";
import type { EstadoGravacao } from "@/lib/gravacao-servidor";
import { ALTURA_TELA, LARGURA_TELA } from "@/lib/layout-gravacao";
import { canal as canalUnico } from "@/lib/supabase/canal";
import { createClient } from "@/lib/supabase/client";
import { useReordenar } from "@/lib/use-reordenar";
import { gerarNovoLinkGravacao, salvarConfigGravacao } from "./actions";

// Espera pra juntar os avisos de uma ação que mexe em várias tabelas.
const ESPERA_AVISO = 120;
// Espera pra juntar cliques seguidos num salvamento só.
const ESPERA_SALVAR = 250;

type Props = {
  mesa: { id: string; nome: string };
  token: string;
  linkObs: string;
  canal: string;
  estadoInicial: EstadoGravacao;
  recursosPorPersonagem: Record<string, { id: string; nome: string }[]>;
  sessaoId: string | null;
  combateId: string | null;
};

type Salvamento = "salvo" | "salvando" | "erro";

// Versão da config: a hora da mudança (só em clique/atalho, nunca no render).
const versaoNova = () => Date.now();

export function TelaGravacao({
  mesa,
  token,
  linkObs,
  canal,
  estadoInicial,
  recursosPorPersonagem,
  sessaoId,
  combateId,
}: Props) {
  // Sem canal: quem avisa o overlay é esta tela, que recarrega a própria prévia.
  const [estadoVivo, recarregar] = useEstadoGravacao(mesa.id, token, null, estadoInicial);
  const personagemIds = useMemo(() => (estadoVivo ?? estadoInicial).personagens.map((p) => p.id), [estadoVivo, estadoInicial]);
  const { ligado, enviarConfig } = useRepasseAoOverlay({
    mesaId: mesa.id,
    canal,
    personagemIds,
    sessaoId,
    combateId,
    aoMudar: recarregar,
  });

  // A config é desta tela: muda na hora aqui e vai pro banco logo depois.
  const [config, setConfig] = useState(estadoInicial.config);
  const configRef = useRef(config);
  const [salvamento, setSalvamento] = useState<Salvamento>("salvo");
  const salvarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Um salvamento por vez: dois em paralelo podiam chegar fora de ordem e o
  // antigo sobrescrever o novo. Cada um grava a config mais recente.
  const filaSalvar = useRef(Promise.resolve());

  function mudar(atualizar: (c: ConfigGravacao) => ConfigGravacao) {
    const nova = { ...atualizar(configRef.current), versao: versaoNova() };
    configRef.current = nova;
    setConfig(nova);
    // O overlay aplica na hora; o banco vem logo depois (pra quem abrir depois).
    enviarConfig(nova);
    setSalvamento("salvando");
    if (salvarTimer.current) clearTimeout(salvarTimer.current);
    salvarTimer.current = setTimeout(() => {
      filaSalvar.current = filaSalvar.current.then(async () => {
        const atual = configRef.current;
        try {
          await salvarConfigGravacao(mesa.id, atual);
          // Só o salvamento da config atual marca "salvo".
          if (configRef.current === atual) setSalvamento("salvo");
        } catch {
          setSalvamento("erro");
        }
      });
    }, ESPERA_SALVAR);
  }

  const estado = estadoVivo ?? estadoInicial;
  const cena = useMemo(() => montarCena({ ...estado, config }), [estado, config]);

  // Narrador + jogadores na ordem salva (quem não está na gravação também).
  const candidatos = ordenarPorConfig([ID_NARRADOR, ...estado.personagens.map((p) => p.id)], config.ordem);
  const jogadoresPresentes = candidatos.filter((id) => id !== ID_NARRADOR && config.presentes.includes(id));

  // Com o Cinemático automático, o modo durante o combate é outro.
  const combateAtivo = estado.combate?.id ?? null;
  const modoAgora = modoEfetivo(config, combateAtivo);
  const escolherModo = (modo: ModoGravacao) => mudar((c) => comModo(c, modo, combateAtivo));

  useAtalhos(configRef, mudar, { jogadoresPresentes, modoAgora, escolherModo });

  // Arrastado na prévia e solto sobre outro card: vai pro lugar dele (depois
  // dele, se vinha de antes; antes dele, se vinha de depois).
  function moverPara(id: string, alvoId: string) {
    mudar((c) => {
      const lista = ordenarPorConfig([ID_NARRADOR, ...estado.personagens.map((p) => p.id)], c.ordem);
      const de = lista.indexOf(id);
      const para = lista.indexOf(alvoId);
      if (de < 0 || para < 0) return c;
      lista.splice(de, 1);
      lista.splice(para, 0, id);
      return { ...c, ordem: lista };
    });
  }

  return (
    <div className="grv-pagina">
      <header className="grv-topo">
        <a href={`/narrador/${mesa.id}`} className="grv-voltar" title="Voltar ao painel do narrador">
          <i className="fas fa-arrow-left" />
        </a>
        <div>
          <span className="grv-kicker">GRAVAÇÃO</span>
          <h1>{mesa.nome}</h1>
        </div>
        <span className={`grv-salvo grv-salvo-${salvamento}`}>
          {salvamento === "salvando" ? "Salvando…" : salvamento === "erro" ? "Não salvou: tente de novo" : "Salvo"}
        </span>
        <span className={`grv-status ${ligado ? "ligado" : ""}`} title="Com esta aba aberta, o overlay muda na hora">
          <i className="fas fa-circle" /> {ligado ? "Overlay ao vivo" : "Conectando…"}
        </span>
      </header>

      <div className="grv-corpo">
        <div className="grv-principal">
          <Previa>
            <CenaGravacao
              layout={cena.layout}
              dados={cena.dados}
              mostrar={cena.mostrar}
              vez={cena.vez}
              aoSoltarSobre={moverPara}
            />
          </Previa>
          <p className="grv-dica grv-dica-previa">
            <i className="fas fa-hand" /> Arraste um card e solte em cima de outro pra trocar a ordem.
          </p>

          <ListaNaGravacao
            candidatos={candidatos}
            config={config}
            mudar={mudar}
            estado={estado}
            recursosPorPersonagem={recursosPorPersonagem}
            jogadoresPresentes={jogadoresPresentes}
          />
        </div>

        <aside className="grv-lateral">
          <Secao titulo="Modo" icone="fa-table-cells-large">
            <div className="grv-grupo">
              {MODOS_GRAVACAO.map((m, i) => (
                <button
                  key={m.slug}
                  type="button"
                  className={`grv-opcao${modoAgora === m.slug ? " ativo" : ""}`}
                  onClick={() => escolherModo(m.slug)}
                >
                  <i className={`fas ${m.icone}`} /> {m.nome} <kbd>{i + 1}</kbd>
                </button>
              ))}
            </div>
            <p className="grv-dica">
              {modoAgora === "cinematico" &&
                (combateAtivo && config.auto.destacarVez
                  ? "No combate, quem está no turno fica em destaque (criatura: o narrador)."
                  : "Quem tem a estrela fica em destaque; sem ninguém, todos iguais.")}
              {modoAgora === "foco" && "Só quem tem a marca de Foco aparece; sem ninguém marcado, só o narrador."}
              {modoAgora === "narracao" && "Narrador grande e os jogadores em volta."}
              {modoAgora === "igualitario" && "Todos do mesmo tamanho."}
            </p>
            {combateAtivo && config.auto.cinematicoNoCombate && (
              <p className="grv-dica">
                <i className="fas fa-shield-halved" /> Modo do combate: quando ele acabar, volta para{" "}
                <b>{MODOS_GRAVACAO.find((m) => m.slug === config.modo)?.nome}</b>.
              </p>
            )}
          </Secao>

          <Secao titulo="Combate" icone="fa-khanda">
            <p className={`grv-combate-status${combateAtivo ? " ativo" : ""}`}>
              {combateAtivo ? (
                <>
                  <i className="fas fa-circle" /> Em combate · vez de{" "}
                  <b>
                    {estado.combate?.vez.personagemId
                      ? (estado.personagens.find((p) => p.id === estado.combate?.vez.personagemId)?.nome ?? "alguém")
                      : estado.combate?.vez.criatura
                        ? "uma criatura (destaca o narrador)"
                        : "ninguém"}
                  </b>
                </>
              ) : (
                "Sem combate agora."
              )}
            </p>
            <p className="grv-dica">Todas desligadas: o overlay ignora o combate.</p>
            <label className="grv-caixa">
              <input
                type="checkbox"
                checked={config.auto.destacarVez}
                onChange={(e) => mudar((c) => ({ ...c, auto: { ...c.auto, destacarVez: e.target.checked } }))}
              />
              Destacar quem está no turno (borda dourada e selo &quot;Vez&quot;; no Cinemático, fica em cena)
            </label>
            <label className="grv-caixa">
              <input
                type="checkbox"
                checked={config.auto.cinematicoNoCombate}
                onChange={(e) =>
                  mudar((c) => ({ ...c, auto: { ...c.auto, cinematicoNoCombate: e.target.checked }, modoNoCombate: null }))
                }
              />
              Cinemático durante o combate (depois volta ao modo de antes)
            </label>
            <label className="grv-caixa">
              <input
                type="checkbox"
                checked={config.auto.ordemPorIniciativa}
                onChange={(e) => mudar((c) => ({ ...c, auto: { ...c.auto, ordemPorIniciativa: e.target.checked } }))}
              />
              Ordem dos cards pela iniciativa durante o combate
            </label>
          </Secao>

          <Secao titulo="Mostrar (todos)" icone="fa-eye">
            <MostrarEditor
              valor={config.mostrar}
              aoMudar={(patch) => mudar((c) => ({ ...c, mostrar: { ...c.mostrar, ...patch } }))}
              teclas
            />
            <p className="grv-dica">Para mudar só de um personagem, use a engrenagem dele na lista.</p>
          </Secao>

          <Secao titulo="Atalhos" icone="fa-keyboard">
            <ul className="grv-atalhos">
              <li><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> modo</li>
              <li><kbd>⇧1…9</kbd> em cena (no Foco: marca o Foco)</li>
              <li><kbd>⇧N</kbd> narrador no Foco · <kbd>0</kbd> limpa a seleção</li>
              <li><kbd>N</kbd> nome · <kbd>V</kbd> PV · <kbd>P</kbd> PP</li>
              <li><kbd>R</kbd> recursos · <kbd>C</kbd> condições · <kbd>F</kbd> fala</li>
            </ul>
            <p className="grv-dica">Funcionam com esta aba em foco.</p>
          </Secao>

          <LinkDoObs mesaId={mesa.id} linkObs={linkObs} />
        </aside>
      </div>
    </div>
  );
}

// ─── Lista de quem está na gravação ───────────────────────────────────────

function ListaNaGravacao({
  candidatos,
  config,
  mudar,
  estado,
  recursosPorPersonagem,
  jogadoresPresentes,
}: {
  candidatos: string[];
  config: ConfigGravacao;
  mudar: (f: (c: ConfigGravacao) => ConfigGravacao) => void;
  estado: EstadoGravacao;
  recursosPorPersonagem: Record<string, { id: string; nome: string }[]>;
  jogadoresPresentes: string[];
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const porId = new Map(estado.personagens.map((p) => [p.id, p]));
  const reordenar = useReordenar({
    itens: candidatos.map((id) => ({ id, grupo: "lista" })),
    aoSoltar: (lista) => mudar((c) => ({ ...c, ordem: lista.map((i) => i.id) })),
    mudaGrupo: false,
  });

  const alternar = (campo: "presentes" | "emCena" | "foco", id: string) =>
    mudar((c) => ({
      ...c,
      [campo]: c[campo].includes(id) ? c[campo].filter((x) => x !== id) : [...c[campo], id],
    }));

  const itens = reordenar.ordenar(candidatos.map((id) => ({ id })));

  return (
    <section className="grv-cartao">
      <h2>
        <i className="fas fa-users" /> Na gravação
      </h2>
      <p className="grv-dica">
        Arraste pela alça pra mudar a ordem dos cards. A estrela põe em cena (Cinemático); a marca põe no Foco.
      </p>
      <ul className="grv-lista" {...reordenar.zona("lista")}>
        {itens.map(({ id }) => {
          const narrador = id === ID_NARRADOR;
          const p = porId.get(id);
          const nome = narrador ? config.narrador.nome || "Narrador" : (p?.nome ?? "");
          const imagem = narrador ? config.narrador.imagemUrl : (p?.imagemUrl ?? null);
          const presente = config.presentes.includes(id);
          const posicao = jogadoresPresentes.indexOf(id);
          const temExcecao = !narrador && Object.keys(config.excecoes[id] ?? {}).length > 0;
          return (
            <li key={id} {...reordenar.item(id)} className={`grv-item${presente ? "" : " ausente"}${reordenar.vaga(id)}`}>
              <div className="grv-item-linha">
                <button
                  type="button"
                  className="grv-alca"
                  aria-label={`Arrastar ${nome}`}
                  title="Arrastar pra mudar a ordem"
                  {...reordenar.alca(id)}
                >
                  <i className="fas fa-grip-vertical" />
                </button>
                <label className="grv-item-presente" title={presente ? "Tirar da gravação" : "Pôr na gravação"}>
                  <input type="checkbox" checked={presente} onChange={() => alternar("presentes", id)} />
                </label>
                <span className="grv-miniatura">
                  {imagem ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL do storage
                    <img src={imagem} alt="" />
                  ) : (
                    <i className={`fas ${narrador ? "fa-book-open" : "fa-user"}`} />
                  )}
                </span>
                <span className="grv-item-nome">
                  {nome}
                  {narrador && <small>narrador</small>}
                  {posicao >= 0 && <kbd title="Atalho com Shift">⇧{posicao + 1}</kbd>}
                </span>
                <button
                  type="button"
                  className={`grv-icone${config.emCena.includes(id) ? " ativo" : ""}`}
                  onClick={() => alternar("emCena", id)}
                  title="Em cena (Cinemático)"
                  aria-pressed={config.emCena.includes(id)}
                >
                  <i className="fas fa-star" />
                </button>
                <button
                  type="button"
                  className={`grv-icone${config.foco.includes(id) ? " ativo" : ""}`}
                  onClick={() => alternar("foco", id)}
                  title="No Foco"
                  aria-pressed={config.foco.includes(id)}
                >
                  <i className="fas fa-user-check" />
                </button>
                <button
                  type="button"
                  className={`grv-icone${aberto === id ? " ativo" : ""}${temExcecao ? " marcado" : ""}`}
                  onClick={() => setAberto((a) => (a === id ? null : id))}
                  title={narrador ? "Nome e imagem do narrador" : "O que mostrar deste personagem"}
                  aria-expanded={aberto === id}
                >
                  <i className="fas fa-gear" />
                </button>
              </div>

              {aberto === id &&
                (narrador ? (
                  <AjustesNarrador config={config} mudar={mudar} />
                ) : (
                  <AjustesPersonagem
                    id={id}
                    config={config}
                    mudar={mudar}
                    recursos={recursosPorPersonagem[id] ?? []}
                  />
                ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AjustesPersonagem({
  id,
  config,
  mudar,
  recursos,
}: {
  id: string;
  config: ConfigGravacao;
  mudar: (f: (c: ConfigGravacao) => ConfigGravacao) => void;
  recursos: { id: string; nome: string }[];
}) {
  const excecao = config.excecoes[id] ?? {};
  const escolhidos = config.recursos[id] ?? [];

  // undefined tira a exceção (volta a valer o geral).
  function mudarExcecao<K extends keyof MostrarGravacao>(campo: K, valor: MostrarGravacao[K] | undefined) {
    mudar((c) => {
      const atual = { ...c.excecoes[id] };
      if (valor === undefined) delete atual[campo];
      else atual[campo] = valor;
      const excecoes = { ...c.excecoes };
      if (Object.keys(atual).length > 0) excecoes[id] = atual;
      else delete excecoes[id];
      return { ...c, excecoes };
    });
  }

  function alternarRecurso(recursoId: string) {
    mudar((c) => {
      const lista = c.recursos[id] ?? [];
      const nova = lista.includes(recursoId) ? lista.filter((x) => x !== recursoId) : [...lista, recursoId];
      return { ...c, recursos: { ...c.recursos, [id]: nova } };
    });
  }

  const sim = (v: boolean) => (v ? "mostra" : "esconde");
  return (
    <div className="grv-ajustes">
      <div className="grv-ajustes-grade">
        {(["nome", "recursos", "condicoes", "fala"] as const).map((campo) => (
          <label key={campo} className="grv-campo">
            <span>{ROTULOS[campo]}</span>
            <select
              value={excecao[campo] === undefined ? "" : String(excecao[campo])}
              onChange={(e) => mudarExcecao(campo, e.target.value === "" ? undefined : e.target.value === "true")}
            >
              <option value="">Como todos ({sim(config.mostrar[campo])})</option>
              <option value="true">Mostrar</option>
              <option value="false">Esconder</option>
            </select>
          </label>
        ))}
        {(["pv", "pp"] as const).map((campo) => (
          <label key={campo} className="grv-campo">
            <span>{ROTULOS[campo]}</span>
            <select
              value={excecao[campo] ?? ""}
              onChange={(e) => mudarExcecao(campo, (e.target.value || undefined) as ExibirBarra | undefined)}
            >
              <option value="">Como todos ({NOMES_EXIBIR[config.mostrar[campo]].toLowerCase()})</option>
              {(["numero", "barra", "oculto"] as const).map((v) => (
                <option key={v} value={v}>
                  {NOMES_EXIBIR[v]}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="grv-ajustes-recursos">
        <span>Recursos no card</span>
        {recursos.length === 0 ? (
          <p className="grv-dica">Este personagem não tem recursos com barra.</p>
        ) : (
          <div className="grv-grupo">
            {recursos.map((r) => (
              <label key={r.id} className="grv-caixa">
                <input type="checkbox" checked={escolhidos.includes(r.id)} onChange={() => alternarRecurso(r.id)} />
                {r.nome}
              </label>
            ))}
          </div>
        )}
        {!config.mostrar.recursos && excecao.recursos !== true && escolhidos.length > 0 && (
          <p className="grv-dica">Os recursos estão escondidos em &quot;Mostrar&quot;: ligue lá (ou aqui em cima) pra aparecerem.</p>
        )}
      </div>
    </div>
  );
}

function AjustesNarrador({
  config,
  mudar,
}: {
  config: ConfigGravacao;
  mudar: (f: (c: ConfigGravacao) => ConfigGravacao) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const mudarNarrador = (patch: Partial<ConfigGravacao["narrador"]>) =>
    mudar((c) => ({ ...c, narrador: { ...c.narrador, ...patch } }));
  return (
    <div className="grv-ajustes">
      <label className="grv-campo">
        <span>Nome no card</span>
        <input
          type="text"
          maxLength={80}
          value={config.narrador.nome}
          onChange={(e) => mudarNarrador({ nome: e.target.value })}
          placeholder="Narrador"
        />
      </label>
      <div className="grv-campo">
        <span>Imagem (16:9; nos cards em pé ela é recortada no centro)</span>
        <div className="grv-grupo">
          <button type="button" className="grv-botao" onClick={() => setEnviando(true)}>
            <i className="fas fa-image" /> {config.narrador.imagemUrl ? "Trocar imagem" : "Escolher imagem"}
          </button>
          {config.narrador.imagemUrl && (
            <button type="button" className="grv-botao" onClick={() => mudarNarrador({ imagemUrl: null })}>
              <i className="fas fa-trash" /> Tirar
            </button>
          )}
        </div>
      </div>
      <BannerUploadModal
        aberto={enviando}
        onFechar={() => setEnviando(false)}
        onUpload={(url) => mudarNarrador({ imagemUrl: url })}
        aspecto={16 / 9}
        titulo="Imagem do narrador"
        prefixoArquivo="gravacao_narrador"
      />
    </div>
  );
}

// ─── Mostrar (geral) ──────────────────────────────────────────────────────

const ROTULOS: Record<keyof MostrarGravacao, string> = {
  nome: "Nome",
  pv: "PV",
  pp: "PP",
  recursos: "Recursos",
  condicoes: "Condições",
  fala: "Indicador de fala",
};

const NOMES_EXIBIR: Record<ExibirBarra, string> = { numero: "Barra + número", barra: "Só barra", oculto: "Oculto" };

const TECLAS: Record<keyof MostrarGravacao, string> = { nome: "N", pv: "V", pp: "P", recursos: "R", condicoes: "C", fala: "F" };

function MostrarEditor({
  valor,
  aoMudar,
  teclas,
}: {
  valor: MostrarGravacao;
  aoMudar: (patch: Partial<MostrarGravacao>) => void;
  teclas?: boolean;
}) {
  return (
    <div className="grv-mostrar">
      {(["pv", "pp"] as const).map((campo) => (
        <div key={campo} className="grv-ciclo">
          <span>{ROTULOS[campo]}</span>
          <div className="grv-grupo">
            {(["numero", "barra", "oculto"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={`grv-opcao pequena${valor[campo] === v ? " ativo" : ""}`}
                onClick={() => aoMudar({ [campo]: v })}
              >
                {NOMES_EXIBIR[v]}
              </button>
            ))}
          </div>
          {teclas && <kbd>{TECLAS[campo]}</kbd>}
        </div>
      ))}
      {(["nome", "recursos", "condicoes", "fala"] as const).map((campo) => (
        <label key={campo} className="grv-caixa">
          <input type="checkbox" checked={valor[campo]} onChange={(e) => aoMudar({ [campo]: e.target.checked })} />
          {ROTULOS[campo]}
          {campo === "fala" && <small>(com o Discord, mais pra frente)</small>}
          {teclas && <kbd>{TECLAS[campo]}</kbd>}
        </label>
      ))}
    </div>
  );
}

// ─── Link do OBS ──────────────────────────────────────────────────────────

function LinkDoObs({ mesaId, linkObs }: { mesaId: string; linkObs: string }) {
  const [copiado, setCopiado] = useState(false);
  const [trocando, iniciarTroca] = useTransition();

  async function copiar() {
    try {
      await navigator.clipboard.writeText(linkObs);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão de área de transferência: o campo continua selecionável.
    }
  }

  function trocarLink() {
    if (!window.confirm("Gerar um link novo? O link atual para de funcionar e você vai precisar colar o novo no OBS.")) return;
    iniciarTroca(() => gerarNovoLinkGravacao(mesaId));
  }

  return (
    <Secao titulo="Link do OBS" icone="fa-link">
      <input
        className="grv-link-campo"
        type="text"
        readOnly
        value={linkObs}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Link do OBS"
      />
      <div className="grv-grupo">
        <button type="button" className="grv-botao primario" onClick={copiar}>
          <i className={`fas ${copiado ? "fa-check" : "fa-copy"}`} /> {copiado ? "Copiado" : "Copiar"}
        </button>
        <button type="button" className="grv-botao" onClick={trocarLink} disabled={trocando}>
          <i className="fas fa-rotate" /> Gerar novo link
        </button>
      </div>
      <ol className="grv-passos">
        <li>No OBS: <b>Fontes → + → Navegador</b>.</li>
        <li>Cole o link em <b>URL</b>; largura <b>1920</b>, altura <b>1080</b>.</li>
        <li>Deixe <b>esta aba aberta</b> enquanto grava.</li>
      </ol>
      <p className="grv-dica">Quem tiver o link vê a gravação. Se vazar, gere um novo.</p>
    </Secao>
  );
}

// ─── Peças ────────────────────────────────────────────────────────────────

function Secao({ titulo, icone, children }: { titulo: string; icone: string; children: React.ReactNode }) {
  return (
    <section className="grv-cartao">
      <h2>
        <i className={`fas ${icone}`} /> {titulo}
      </h2>
      {children}
    </section>
  );
}

// Palco 1920×1080 encolhido pra largura disponível, sobre o xadrez (transparente).
function Previa({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0.4);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setEscala(e.contentRect.width / LARGURA_TELA));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className="grv-previa" style={{ height: ALTURA_TELA * escala }}>
      <div style={{ transform: `scale(${escala})`, transformOrigin: "0 0", width: LARGURA_TELA }}>{children}</div>
    </div>
  );
}

// ─── Atalhos (Fase 4) ─────────────────────────────────────────────────────

function useAtalhos(
  configRef: React.RefObject<ConfigGravacao>,
  mudar: (f: (c: ConfigGravacao) => ConfigGravacao) => void,
  extra: { jogadoresPresentes: string[]; modoAgora: ModoGravacao; escolherModo: (modo: ModoGravacao) => void },
) {
  // O que o ouvinte precisa ler sempre atualizado.
  const atual = useRef({ mudar, ...extra });
  useEffect(() => {
    atual.current = { mudar, ...extra };
  });

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName))) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const { mudar, jogadoresPresentes, modoAgora, escolherModo } = atual.current;
      const c = configRef.current;
      const digito = /^Digit(\d)$/.exec(e.code)?.[1];
      // ⇧1…9 e 0 mexem na seleção do modo atual: Foco no Foco, em cena nos outros.
      const campo = modoAgora === "foco" ? "foco" : "emCena";
      const alternar = (id: string) =>
        mudar((x) => ({ ...x, [campo]: x[campo].includes(id) ? x[campo].filter((y) => y !== id) : [...x[campo], id] }));

      if (e.shiftKey && digito && digito !== "0") {
        const id = jogadoresPresentes[Number(digito) - 1];
        if (id) alternar(id);
      } else if (e.shiftKey && e.code === "KeyN") {
        mudar((x) => ({
          ...x,
          foco: x.foco.includes(ID_NARRADOR) ? x.foco.filter((y) => y !== ID_NARRADOR) : [...x.foco, ID_NARRADOR],
        }));
      } else if (e.shiftKey) {
        return;
      } else if (digito === "0") {
        mudar((x) => ({ ...x, [campo]: [] }));
      } else if (digito && Number(digito) <= MODOS_GRAVACAO.length) {
        escolherModo(MODOS_GRAVACAO[Number(digito) - 1].slug);
      } else {
        const mostrar = c.mostrar;
        const patch: Partial<MostrarGravacao> | null =
          e.code === "KeyN" ? { nome: !mostrar.nome }
          : e.code === "KeyV" ? { pv: proximoExibir(mostrar.pv) }
          : e.code === "KeyP" ? { pp: proximoExibir(mostrar.pp) }
          : e.code === "KeyR" ? { recursos: !mostrar.recursos }
          : e.code === "KeyC" ? { condicoes: !mostrar.condicoes }
          : e.code === "KeyF" ? { fala: !mostrar.fala }
          : null;
        if (!patch) return;
        mudar((x) => ({ ...x, mostrar: { ...x.mostrar, ...patch } }));
      }
      e.preventDefault();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [configRef]);
}

// ─── Repasse das mudanças da mesa ─────────────────────────────────────────

// Escuta as mudanças da mesa (só quem está logado passa pelo RLS), avisa o
// overlay pelo Broadcast e recarrega a prévia. Sessão ou combate novo:
// recarrega a página, pra passar a escutar o combate certo.
function useRepasseAoOverlay({
  mesaId,
  canal,
  personagemIds,
  sessaoId,
  combateId,
  aoMudar,
}: {
  mesaId: string;
  canal: string;
  personagemIds: string[];
  sessaoId: string | null;
  combateId: string | null;
  aoMudar: () => void;
}) {
  const router = useRouter();
  const [ligado, setLigado] = useState(false);
  const enviarRef = useRef<(config: ConfigGravacao) => void>(() => {});
  const ids = personagemIds.join(",");

  useEffect(() => {
    const supabase = createClient();
    let pronto = false;
    let pendente: ReturnType<typeof setTimeout> | null = null;

    // Nome exato: o overlay assina o mesmo.
    const aviso = supabase.channel(canal);
    aviso.subscribe((status) => {
      pronto = status === "SUBSCRIBED";
      setLigado(pronto);
    });

    const avisar = () => {
      if (pendente) clearTimeout(pendente);
      pendente = setTimeout(() => {
        if (pronto) void aviso.send({ type: "broadcast", event: EVENTO_MUDOU, payload: {} });
      }, ESPERA_AVISO);
    };
    enviarRef.current = (config) => {
      if (pronto) void aviso.send({ type: "broadcast", event: EVENTO_CONFIG, payload: { config } });
    };
    const mudou = () => {
      avisar();
      aoMudar();
    };
    const mudouERecarregar = () => {
      mudou();
      router.refresh();
    };

    const mudancas = supabase
      .channel(canalUnico(`gravacao-${mesaId}`))
      .on("postgres_changes", { event: "*", schema: "public", table: "personagens", filter: `mesa_id=eq.${mesaId}` }, mudou)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessoes", filter: `mesa_id=eq.${mesaId}` }, mudouERecarregar);
    if (ids) {
      mudancas.on("postgres_changes", { event: "*", schema: "public", table: "recursos", filter: `personagem_id=in.(${ids})` }, mudou);
    }
    if (sessaoId) {
      // Turno novo só avisa; combate que começa ou acaba recarrega a página,
      // pra escutar as instâncias do combate certo.
      mudancas.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "combates", filter: `sessao_id=eq.${sessaoId}` },
        (payload) => {
          const novo = payload.new as { encerrado_em?: string | null } | undefined;
          if (payload.eventType !== "UPDATE" || novo?.encerrado_em) mudouERecarregar();
          else mudou();
        },
      );
    }
    if (combateId) {
      mudancas.on("postgres_changes", { event: "*", schema: "public", table: "instancias_combate", filter: `combate_id=eq.${combateId}` }, mudou);
    }
    mudancas.subscribe();

    return () => {
      enviarRef.current = () => {};
      if (pendente) clearTimeout(pendente);
      supabase.removeChannel(aviso);
      supabase.removeChannel(mudancas);
    };
  }, [mesaId, canal, ids, sessaoId, combateId, router, aoMudar]);

  // Estável: lê o enviador do efeito atual.
  const [enviarConfig] = useState(() => (config: ConfigGravacao) => enviarRef.current(config));
  return { ligado, enviarConfig };
}
