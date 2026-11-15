"use client";

import { useMemo, useState } from "react";
import { exigir } from "@/lib/acoes";
import { TIPOS_FICHA, type FichaDiarioDTO } from "@/lib/diario-tipos";
import { sem } from "@/lib/diario-mencao";
import { adicionarRelacaoDiario } from "./actions";

// Sugestões, por assunto. O campo continua livre: "namorado de", "capanga de", "deve um favor a"…
export const VERBOS_SUGERIDOS: { grupo: string; verbos: string[] }[] = [
  { grupo: "Família", verbos: ["irmão de", "irmã de", "pai de", "mãe de", "filho de", "filha de", "primo de", "prima de", "avô de"] },
  { grupo: "Afeto", verbos: ["namorado de", "namorada de", "casado com", "apaixonado por", "amigo de", "amiga de"] },
  { grupo: "Aliança", verbos: ["aliado de", "aliada de", "mentor de", "discípulo de", "protege", "serve a", "deve um favor a"] },
  { grupo: "Conflito", verbos: ["inimigo de", "inimiga de", "rival de", "persegue", "traiu", "caça"] },
  { grupo: "Grupo", verbos: ["membro de", "líder de", "capitão de", "fundador de", "parte de", "comanda"] },
  { grupo: "Lugar e coisas", verbos: ["está em", "mora em", "nasceu em", "dono de", "tem", "guarda", "procura"] },
];

// Nova relação: o tipo (escolhido numa lista ou escrito à mão) e com quem (busca por nome).
export function NovaRelacao({
  mesaId,
  ficha,
  fichas,
  aoErro,
  aoAdicionou,
}: {
  mesaId: string;
  ficha: FichaDiarioDTO;
  fichas: FichaDiarioDTO[];
  aoErro: (mensagem: string) => void;
  aoAdicionou: () => void;
}) {
  const [verbo, setVerbo] = useState("");
  const [busca, setBusca] = useState("");
  const [alvo, setAlvo] = useState<FichaDiarioDTO | null>(null);
  const [sugerindo, setSugerindo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const opcoes = useMemo(() => {
    const q = sem(busca.trim());
    return fichas
      .filter((f) => f.id !== ficha.id)
      .filter((f) => !q || [f.nome, ...f.apelidos].some((n) => sem(n).includes(q)))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, 8);
  }, [fichas, ficha.id, busca]);

  const v = verbo.trim();
  const pronto = !!v && !!alvo && !salvando;
  const tipoDo = (f: FichaDiarioDTO) => TIPOS_FICHA.find((t) => t.id === f.tipo);

  async function adicionar() {
    if (!pronto || !alvo) return;
    setSalvando(true);
    try {
      exigir(await adicionarRelacaoDiario(mesaId, ficha.id, v, alvo.id));
      setVerbo("");
      setBusca("");
      setAlvo(null);
      aoAdicionou();
    } catch (e) {
      aoErro(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="rel-nova">
      <div className="rel-passo">
        <label>
          <span>1 · Qual é a relação?</span>
          <input
            type="text"
            value={verbo}
            maxLength={40}
            placeholder="escolha abaixo ou escreva: namorado de, inimigo de…"
            onChange={(e) => setVerbo(e.target.value)}
            onFocus={() => setSugerindo(true)}
          />
        </label>
        {(sugerindo || !v) && (
          <div className="rel-sugestoes">
            {VERBOS_SUGERIDOS.map((g) => (
              <div key={g.grupo}>
                <small>{g.grupo}</small>
                <div>
                  {g.verbos.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={s === v ? "on" : ""}
                      onClick={() => {
                        setVerbo(s);
                        setSugerindo(false);
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rel-passo">
        <label>
          <span>2 · Com quem ou com o quê?</span>
          {alvo ? (
            <span className="rel-alvo">
              <span className="rel-alvo-ico" style={{ background: tipoDo(alvo)?.cor }}>
                <i className={`fas ${tipoDo(alvo)?.icone}`} />
              </span>
              {alvo.nome}
              <button type="button" onClick={() => setAlvo(null)} aria-label="Trocar a página">
                trocar
              </button>
            </span>
          ) : (
            <input type="search" value={busca} placeholder="Busque uma página (Marinha, Nami, Alabasta…)" onChange={(e) => setBusca(e.target.value)} />
          )}
        </label>
        {!alvo && (
          <div className="rel-lista" role="listbox">
            {opcoes.length === 0 && <small className="rel-vazio">Nenhuma página com esse nome. Crie a página antes, escrevendo @Nome numa anotação.</small>}
            {opcoes.map((f) => (
              <button key={f.id} type="button" role="option" aria-selected={false} onClick={() => setAlvo(f)}>
                <span className="rel-alvo-ico" style={{ background: tipoDo(f)?.cor }}>
                  <i className={`fas ${tipoDo(f)?.icone}`} />
                </span>
                {f.nome}
                <small>{tipoDo(f)?.nome}</small>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rel-previa">
        {v && alvo ? (
          <>
            <b>{ficha.nome}</b> <em>{v}</em> <b>{alvo.nome}</b>
          </>
        ) : (
          <small>A frase aparece aqui, por exemplo: Luffy · capitão de · Bando do Chapéu de Palha.</small>
        )}
        <button type="button" className="diario-btn diario-btn--primario" disabled={!pronto} onClick={() => void adicionar()}>
          Adicionar relação
        </button>
      </div>
    </div>
  );
}
