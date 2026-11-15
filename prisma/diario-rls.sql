-- Diário de bordo: fecha as tabelas pra API pública do Supabase.
--
-- O diário guarda notas privadas. O app lê e grava pelo Prisma (conexão direta
-- do servidor, que ignora RLS) e checa a permissão em lib/diario.ts. Com RLS
-- ligado e nenhuma política, a chave pública (anon) do navegador não lê nada.
-- NÃO adicionar estas tabelas à publicação do Realtime.
--
-- Rodar depois do `npx prisma db push`:
--   npx prisma db execute --file prisma/diario-rls.sql
-- Rodar de novo não muda nada.

alter table public.diario_fichas  enable row level security;
alter table public.diario_notas   enable row level security;
alter table public.diario_mencoes enable row level security;

alter table public.diario_retratos  enable row level security;
alter table public.diario_relacoes  enable row level security;
alter table public.diario_marcos    enable row level security;

alter table public.diario_wiki_notas    enable row level security;
alter table public.diario_ficha_versoes enable row level security;

-- Quadros de investigação: mesmo esquema (RLS ligado, sem políticas, fora do Realtime).
alter table public.diario_quadros         enable row level security;
alter table public.diario_quadro_acessos  enable row level security;
alter table public.diario_cartoes         enable row level security;
alter table public.diario_ligacoes        enable row level security;

-- Cor da capa do caderno de cada jogador.
alter table public.diario_cadernos enable row level security;
