import type { CSSProperties } from "react";
import type { EfeitoCor } from "@/lib/estilos-cor";
import { estiloAplicado } from "@/lib/estilos-cor";
import type { ExibirBarra, MostrarGravacao } from "@/lib/gravacao";
import type { FormatoCard } from "@/lib/layout-gravacao";

// O que um card do overlay mostra, já resolvido (sem Prisma nem config).
export type DadosCardGravacao = {
  id: string;
  nome: string;
  imagemUrl: string | null;
  // O narrador não tem barras nem condições.
  narrador?: boolean;
  pv?: { atual: number; max: number; temp: number };
  pp?: { atual: number; max: number };
  // Só os recursos escolhidos pro card, na ordem da ficha.
  recursos: { id: string; nome: string; atual: number; max: number; cor: string | null; cor2: string | null; efeito: EfeitoCor }[];
  condicoes: { nome: string; cor: string; cor2: string | null; efeito: EfeitoCor }[];
  falando: boolean;
};

type Props = {
  dados: DadosCardGravacao;
  mostrar: MostrarGravacao;
  formato: FormatoCard;
  destaque: boolean;
  // É a vez dele no combate.
  vez?: boolean;
};

export function CardGravacao({ dados, mostrar, formato, destaque, vez = false }: Props) {
  const classes = [
    "gv-card",
    `gv-card-${formato}`,
    destaque && "gv-card-destaque",
    vez && "gv-card-vez",
    mostrar.fala && dados.falando && "gv-card-falando",
  ].filter(Boolean).join(" ");

  const comRecursos = mostrar.recursos && dados.recursos.length > 0;
  const comCondicoes = mostrar.condicoes && dados.condicoes.length > 0;
  const temBarras = !dados.narrador && (
    (dados.pv && mostrar.pv !== "oculto") || (dados.pp && mostrar.pp !== "oculto") || comRecursos
  );

  return (
    <div className={classes}>
      <div className="gv-card-imagem">
        {vez && (
          <span className="gv-card-selo-vez">
            <i className="fas fa-play" /> Vez
          </span>
        )}
        {dados.imagemUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL externa (storage), sem otimização do Next
          <img src={dados.imagemUrl} alt="" draggable={false} />
        ) : (
          <div className="gv-card-sem-imagem">
            <i className={`fas ${dados.narrador ? "fa-book-open" : "fa-user"}`} />
          </div>
        )}
        {!dados.narrador && comCondicoes && (
          <div className="gv-card-condicoes">
            {dados.condicoes.map((c) => {
              const { className, style } = estiloAplicado(c, "chip");
              return (
                <span key={c.nome} className={`gv-condicao ${className}`} style={style}>
                  <span className="fx-texto">{c.nome}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {(mostrar.nome || temBarras) && (
        <div className="gv-card-rodape">
          {mostrar.nome && <div className="gv-card-nome">{dados.nome}</div>}
          {!dados.narrador && dados.pv && mostrar.pv !== "oculto" && (
            <Barra
              icone="fa-heart"
              atual={dados.pv.atual}
              max={dados.pv.max}
              temp={dados.pv.temp}
              exibir={mostrar.pv}
              estiloFio={{ background: "var(--bar-hp, #d32f2f)" }}
            />
          )}
          {!dados.narrador && dados.pp && mostrar.pp !== "oculto" && (
            <Barra
              icone="fa-bolt"
              atual={dados.pp.atual}
              max={dados.pp.max}
              exibir={mostrar.pp}
              estiloFio={{ background: "var(--bar-pp, #1976d2)" }}
            />
          )}
          {!dados.narrador && comRecursos && dados.recursos.map((r) => {
            const { className, style } = estiloAplicado(r, "barra");
            return (
              <Barra
                key={r.id}
                rotulo={r.nome}
                atual={r.atual}
                max={r.max}
                // Recurso vai sempre com número: é pequeno e o nome já ocupa a linha.
                exibir="numero"
                classeFio={className}
                estiloFio={style ?? { background: "var(--bar-recurso, #e67e22)" }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function Barra({
  icone,
  rotulo,
  atual,
  max,
  temp = 0,
  exibir,
  classeFio = "",
  estiloFio,
}: {
  icone?: string;
  rotulo?: string;
  atual: number;
  max: number;
  temp?: number;
  exibir: ExibirBarra;
  classeFio?: string;
  estiloFio?: CSSProperties;
}) {
  // Mesmo denominador da barra da ficha: o temporário cabe junto do atual.
  const total = Math.max(max, atual + temp, 1);
  const pct = (Math.max(0, atual) / total) * 100;
  const pctTemp = (Math.max(0, temp) / total) * 100;
  return (
    <div className={`gv-barra${rotulo ? " gv-barra-recurso" : ""}`}>
      {(icone || rotulo) && (
        <span className="gv-barra-rotulo">
          {icone ? <i className={`fas ${icone}`} /> : rotulo}
        </span>
      )}
      <div className="gv-barra-trilho">
        <div className={`gv-barra-fio ${classeFio}`} style={{ ...estiloFio, width: `${pct}%` }} />
        {pctTemp > 0 && <div className="gv-barra-fio-temp" style={{ left: `${pct}%`, width: `${pctTemp}%` }} />}
      </div>
      {exibir === "numero" && (
        <span className="gv-barra-numero">
          {atual}
          {temp > 0 && <span className="gv-barra-temp">+{temp}</span>}
          <span className="gv-barra-max">/{max}</span>
        </span>
      )}
    </div>
  );
}
