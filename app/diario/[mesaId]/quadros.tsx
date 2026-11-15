"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { exigir } from "@/lib/acoes";
import { LIMITES_QUADRO, type QuadroResumoDTO } from "@/lib/diario-quadro-tipos";
import { apagarQuadroDiario, criarQuadroDiario } from "./quadros-actions";
import { avisar, confirmar } from "./diario-partes";
import "./quadros.css";

const quando = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

const contagem = (n: number) => (n === 0 ? "vazio" : `${n} ${n === 1 ? "cartão" : "cartões"}`);

// Terceira área do diário: a lista de quadros. Abrir um quadro leva à tela cheia (rota própria).
export function Quadros({
  mesaId,
  meuId,
  quadros,
  autores,
  somenteLeitura,
}: {
  mesaId: string;
  meuId: string;
  quadros: QuadroResumoDTO[];
  autores: Record<string, string>;
  somenteLeitura: boolean;
}) {
  const router = useRouter();
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const daMesa = quadros.find((q) => q.papel === "mesa") ?? null;
  const meus = quadros.filter((q) => q.papel === "dono");
  const compartilhados = quadros.filter((q) => q.papel === "compartilhado");
  const deOutros = quadros.filter((q) => q.papel === "narrador");
  const nomeDe = (id: string | null) => (id === meuId ? "Você" : id ? (autores[id] ?? "Jogador") : "");

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (ocupado) return;
    setOcupado(true);
    try {
      const r = exigir(await criarQuadroDiario(mesaId, nome));
      router.push(`/diario/${mesaId}/quadros/${r.id}`);
    } catch (err) {
      avisar(err instanceof Error ? err.message : "Falha ao criar o quadro.");
      setOcupado(false);
    }
  }

  async function apagar(q: QuadroResumoDTO) {
    if (!(await confirmar(`Apagar o quadro “${q.nome}”? Os cartões e ligações dele também somem.`))) return;
    try {
      exigir(await apagarQuadroDiario(mesaId, q.id));
      router.refresh();
    } catch (err) {
      avisar(err instanceof Error ? err.message : "Falha ao apagar o quadro.");
    }
  }

  function cartao(q: QuadroResumoDTO) {
    return (
      <div key={q.id} className="qd-cartao">
        <Link href={`/diario/${mesaId}/quadros/${q.id}`} className="qd-cartao-link">
          <span className="qd-cartao-previa" aria-hidden>
            {q.fundoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={q.fundoUrl} alt="" loading="lazy" />
            ) : (
              <i className="fas fa-diagram-project" />
            )}
          </span>
          <span className="qd-cartao-corpo">
            <span className="qd-cartao-nome">{q.nome}</span>
            <span className="qd-cartao-meta">
              {q.papel === "compartilhado" || q.papel === "narrador" ? `de ${nomeDe(q.donoId)} · ` : ""}
              {contagem(q.cartoes)} · {quando(q.atualizadoEm)}
            </span>
            <span className="qd-cartao-selos">
              {q.papel === "dono" && (
                <span title="Só você, o narrador e quem você compartilhar leem">
                  <i className="fas fa-lock" /> Particular
                </span>
              )}
              {q.papel === "compartilhado" && (
                <span>
                  <i className="fas fa-user-group" /> {q.nivel === "editar" ? "Você edita" : "Você vê"}
                </span>
              )}
              {q.papel === "narrador" && (
                <span>
                  <i className="fas fa-eye" /> Só leitura
                </span>
              )}
            </span>
          </span>
        </Link>
        {q.permissoes.apagar && !somenteLeitura && (
          <button type="button" className="qd-cartao-apagar" title="Apagar quadro" aria-label={`Apagar o quadro ${q.nome}`} onClick={() => void apagar(q)}>
            <i className="fas fa-trash" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="qd">
      <div className="qd-topo">
        <div>
          <span className="qd-kicker">Quadros de investigação</span>
          <p className="qd-sub">Pistas, pessoas e lugares ligados por barbantes. O quadro da mesa é de todos; os seus são particulares.</p>
        </div>
        {!somenteLeitura && (
          <button type="button" className="diario-btn diario-btn--primario" onClick={() => setCriando((v) => !v)} aria-expanded={criando}>
            <i className="fas fa-plus" /> Novo quadro
          </button>
        )}
      </div>

      {criando && (
        <form className="qd-novo" onSubmit={(e) => void criar(e)}>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={LIMITES_QUADRO.nome}
            placeholder="Nome do quadro (ex.: Quem matou o capitão?)"
            aria-label="Nome do quadro"
            autoFocus
          />
          <button type="submit" className="diario-btn diario-btn--primario" disabled={ocupado || !nome.trim()}>
            Criar e abrir
          </button>
          <button type="button" className="diario-btn" onClick={() => setCriando(false)}>
            Cancelar
          </button>
        </form>
      )}

      {daMesa && (
        <Link href={`/diario/${mesaId}/quadros/${daMesa.id}`} className="qd-mesa">
          <span className="qd-mesa-icone" aria-hidden>
            <i className="fas fa-diagram-project" />
          </span>
          <span className="qd-mesa-corpo">
            <span className="qd-mesa-nome">{daMesa.nome}</span>
            <span className="qd-mesa-desc">
              <i className="fas fa-earth-americas" /> Público: a mesa inteira vê, cria, move e apaga. {contagem(daMesa.cartoes)}.
            </span>
          </span>
          <i className="fas fa-chevron-right qd-mesa-seta" aria-hidden />
        </Link>
      )}

      <section className="qd-secao">
        <h2>Meus quadros</h2>
        {meus.length === 0 ? (
          <p className="qd-vazio">Você ainda não tem quadros. Crie um para testar teorias antes de levar à mesa.</p>
        ) : (
          <div className="qd-grade">{meus.map(cartao)}</div>
        )}
        <p className="qd-aviso">
          <i className="fas fa-eye" /> O narrador também pode ler os seus quadros.
        </p>
      </section>

      {compartilhados.length > 0 && (
        <section className="qd-secao">
          <h2>Compartilhados comigo</h2>
          <div className="qd-grade">{compartilhados.map(cartao)}</div>
        </section>
      )}

      {deOutros.length > 0 && (
        <section className="qd-secao">
          <h2>Quadros dos jogadores</h2>
          <div className="qd-grade">{deOutros.map(cartao)}</div>
        </section>
      )}
    </div>
  );
}
