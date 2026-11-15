"use client";

import { useEffect, useMemo, useState } from "react";
import { exigir } from "@/lib/acoes";
import { corDaPessoa, iniciais } from "@/lib/diario-quadro-presenca";
import type { NivelAcesso } from "@/lib/diario-quadro-tipos";
import { definirAcessoQuadro, listarAcessosQuadro } from "../../quadros-actions";
import { avisar } from "../../diario-partes";

type Valor = NivelAcesso | "nenhum";

// Compartilhar um quadro pessoal: por pessoa, com "ver" ou "editar". O dono tira o acesso quando quiser, e o
// quadro aparece na lista da pessoa com o nome dele. O narrador sempre pode ler (a mesa avisa).
export function Compartilhar({ mesaId, quadroId, meuId, autores }: { mesaId: string; quadroId: string; meuId: string; autores: Record<string, string> }) {
  const [aberto, setAberto] = useState(false);
  const [acessos, setAcessos] = useState<Record<string, NivelAcesso> | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const pessoas = useMemo(
    () => Object.entries(autores).filter(([id]) => id !== meuId).sort((a, b) => a[1].localeCompare(b[1], "pt-BR")),
    [autores, meuId],
  );

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    const t = window.setTimeout(async () => {
      try {
        const r = exigir(await listarAcessosQuadro(mesaId, quadroId));
        if (vivo) setAcessos(Object.fromEntries(r.acessos.map((a) => [a.userId, a.nivel])));
      } catch (e) {
        avisar(e instanceof Error ? e.message : "Não foi possível abrir o compartilhamento.");
        if (vivo) setAberto(false);
      }
    }, 0);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [aberto, mesaId, quadroId]);

  async function mudar(userId: string, v: Valor) {
    setOcupado(userId);
    try {
      exigir(await definirAcessoQuadro(mesaId, quadroId, userId, v === "nenhum" ? null : v));
      setAcessos((a) => {
        const novo = { ...(a ?? {}) };
        if (v === "nenhum") delete novo[userId];
        else novo[userId] = v;
        return novo;
      });
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Não foi possível mudar o acesso.");
    } finally {
      setOcupado(null);
    }
  }

  const total = acessos ? Object.keys(acessos).length : 0;

  return (
    <div className="qs">
      <button type="button" className="qt-btn" aria-expanded={aberto} onClick={() => setAberto((v) => !v)} title="Compartilhar o quadro">
        <i className="fas fa-user-plus" /> <span className="ql-rotulo">Compartilhar{total > 0 ? ` (${total})` : ""}</span>
      </button>
      {aberto && (
        <div className="ql-painel qs-painel" role="dialog" aria-label="Compartilhar o quadro">
          <div className="ql-topo">
            <b>Compartilhar</b>
            <small>Por pessoa, ver ou editar.</small>
            <button type="button" className="ql-fechar" onClick={() => setAberto(false)} aria-label="Fechar">
              <i className="fas fa-xmark" />
            </button>
          </div>
          {acessos === null ? (
            <p className="ql-vazio">Carregando…</p>
          ) : pessoas.length === 0 ? (
            <p className="ql-vazio">Não há mais ninguém na mesa.</p>
          ) : (
            <ul className="ql-lista">
              {pessoas.map(([id, nome]) => (
                <li key={id} className="ql-item">
                  <span className="qp-avatar qs-avatar" data-cor={corDaPessoa(id)} aria-hidden>
                    {iniciais(nome)}
                  </span>
                  <span className="ql-texto">
                    <b>{nome}</b>
                  </span>
                  <select
                    className="qs-nivel"
                    aria-label={`Acesso de ${nome}`}
                    value={acessos[id] ?? "nenhum"}
                    disabled={ocupado === id}
                    onChange={(e) => void mudar(id, e.target.value as Valor)}
                  >
                    <option value="nenhum">Sem acesso</option>
                    <option value="ver">Pode ver</option>
                    <option value="editar">Pode editar</option>
                  </select>
                </li>
              ))}
            </ul>
          )}
          <p className="qs-nota">
            <i className="fas fa-eye" /> O narrador também pode ler este quadro.
          </p>
        </div>
      )}
    </div>
  );
}
