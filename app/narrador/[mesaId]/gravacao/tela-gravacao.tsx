"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EVENTO_MUDOU } from "@/lib/gravacao";
import { ALTURA_TELA, LARGURA_TELA } from "@/lib/layout-gravacao";
import { canal as canalUnico } from "@/lib/supabase/canal";
import { createClient } from "@/lib/supabase/client";
import { gerarNovoLinkGravacao } from "./actions";

// Espera pra juntar os avisos de uma ação que mexe em várias tabelas.
const ESPERA_AVISO = 120;

type Props = {
  mesa: { id: string; nome: string };
  linkObs: string;
  canal: string;
  personagemIds: string[];
  sessaoId: string | null;
  combateId: string | null;
};

export function TelaGravacao({ mesa, linkObs, canal, personagemIds, sessaoId, combateId }: Props) {
  const ligado = useRepasseAoOverlay({ mesaId: mesa.id, canal, personagemIds, sessaoId, combateId });
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
    iniciarTroca(() => gerarNovoLinkGravacao(mesa.id));
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
        <span className={`grv-status ${ligado ? "ligado" : ""}`} title="Com esta aba aberta, o overlay muda na hora">
          <i className="fas fa-circle" /> {ligado ? "Overlay ao vivo" : "Conectando…"}
        </span>
      </header>

      <section className="grv-cartao">
        <h2>
          <i className="fas fa-link" /> Link do OBS
        </h2>
        <div className="grv-link">
          <input type="text" readOnly value={linkObs} onFocus={(e) => e.currentTarget.select()} aria-label="Link do OBS" />
          <button type="button" className="grv-botao primario" onClick={copiar}>
            <i className={`fas ${copiado ? "fa-check" : "fa-copy"}`} /> {copiado ? "Copiado" : "Copiar"}
          </button>
          <button type="button" className="grv-botao" onClick={trocarLink} disabled={trocando}>
            <i className="fas fa-rotate" /> Gerar novo link
          </button>
        </div>
        <p className="grv-dica">
          O link é a chave do overlay: quem tiver ele vê o que aparece na gravação. Se vazar, gere um novo.
        </p>
        <ol className="grv-passos">
          <li>No OBS, em <b>Fontes</b>, clique em <b>+</b> e escolha <b>Navegador</b>.</li>
          <li>Cole o link em <b>URL</b>.</li>
          <li>
            Largura <b>1920</b> e altura <b>1080</b>. O fundo já vem transparente.
          </li>
          <li>Deixe <b>esta aba aberta</b> enquanto grava: é ela que avisa o overlay na hora em que algo muda.</li>
        </ol>
      </section>

      <section className="grv-cartao">
        <h2>
          <i className="fas fa-eye" /> Prévia
        </h2>
        <Previa link={linkObs} />
        <p className="grv-dica">
          É o próprio overlay. Modo, quem aparece e o que mostrar ganham controles aqui na próxima etapa.
        </p>
      </section>
    </div>
  );
}

// O overlay num iframe, encolhido pra largura disponível.
function Previa({ link }: { link: string }) {
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
      <iframe
        src={link}
        title="Prévia do overlay"
        width={LARGURA_TELA}
        height={ALTURA_TELA}
        style={{ transform: `scale(${escala})` }}
      />
    </div>
  );
}

// Escuta as mudanças da mesa (só quem está logado passa pelo RLS) e avisa o
// overlay pelo Broadcast. Sessão ou combate novo: recarrega a página, pra
// passar a escutar o combate certo.
function useRepasseAoOverlay({
  mesaId,
  canal,
  personagemIds,
  sessaoId,
  combateId,
}: {
  mesaId: string;
  canal: string;
  personagemIds: string[];
  sessaoId: string | null;
  combateId: string | null;
}) {
  const router = useRouter();
  const [ligado, setLigado] = useState(false);
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
    const avisarERecarregar = () => {
      avisar();
      router.refresh();
    };

    const mudancas = supabase
      .channel(canalUnico(`gravacao-${mesaId}`))
      .on("postgres_changes", { event: "*", schema: "public", table: "personagens", filter: `mesa_id=eq.${mesaId}` }, avisar)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessoes", filter: `mesa_id=eq.${mesaId}` }, avisarERecarregar);
    if (ids) {
      mudancas.on("postgres_changes", { event: "*", schema: "public", table: "recursos", filter: `personagem_id=in.(${ids})` }, avisar);
    }
    if (sessaoId) {
      mudancas.on("postgres_changes", { event: "*", schema: "public", table: "combates", filter: `sessao_id=eq.${sessaoId}` }, avisarERecarregar);
    }
    if (combateId) {
      mudancas.on("postgres_changes", { event: "*", schema: "public", table: "instancias_combate", filter: `combate_id=eq.${combateId}` }, avisar);
    }
    mudancas.subscribe();

    return () => {
      if (pendente) clearTimeout(pendente);
      supabase.removeChannel(aviso);
      supabase.removeChannel(mudancas);
    };
  }, [mesaId, canal, ids, sessaoId, combateId, router]);

  return ligado;
}
