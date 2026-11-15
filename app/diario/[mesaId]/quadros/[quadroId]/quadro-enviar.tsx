"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { exigir } from "@/lib/acoes";
import type { PreparoImportacaoDTO, ResultadoImportacaoDTO } from "@/lib/diario-quadro-tipos";
import { importarParaQuadroDaMesa, prepararImportacaoQuadro, type DecisaoPrivado } from "../../quadro-importar";
import { avisar } from "../../diario-partes";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

// "Enviar para o quadro da mesa": copia os cartões escolhidos (e as ligações entre eles). Antes de copiar,
// lista o que é privado e o autor escolhe, item por item, publicar ou deixar de fora.
export function EnviarParaMesa({ mesaId, quadroId, ids }: { mesaId: string; quadroId: string; ids: string[] }) {
  const router = useRouter();
  const [preparo, setPreparo] = useState<PreparoImportacaoDTO | null>(null);
  const [decisoes, setDecisoes] = useState<Record<string, DecisaoPrivado>>({});
  const [resultado, setResultado] = useState<ResultadoImportacaoDTO | null>(null);
  const [ocupado, setOcupado] = useState(false);

  if (ids.length === 0 && !preparo && !resultado) return null;

  async function abrir() {
    setOcupado(true);
    try {
      const p = exigir(await prepararImportacaoQuadro(mesaId, quadroId, ids)).preparo;
      setDecisoes(Object.fromEntries(p.privados.map((i) => [i.cartaoId, "fora" as DecisaoPrivado])));
      setPreparo(p);
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Não foi possível preparar o envio.");
    } finally {
      setOcupado(false);
    }
  }

  async function enviar() {
    if (!preparo) return;
    setOcupado(true);
    try {
      const r = exigir(await importarParaQuadroDaMesa(mesaId, quadroId, ids, decisoes)).resultado;
      setPreparo(null);
      setResultado(r);
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Não foi possível enviar.");
    } finally {
      setOcupado(false);
    }
  }

  const vao = preparo ? preparo.comuns + preparo.privados.filter((p) => decisoes[p.cartaoId] === "publicar" && p.podePublicar).length : 0;

  return (
    <>
      {ids.length > 0 && !preparo && !resultado && (
        <div className="qe-barra" role="status">
          <span>{plural(ids.length, "cartão selecionado", "cartões selecionados")}</span>
          <button type="button" className="qe-btn" disabled={ocupado} onClick={() => void abrir()}>
            <i className="fas fa-share-from-square" /> Enviar para o quadro da mesa
          </button>
        </div>
      )}

      {preparo && (
        <div className="qb qe-fundo" role="dialog" aria-label="Enviar para o quadro da mesa" onMouseDown={(e) => e.target === e.currentTarget && !ocupado && setPreparo(null)}>
          <div className="qb-caixa qe-caixa">
            <div className="qe-cab">
              <b>Enviar para o quadro da mesa</b>
              <p>Vai uma cópia: mexer em um não muda o outro. As ligações entre os cartões vão junto.</p>
            </div>
            <div className="qe-corpo">
              <p>
                <i className="fas fa-check" /> {plural(preparo.comuns, "cartão vai", "cartões vão")} como {preparo.comuns === 1 ? "está" : "estão"}.
              </p>
              {preparo.jaNoQuadro.length > 0 && (
                <p>
                  <i className="fas fa-link" /> Já {preparo.jaNoQuadro.length === 1 ? "está" : "estão"} no quadro da mesa: <b>{preparo.jaNoQuadro.join(", ")}</b>. Não duplica: as ligações vão para {preparo.jaNoQuadro.length === 1 ? "o que já existe" : "os que já existem"}.
                </p>
              )}
              {preparo.ocultos > 0 && (
                <p>
                  <i className="fas fa-lock" /> {plural(preparo.ocultos, "página oculta vai", "páginas ocultas vão")} oculta{preparo.ocultos === 1 ? "" : "s"}: o narrador revela quando quiser.
                </p>
              )}
              {preparo.inacessiveis > 0 && (
                <p className="qe-aviso">
                  <i className="fas fa-triangle-exclamation" /> {plural(preparo.inacessiveis, "cartão fica", "cartões ficam")} de fora: a página, anotação ou sessão foi apagada ou você não a lê.
                </p>
              )}
              {preparo.privados.length > 0 && (
                <div className="qe-privados">
                  <b>Estes são privados. A mesa só os vê se você publicar.</b>
                  <ul>
                    {preparo.privados.map((p) => (
                      <li key={p.cartaoId}>
                        <span>
                          <i className={`fas ${p.tipo === "pagina" ? "fa-address-card" : "fa-file-lines"}`} /> {p.nome}
                        </span>
                        {p.podePublicar ? (
                          <span className="qe-escolha" role="group" aria-label={`O que fazer com ${p.nome}`}>
                            <button type="button" aria-pressed={decisoes[p.cartaoId] === "fora"} onClick={() => setDecisoes((d) => ({ ...d, [p.cartaoId]: "fora" }))}>
                              Deixar de fora
                            </button>
                            <button type="button" aria-pressed={decisoes[p.cartaoId] === "publicar"} onClick={() => setDecisoes((d) => ({ ...d, [p.cartaoId]: "publicar" }))}>
                              Publicar
                            </button>
                          </span>
                        ) : (
                          <small>só o autor publica · fica de fora</small>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="qe-rodape">
              <button type="button" className="qe-sec" disabled={ocupado} onClick={() => setPreparo(null)}>
                Cancelar
              </button>
              <button type="button" className="qe-btn" disabled={ocupado || (vao === 0 && preparo.jaNoQuadro.length === 0)} onClick={() => void enviar()}>
                {ocupado ? "Enviando…" : `Enviar ${plural(vao + preparo.jaNoQuadro.length, "cartão", "cartões")}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {resultado && (
        <div className="qb qe-fundo" role="dialog" aria-label="Envio concluído">
          <div className="qb-caixa qe-caixa">
            <div className="qe-cab">
              <b>Enviado para o quadro da mesa</b>
            </div>
            <div className="qe-corpo">
              <p>
                <i className="fas fa-check" /> {plural(resultado.criados, "cartão criado", "cartões criados")}
                {resultado.reutilizados > 0 ? `, ${plural(resultado.reutilizados, "já existia", "já existiam")}` : ""}
                {resultado.ligacoes > 0 ? `, ${plural(resultado.ligacoes, "ligação", "ligações")}` : ""}.
              </p>
              {resultado.publicados > 0 && (
                <p>
                  <i className="fas fa-earth-americas" /> {plural(resultado.publicados, "item publicado", "itens publicados")} para a mesa.
                </p>
              )}
              {resultado.deixadosDeFora > 0 && (
                <p>
                  <i className="fas fa-ban" /> {plural(resultado.deixadosDeFora, "item ficou", "itens ficaram")} de fora.
                </p>
              )}
            </div>
            <div className="qe-rodape">
              <button type="button" className="qe-sec" onClick={() => setResultado(null)}>
                Ficar aqui
              </button>
              <button type="button" className="qe-btn" onClick={() => router.push(`/diario/${mesaId}/quadros/${resultado.destinoId}`)}>
                Abrir o quadro da mesa
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
