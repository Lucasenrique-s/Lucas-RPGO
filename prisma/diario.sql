-- Diário de bordo: só ADICIONA (tabelas e colunas novas). Não apaga nada.
-- Equivale ao que o schema.prisma declara para o diário; serve quando o
-- `prisma db push` não pode ser usado (o banco tem tabelas de outras branches).
--   npx prisma db execute --file prisma/diario.sql
--   npx prisma db execute --file prisma/diario-rls.sql
-- Rodar de novo não muda nada.

alter table public.sessoes add column if not exists numero integer;
alter table public.sessoes add column if not exists titulo text;

create table if not exists public.diario_fichas (
  id            text primary key,
  mesa_id       text not null references public.mesas(id) on delete cascade,
  autor_id      text not null,
  tipo          text not null,
  nome          text not null,
  apelidos      text[] not null default '{}',
  retrato_url   text,
  campos        jsonb not null default '{}',
  resumo        text not null default '',
  visibilidade  text not null default 'privada',
  editores      text[] not null default '{}',
  criada_em     timestamp(3) not null default current_timestamp,
  atualizada_em timestamp(3) not null default current_timestamp
);
create index if not exists diario_fichas_mesa_id_visibilidade_idx on public.diario_fichas (mesa_id, visibilidade);
create index if not exists diario_fichas_mesa_id_autor_id_idx on public.diario_fichas (mesa_id, autor_id);

create table if not exists public.diario_notas (
  id            text primary key,
  mesa_id       text not null references public.mesas(id) on delete cascade,
  autor_id      text not null,
  sessao_id     text references public.sessoes(id) on delete set null,
  dia_jogo      integer,
  corpo         text not null,
  tags          text[] not null default '{}',
  importante    boolean not null default false,
  visibilidade  text not null default 'privada',
  criada_em     timestamp(3) not null default current_timestamp,
  atualizada_em timestamp(3) not null default current_timestamp
);
create index if not exists diario_notas_mesa_id_sessao_id_idx on public.diario_notas (mesa_id, sessao_id);
create index if not exists diario_notas_mesa_id_autor_id_idx on public.diario_notas (mesa_id, autor_id);

-- Título opcional da anotação (banco criado antes dele).
alter table public.diario_notas add column if not exists titulo text;

create table if not exists public.diario_mencoes (
  origem_tipo text not null,
  origem_id   text not null,
  alvo_tipo   text not null,
  alvo_id     text not null,
  primary key (origem_tipo, origem_id, alvo_tipo, alvo_id)
);
create index if not exists diario_mencoes_alvo_tipo_alvo_id_idx on public.diario_mencoes (alvo_tipo, alvo_id);


-- Etapa 1 da nova abordagem: vários retratos, relações e marcos pessoais.
create table if not exists public.diario_retratos (
  id        text primary key,
  ficha_id  text not null references public.diario_fichas(id) on delete cascade,
  url       text not null,
  legenda   text not null default '',
  ordem     integer not null default 0,
  criado_em timestamp(3) not null default current_timestamp
);
create index if not exists diario_retratos_ficha_id_ordem_idx on public.diario_retratos (ficha_id, ordem);

create table if not exists public.diario_relacoes (
  id        text primary key,
  mesa_id   text not null,
  de_id     text not null,
  verbo     text not null,
  para_id   text not null,
  criada_em timestamp(3) not null default current_timestamp
);
create index if not exists diario_relacoes_mesa_id_de_id_idx on public.diario_relacoes (mesa_id, de_id);
create index if not exists diario_relacoes_para_id_idx on public.diario_relacoes (para_id);

create table if not exists public.diario_marcos (
  id        text primary key,
  mesa_id   text not null,
  autor_id  text not null,
  nome      text not null,
  criado_em timestamp(3) not null default current_timestamp
);
create index if not exists diario_marcos_mesa_id_autor_id_idx on public.diario_marcos (mesa_id, autor_id);


-- Etapa 3: wiki da mesa. Só adiciona.
-- Página revelada pelo narrador: em que sessão e quando.
alter table public.diario_fichas add column if not exists revelada_sessao_id text;
alter table public.diario_fichas add column if not exists revelada_em timestamp(3);

-- "Anotações da mesa": quais anotações do autor aparecem na página pública.
create table if not exists public.diario_wiki_notas (
  ficha_id text not null references public.diario_fichas(id) on delete cascade,
  nota_id  text not null references public.diario_notas(id) on delete cascade,
  primary key (ficha_id, nota_id)
);
create index if not exists diario_wiki_notas_nota_id_idx on public.diario_wiki_notas (nota_id);

-- Histórico de edições das páginas públicas (cada linha é o estado ANTES de uma edição).
create table if not exists public.diario_ficha_versoes (
  id        text primary key,
  ficha_id  text not null references public.diario_fichas(id) on delete cascade,
  editor_id text not null,
  nome      text not null,
  apelidos  text[] not null default '{}',
  campos    jsonb not null default '{}',
  resumo    text not null default '',
  criada_em timestamp(3) not null default current_timestamp
);
create index if not exists diario_ficha_versoes_ficha_id_criada_em_idx on public.diario_ficha_versoes (ficha_id, criada_em);


-- A página de cada personagem de jogador nasce sozinha na wiki; este campo liga uma à outra.
alter table public.diario_fichas add column if not exists personagem_id text;
create unique index if not exists diario_fichas_personagem_id_key on public.diario_fichas (personagem_id);
