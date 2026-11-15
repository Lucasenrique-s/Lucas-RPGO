"use client";

import { createContext, useContext } from "react";
import type { Edge, Node } from "@xyflow/react";
import type {
  Alinhamento,
  CartaoDTO,
  CorTexto,
  CorCartao,
  LigacaoDTO,
  RefNotaDTO,
  RefPaginaDTO,
  RefSessaoDTO,
} from "@/lib/diario-quadro-tipos";
import type { DadosLigacao } from "../../quadro-acoes";

// O que a mini-barra muda no texto de um cartão (fonte nula volta ao tamanho padrão do tipo).
export type FormatoTexto = { fonte?: number | null; alinhamento?: Alinhamento; corTexto?: CorTexto; negrito?: boolean };

export type DadosNo = { cartao: CartaoDTO } & Record<string, unknown>;
export type NoCartao = Node<DadosNo>;
export type DadosAresta = { ligacao: LigacaoDTO } & Record<string, unknown>;
export type ArestaLigacao = Edge<DadosAresta>;

// O que os nós e o barbante precisam do quadro (dados e ações), sem passar por props em cada um.
export type CtxQuadro = {
  mesaId: string;
  meuId: string;
  podeEditar: boolean;
  autores: Record<string, string>;
  paginas: Map<string, RefPaginaDTO>;
  notas: Map<string, RefNotaDTO>;
  sessoes: Map<string, RefSessaoDTO>;
  // Cartão em edição de texto (só um por vez).
  editandoId: string | null;
  editar: (id: string | null) => void;
  salvarTexto: (id: string, texto: string) => void;
  salvarTamanho: (id: string, g: { x: number; y: number; largura: number; altura: number }) => void;
  mudarCor: (ids: string[], cor: CorCartao) => void;
  formatar: (ids: string[], formato: FormatoTexto) => void;
  apagar: (ids: string[]) => void;
  duplicar: (ids: string[]) => void;
  abrirReferencia: (cartao: CartaoDTO) => void;
  // Barbante.
  atualizarLigacao: (id: string, dados: DadosLigacao) => void;
  apagarLigacao: (id: string) => void;
  selecionarLigacao: (id: string) => void;
  // Origem escolhida na ferramenta "Ligação" (clicar num cartão e depois noutro).
  ligandoDe: string | null;
};

export const QuadroContexto = createContext<CtxQuadro | null>(null);

export function useQuadro(): CtxQuadro {
  const c = useContext(QuadroContexto);
  if (!c) throw new Error("useQuadro fora do QuadroContexto");
  return c;
}
