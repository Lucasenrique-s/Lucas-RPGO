"use client";

import { useMemo, useRef, useState } from "react";
import { exigir } from "@/lib/acoes";
import { TIPOS_FICHA, type TipoFichaDiario } from "@/lib/diario-tipos";
import { itensDeEntidades, itensDeTempo, sem, type ConfigMencao, type ItemMencao } from "@/lib/diario-mencao";
import { avisar } from "./diario-partes";
import { criarFichaDiario } from "./actions";

// A busca fixa no topo do caderno: páginas (com apelidos), sessões, datas e eventos,
// e "Criar página «x»" quando o nome ainda não existe.
export function BuscaCaderno({
  mesaId,
  cfg,
  contagem,
  podeCriar,
  aoAbrirFicha,
  aoIrTempo,
  aoCriou,
}: {
  mesaId: string;
  cfg: ConfigMencao;
  // Quantas anotações minhas citam cada página.
  contagem: Record<string, number>;
  podeCriar: boolean;
  aoAbrirFicha: (id: string) => void;
  aoIrTempo: (item: ItemMencao) => void;
  // Criou a página: recebe o id pra abrir a folha dela.
  aoCriou: (id: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [foco, setFoco] = useState(false);
  const [escolhendo, setEscolhendo] = useState(false);
  const [criando, setCriando] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = busca.trim();
  const paginas = useMemo(() => itensDeEntidades(q, cfg.entidades), [q, cfg.entidades]);
  // O "Criar marco" do menu do editor não é busca.
  const tempo = useMemo(() => (q ? itensDeTempo(q, cfg).filter((i) => i.ref.tipo !== "marco") : []), [q, cfg]);
  // Uma data da campanha ou o nome de uma sessão/evento não vira página nova.
  const ehTempoExato = tempo.some((t) => sem(t.rotulo) === sem(q));
  const exato = ehTempoExato || paginas.some((p) => sem(p.rotulo) === sem(q) || cfg.entidades.some((e) => e.apelidos.some((a) => sem(a) === sem(q))));
  const lista = useMemo(() => [...paginas, ...tempo], [paginas, tempo]);

  function fechar() {
    setBusca("");
    setFoco(false);
    setEscolhendo(false);
    setAtivo(0);
  }

  function escolher(i: ItemMencao) {
    fechar();
    inputRef.current?.blur();
    if (i.ref.tipo === "ficha") aoAbrirFicha(i.ref.id);
    else aoIrTempo(i);
  }

  async function criar(tipo: TipoFichaDiario) {
    if (criando) return;
    setCriando(true);
    try {
      const r = exigir(await criarFichaDiario(mesaId, { tipo, nome: q }));
      fechar();
      inputRef.current?.blur();
      aoCriou(r.id);
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Falha ao criar a página.");
    } finally {
      setCriando(false);
    }
  }

  function teclas(e: React.KeyboardEvent) {
    if (e.key === "Escape") return void (busca ? setBusca("") : (e.currentTarget as HTMLElement).blur());
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (lista.length === 0) return;
      e.preventDefault();
      setAtivo((a) => (a + (e.key === "ArrowDown" ? 1 : lista.length - 1)) % lista.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const i = lista[Math.min(ativo, lista.length - 1)];
      if (i) escolher(i);
      else if (q && podeCriar && !exato) setEscolhendo(true);
    }
  }

  const mostrar = foco && (q.length > 0 || true);
  return (
    <div className="cad-busca">
      <i className="fas fa-magnifying-glass" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        value={busca}
        placeholder="Buscar pessoa, lugar, grupo, pista, sessão ou data…"
        aria-label="Buscar no caderno"
        onChange={(e) => {
          setBusca(e.target.value);
          setFoco(true);
          setEscolhendo(false);
          setAtivo(0);
        }}
        onFocus={() => setFoco(true)}
        onBlur={() => window.setTimeout(() => setFoco(false), 150)}
        onKeyDown={teclas}
      />
      {mostrar && (
        <div className="cad-busca-res" role="listbox" onMouseDown={(e) => e.preventDefault()}>
          {paginas.length > 0 && <div className="cad-busca-sec">Páginas</div>}
          {paginas.map((p, n) => (
            <button key={p.chave} type="button" role="option" aria-selected={n === ativo} className="cad-busca-item" onClick={() => escolher(p)}>
              <span className="cad-busca-ico" style={{ background: p.cor }}>
                <i className={`fas ${p.icone}`} />
              </span>
              <span>{p.rotulo}</span>
              <small>
                {p.detalhe}
                {contagem[p.ref.id] ? ` · ${contagem[p.ref.id]} ${contagem[p.ref.id] === 1 ? "anotação" : "anotações"}` : ""}
              </small>
            </button>
          ))}
          {tempo.length > 0 && <div className="cad-busca-sec">Tempo</div>}
          {tempo.map((t, n) => (
            <button key={t.chave} type="button" role="option" aria-selected={paginas.length + n === ativo} className="cad-busca-item" onClick={() => escolher(t)}>
              <span className="cad-busca-ico cad-busca-ico--tempo">
                <i className={`fas ${t.icone}`} />
              </span>
              <span>{t.rotulo}</span>
              <small>{t.detalhe}</small>
            </button>
          ))}
          {q && podeCriar && !exato && !escolhendo && (
            <button type="button" className="cad-busca-item cad-busca-item--criar" onClick={() => setEscolhendo(true)}>
              <span className="cad-busca-ico cad-busca-ico--criar">+</span>
              <span>Criar página “{q}”</span>
              <small>vazia, pra preencher depois</small>
            </button>
          )}
          {escolhendo && (
            <div className="cad-busca-tipos">
              <span>“{q}” como:</span>
              <div>
                {TIPOS_FICHA.map((t) => (
                  <button key={t.id} type="button" disabled={criando} onClick={() => void criar(t.id)}>
                    <i className={`fas ${t.icone}`} style={{ color: t.cor }} /> {t.nome}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!q && <div className="cad-busca-dica">Comece a digitar. Os apelidos também valem.</div>}
          {q && lista.length === 0 && (!podeCriar || exato) && <div className="cad-busca-dica">Nada encontrado.</div>}
        </div>
      )}
    </div>
  );
}
