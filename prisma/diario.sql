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


-- Etapa 1 dos quadros de investigação. Só adiciona (tabelas e índices novos).
-- Quadro: um da mesa (tipo 'mesa', público, sem dono) e os pessoais (tipo 'pessoal', com dono).
create table if not exists public.diario_quadros (
  id            text primary key,
  mesa_id       text not null references public.mesas(id) on delete cascade,
  tipo          text not null default 'pessoal',
  dono_id       text,
  nome          text not null,
  -- Imagem de fundo: o quadro vira mapa (as páginas de Local viram alfinetes).
  fundo_url     text,
  fundo_largura integer,
  fundo_altura  integer,
  criado_em     timestamp(3) not null default current_timestamp,
  atualizado_em timestamp(3) not null default current_timestamp
);
create index if not exists diario_quadros_mesa_id_dono_id_idx on public.diario_quadros (mesa_id, dono_id);
-- Um quadro da mesa por mesa (o Prisma não declara índice único parcial; vale só aqui).
create unique index if not exists diario_quadros_um_da_mesa_key on public.diario_quadros (mesa_id) where tipo = 'mesa';

-- Compartilhar um quadro pessoal com uma pessoa: 'ver' ou 'editar'.
create table if not exists public.diario_quadro_acessos (
  quadro_id text not null references public.diario_quadros(id) on delete cascade,
  user_id   text not null,
  nivel     text not null default 'ver',
  criado_em timestamp(3) not null default current_timestamp,
  primary key (quadro_id, user_id)
);
create index if not exists diario_quadro_acessos_user_id_idx on public.diario_quadro_acessos (user_id);

-- Cartão. tipo: postit | pagina | nota | sessao | imagem | moldura | texto.
-- ref_id aponta para a ficha, a nota ou a sessão (sem FK: a referência pode sumir e o cartão avisa).
-- apagado_em preenchido = está na lixeira (some de vez depois de alguns dias).
create table if not exists public.diario_cartoes (
  id                 text primary key,
  quadro_id          text not null references public.diario_quadros(id) on delete cascade,
  autor_id           text not null,
  tipo               text not null,
  formato            text not null default 'cartao',
  x                  double precision not null default 0,
  y                  double precision not null default 0,
  largura            double precision not null default 200,
  altura             double precision not null default 120,
  z                  integer not null default 0,
  cor                text not null default 'amarelo',
  texto              text not null default '',
  ref_id             text,
  url                text,
  sessao_id          text references public.sessoes(id) on delete set null,
  oculto             boolean not null default false,
  revelado_sessao_id text,
  revelado_em        timestamp(3),
  apagado_em         timestamp(3),
  apagado_por        text,
  criado_em          timestamp(3) not null default current_timestamp,
  atualizado_em      timestamp(3) not null default current_timestamp
);
create index if not exists diario_cartoes_quadro_id_apagado_em_idx on public.diario_cartoes (quadro_id, apagado_em);
create index if not exists diario_cartoes_ref_id_idx on public.diario_cartoes (ref_id);
create index if not exists diario_cartoes_sessao_id_idx on public.diario_cartoes (sessao_id);

-- Ligação (barbante) entre dois cartões do mesmo quadro.
create table if not exists public.diario_ligacoes (
  id                 text primary key,
  quadro_id          text not null references public.diario_quadros(id) on delete cascade,
  de_id              text not null references public.diario_cartoes(id) on delete cascade,
  para_id            text not null references public.diario_cartoes(id) on delete cascade,
  autor_id           text not null,
  rotulo             text not null default '',
  cor                text not null default 'cinza',
  traco              text not null default 'continuo',
  seta               boolean not null default false,
  oculto             boolean not null default false,
  revelado_sessao_id text,
  revelado_em        timestamp(3),
  apagado_em         timestamp(3),
  criado_em          timestamp(3) not null default current_timestamp,
  atualizado_em      timestamp(3) not null default current_timestamp
);
create index if not exists diario_ligacoes_quadro_id_apagado_em_idx on public.diario_ligacoes (quadro_id, apagado_em);
create index if not exists diario_ligacoes_de_id_idx on public.diario_ligacoes (de_id);
create index if not exists diario_ligacoes_para_id_idx on public.diario_ligacoes (para_id);


-- Formatação do texto dos cartões do quadro (tamanho, alinhamento, cor e negrito). Só adiciona colunas.
-- fonte_tamanho nulo = o tamanho padrão do tipo de cartão.
alter table public.diario_cartoes add column if not exists fonte_tamanho integer;
alter table public.diario_cartoes add column if not exists alinhamento text not null default 'esquerda';
alter table public.diario_cartoes add column if not exists cor_texto text not null default 'padrao';
alter table public.diario_cartoes add column if not exists negrito boolean not null default false;
