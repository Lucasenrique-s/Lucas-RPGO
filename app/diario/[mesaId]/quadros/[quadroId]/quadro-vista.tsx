"use client";

import { useRef, useState } from "react";
import { corDaPessoa, iniciais } from "@/lib/diario-quadro-presenca";
import { rotuloSessao } from "@/lib/diario-tipos";
import type { RefSessaoDTO } from "@/lib/diario-quadro-tipos";

type Painel = "busca" | "camadas" | "autor" | "mapa";

export type Achado = { id: string; rotulo: string; tipo: string };

const ICONE_TIPO: Record<string, string> = {
  postit: "fa-note-sticky",
  pagina: "fa-address-card",
  nota: "fa-file-lines",
  sessao: "fa-flag",
  imagem: "fa-image",
  moldura: "fa-object-group",
  texto: "fa-font",
};

// As formas de olhar o quadro, numa fileira só: buscar, investigar, camadas por sessão, cor por autor e mapa.
export function Vista({
  investigando,
  aoInvestigar,
  camada,
  sessoes,
  aoCamada,
  porAutor,
  aoPorAutor,
  autores,
  termo,
  aoTermo,
  achados,
  aoIrPara,
  podeTrocarMapa,
  temMapa,
  aoTrocarMapa,
  aoTirarMapa,
  enviandoMapa,
}: {
  investigando: boolean;
  aoInvestigar: () => void;
  // Índice (da sessão mais antiga) até onde se mostra; null = tudo.
  camada: number | null;
  sessoes: RefSessaoDTO[];
  aoCamada: (c: number | null) => void;
  porAutor: boolean;
  aoPorAutor: () => void;
  // Quem fez cartões neste quadro, com o nome.
  autores: { id: string; nome: string }[];
  termo: string;
  aoTermo: (t: string) => void;
  achados: Achado[];
  aoIrPara: (id: string) => void;
  podeTrocarMapa: boolean;
  temMapa: boolean;
  aoTrocarMapa: (arquivo: File) => void;
  aoTirarMapa: () => void;
  enviandoMapa: boolean;
}) {
  const [painel, setPainel] = useState<Painel | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const alterna = (p: Painel) => setPainel((a) => (a === p ? null : p));

  const filtrando = camada !== null && camada < sessoes.length - 1;
  const nomeCamada = camada === null || sessoes.length === 0 ? "Tudo" : rotuloCurto(sessoes[Math.min(camada, sessoes.length - 1)]);

  return (
    <div className="qv" role="toolbar" aria-label="Formas de olhar o quadro">
      <div className="qv-barra">
        <button type="button" className={`qv-btn${painel === "busca" || termo ? " qv-btn--on" : ""}`} aria-expanded={painel === "busca"} onClick={() => alterna("busca")} title="Buscar no quadro ( / )">
          <i className="fas fa-magnifying-glass" /> <span>Buscar</span>
        </button>
        <button type="button" className={`qv-btn${investigando ? " qv-btn--on" : ""}`} aria-pressed={investigando} onClick={aoInvestigar} title="Modo investigação: segue os fios a partir de um cartão">
          <i className="fas fa-user-secret" /> <span>Investigar</span>
        </button>
        {sessoes.length > 1 && (
          <button type="button" className={`qv-btn${filtrando ? " qv-btn--on" : ""}`} aria-expanded={painel === "camadas"} onClick={() => alterna("camadas")} title="Camadas por sessão">
            <i className="fas fa-layer-group" /> <span>{filtrando ? nomeCamada : "Camadas"}</span>
          </button>
        )}
        <button type="button" className={`qv-btn${porAutor ? " qv-btn--on" : ""}`} aria-pressed={porAutor} aria-expanded={painel === "autor"} onClick={() => (porAutor ? (aoPorAutor(), setPainel(null)) : (aoPorAutor(), setPainel("autor")))} title="Cor por autor">
          <i className="fas fa-palette" /> <span>Por autor</span>
        </button>
        {(podeTrocarMapa || temMapa) && (
          <button type="button" className={`qv-btn${temMapa ? " qv-btn--on" : ""}`} aria-expanded={painel === "mapa"} onClick={() => alterna("mapa")} title="Mapa: imagem de fundo com alfinetes">
            <i className="fas fa-map" /> <span>Mapa</span>
          </button>
        )}
      </div>

      {painel === "busca" && (
        <div className="qv-painel">
          <input
            className="qv-campo"
            type="search"
            autoFocus
            value={termo}
            placeholder="Buscar nos cartões…"
            aria-label="Buscar no quadro"
            onChange={(e) => aoTermo(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") setPainel(null);
              if (e.key === "Enter" && achados[0]) aoIrPara(achados[0].id);
            }}
          />
          {termo.trim() !== "" && (
            <ul className="qv-lista">
              {achados.slice(0, 30).map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => aoIrPara(a.id)}>
                    <i className={`fas ${ICONE_TIPO[a.tipo] ?? "fa-file"}`} aria-hidden /> <span>{a.rotulo}</span>
                  </button>
                </li>
              ))}
              {achados.length === 0 && <li className="qv-vazio">Nada com “{termo}”.</li>}
              {achados.length > 30 && <li className="qv-vazio">+{achados.length - 30} resultados: refine a busca.</li>}
            </ul>
          )}
        </div>
      )}

      {painel === "camadas" && sessoes.length > 1 && (
        <div className="qv-painel">
          <b>Mostrar até {nomeCamada === "Tudo" ? "a sessão mais nova" : nomeCamada}</b>
          <input
            className="qv-faixa"
            type="range"
            min={0}
            max={sessoes.length - 1}
            step={1}
            value={camada === null ? sessoes.length - 1 : Math.min(camada, sessoes.length - 1)}
            aria-label="Mostrar cartões até a sessão"
            onChange={(e) => {
              const v = Number(e.target.value);
              aoCamada(v >= sessoes.length - 1 ? null : v);
            }}
          />
          <div className="qv-faixa-rotulos">
            <small>{rotuloCurto(sessoes[0])}</small>
            <small>{rotuloCurto(sessoes[sessoes.length - 1])}</small>
          </div>
          <p>Cada cartão guarda a sessão em que nasceu. O que nasceu depois da escolhida fica escondido (nada é apagado).</p>
          {filtrando && (
            <button type="button" className="qv-link" onClick={() => aoCamada(null)}>
              Mostrar tudo
            </button>
          )}
        </div>
      )}

      {painel === "autor" && porAutor && (
        <div className="qv-painel">
          <b>Quem fez cada cartão</b>
          <ul className="qv-legenda">
            {autores.map((a) => (
              <li key={a.id}>
                <span className="qp-avatar qv-bolinha" data-cor={corDaPessoa(a.id)} aria-hidden>
                  {iniciais(a.nome)}
                </span>
                {a.nome}
              </li>
            ))}
            {autores.length === 0 && <li className="qv-vazio">Ainda não há cartões.</li>}
          </ul>
        </div>
      )}

      {painel === "mapa" && (
        <div className="qv-painel">
          <b>Mapa</b>
          <p>Uma imagem de fundo vira mapa: as páginas de Local entram como alfinetes, e qualquer post-it pode virar alfinete.</p>
          {podeTrocarMapa ? (
            <div className="qv-acoes">
              <button type="button" className="qv-link qv-link--cheio" disabled={enviandoMapa} onClick={() => arquivo.current?.click()}>
                {enviandoMapa ? "Enviando…" : temMapa ? "Trocar a imagem" : "Escolher a imagem do mapa"}
              </button>
              {temMapa && (
                <button type="button" className="qv-link" disabled={enviandoMapa} onClick={aoTirarMapa}>
                  Tirar o mapa
                </button>
              )}
              <input
                ref={arquivo}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) aoTrocarMapa(f);
                  e.target.value = "";
                }}
              />
            </div>
          ) : (
            <p>Só quem manda no quadro troca o mapa.</p>
          )}
        </div>
      )}
    </div>
  );
}

function rotuloCurto(s: RefSessaoDTO): string {
  return s.numero != null ? `Sessão ${s.numero}` : rotuloSessao(s);
}
