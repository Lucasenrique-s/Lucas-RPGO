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
