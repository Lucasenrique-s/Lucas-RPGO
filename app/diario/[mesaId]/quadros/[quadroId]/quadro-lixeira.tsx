"use client";

import { useCallback, useEffect, useState } from "react";
import { exigir } from "@/lib/acoes";
import { LIMITES_QUADRO, type CartaoDTO, type ItemLixeiraDTO, type LigacaoDTO } from "@/lib/diario-quadro-tipos";
import { listarLixeiraQuadro, restaurarCartoesQuadro } from "../../quadro-acoes";
import { avisar } from "../../diario-partes";

const ICONE: Record<string, string> = {
  postit: "fa-note-sticky",
  pagina: "fa-address-card",
  nota: "fa-file-lines",
  sessao: "fa-flag",
  imagem: "fa-image",
  moldura: "fa-object-group",
  texto: "fa-font",
};
const ROTULO: Record<string, string> = {
  postit: "Post-it",
  pagina: "Página",
  nota: "Anotação",
  sessao: "Sessão",
  imagem: "Imagem",
  moldura: "Moldura",
  texto: "Texto",
};

const faltam = (iso: string) => {
  const dias = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  return dias <= 1 ? "some hoje ou amanhã" : `some em ${dias} dias`;
};

const quando = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} d`;
};

// Lixeira do quadro: o que foi apagado fica aqui por alguns dias. No quadro da mesa só o narrador restaura o que
// os outros apagaram; cada um restaura o que apagou (é também o Ctrl+Z).
export function Lixeira({
  mesaId,
  quadroId,
  meuId,
  autores,
  aoRestaurar,
}: {
  mesaId: string;
  quadroId: string;
  meuId: string;
  autores: Record<string, string>;
  aoRestaurar: (cartoes: CartaoDTO[], ligacoes: LigacaoDTO[]) => void;
}) {
  const [aberta, setAberta] = useState(false);
  const [itens, setItens] = useState<ItemLixeiraDTO[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setItens(exigir(await listarLixeiraQuadro(mesaId, quadroId)).itens);
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Não foi possível abrir a lixeira.");
      setAberta(false);
    }
  }, [mesaId, quadroId]);

  useEffect(() => {
    if (!aberta) return;
    const t = window.setTimeout(() => void carregar(), 0);
    return () => window.clearTimeout(t);
  }, [aberta, carregar]);

  async function restaurar(i: ItemLixeiraDTO) {
    setOcupado(i.cartao.id);
    try {
      const r = exigir(await restaurarCartoesQuadro(mesaId, quadroId, [i.cartao.id]));
      aoRestaurar(r.cartoes, r.ligacoes);
      setItens((l) => (l ? l.filter((x) => x.cartao.id !== i.cartao.id) : l));
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Não foi possível restaurar.");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="ql">
      <button type="button" className="qt-btn" aria-expanded={aberta} onClick={() => setAberta((v) => !v)} title="Lixeira do quadro">
        <i className="fas fa-trash-can-arrow-up" /> <span className="ql-rotulo">Lixeira</span>
      </button>
      {aberta && (
        <div className="ql-painel" role="dialog" aria-label="Lixeira do quadro">
          <div className="ql-topo">
            <b>Apagados</b>
            <small>Ficam {LIMITES_QUADRO.lixeiraDias} dias.</small>
            <button type="button" className="ql-fechar" onClick={() => setAberta(false)} aria-label="Fechar a lixeira">
              <i className="fas fa-xmark" />
            </button>
          </div>
          {itens === null ? (
            <p className="ql-vazio">Carregando…</p>
          ) : itens.length === 0 ? (
            <p className="ql-vazio">Nada na lixeira.</p>
          ) : (
            <ul className="ql-lista">
              {itens.map((i) => {
                const c = i.cartao;
                const resumo = c.texto.trim() || (c.tipo === "imagem" ? "Imagem" : ROTULO[c.tipo]);
                const por = i.apagadoPor ? (i.apagadoPor === meuId ? "você" : (autores[i.apagadoPor] ?? "alguém")) : "alguém";
                return (
                  <li key={c.id} className="ql-item">
                    <i className={`fas ${ICONE[c.tipo] ?? "fa-file"} ql-icone`} aria-hidden />
                    <span className="ql-texto">
                      <b>{resumo.length > 48 ? `${resumo.slice(0, 47)}…` : resumo}</b>
                      <small>
                        {ROTULO[c.tipo]} · apagado por {por} {quando(i.apagadoEm)} · {faltam(i.venceEm)}
                      </small>
                    </span>
                    <button type="button" className="ql-restaurar" disabled={!i.podeRestaurar || ocupado === c.id} onClick={() => void restaurar(i)} title={i.podeRestaurar ? "Restaurar" : "Só o narrador restaura o que outra pessoa apagou"}>
                      Restaurar
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
