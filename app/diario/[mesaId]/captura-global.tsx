"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { rotuloSessao, type CalendarioDiarioDTO, type MarcoDiarioDTO, type SessaoDiarioDTO, type TipoFichaDiario } from "@/lib/diario-tipos";
import { montarConfigMencao, montarInfoMencao } from "@/lib/diario-mencao";
import type { ContextoRico, OpcaoRef } from "@/components/descricao-rica/atomos";
import { CapturaRapida } from "./captura-rapida";
import { iconeDoTipo } from "./diario-partes";
import "./diario.css";

// Anotação rápida em qualquer tela da mesa (ficha, painel do narrador, calendário):
// Ctrl+J abre a caixa, Ctrl+Enter salva na sessão ao vivo. Só carrega o que o `@` precisa.
export function CapturaGlobal({
  mesaId,
  meuId,
  fichas,
  marcos,
  sessoes,
  calendario,
}: {
  mesaId: string;
  meuId: string;
  fichas: { id: string; nome: string; tipo: TipoFichaDiario; apelidos: string[] }[];
  marcos: MarcoDiarioDTO[];
  sessoes: SessaoDiarioDTO[];
  calendario: CalendarioDiarioDTO | null;
}) {
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const abrir = useCallback(() => setAberta(true), []);
  const fechar = useCallback(() => setAberta(false), []);

  const refs = useMemo<OpcaoRef[]>(
    () => [
      ...fichas.map((f): OpcaoRef => ({ tipo: "ficha", id: f.id, nome: f.nome })),
      ...sessoes.map((s): OpcaoRef => ({ tipo: "sessao", id: s.id, nome: rotuloSessao(s) })),
      ...(calendario?.eventos ?? []).map((e): OpcaoRef => ({ tipo: "evento", id: e.id, nome: e.titulo })),
    ],
    [fichas, sessoes, calendario],
  );

  const cfg = useMemo(() => montarConfigMencao(fichas, sessoes, calendario), [fichas, sessoes, calendario]);
  const contexto = useMemo<ContextoRico>(
    () => ({
      refs: montarInfoMencao(fichas, sessoes, calendario, marcos),
      ...(calendario ? { calendario: { config: calendario.config, hoje: calendario.hoje } } : {}),
    }),
    [fichas, sessoes, calendario, marcos],
  );

  const ativa = sessoes.find((s) => s.ativa);

  return (
    <CapturaRapida
      mesaId={mesaId}
      meuId={meuId}
      refs={refs}
      cfg={cfg}
      contexto={contexto}
      rotuloSessao={ativa ? rotuloSessao(ativa) : "Entre sessões"}
      aberta={aberta}
      aoAbrir={abrir}
      aoFechar={fechar}
      aoSalvou={() => {
        void Swal.fire({
          toast: true,
          position: "bottom-end",
          icon: "success",
          title: "Anotação salva no diário",
          showConfirmButton: false,
          timer: 2000,
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });
        router.refresh();
      }}
    />
  );
}
