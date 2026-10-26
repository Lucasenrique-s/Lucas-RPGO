-- Gravação com OBS (docs/plano-gravacao-obs.md, Fase 0): configuração do
-- overlay por mesa e vínculo pessoa do Discord ↔ personagem. Só cria tabelas
-- novas; não mexe em nada que existe.
--   npx prisma db execute --file prisma/gravacao.sql
-- NÃO usar `prisma db push` neste banco (ver acoes-ordem.sql).
-- Rodar de novo não muda nada.

CREATE TABLE IF NOT EXISTS configs_gravacao (
  id            TEXT PRIMARY KEY,
  mesa_id       TEXT NOT NULL UNIQUE REFERENCES mesas (id) ON DELETE CASCADE,
  token         TEXT NOT NULL UNIQUE,
  config        JSONB NOT NULL DEFAULT '{}',
  atualizado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vinculos_discord (
  id              TEXT PRIMARY KEY,
  mesa_id         TEXT NOT NULL REFERENCES mesas (id) ON DELETE CASCADE,
  discord_user_id TEXT NOT NULL,
  personagem_id   TEXT,
  papel           TEXT NOT NULL DEFAULT 'jogador',
  apelido         TEXT NOT NULL DEFAULT '',
  avatar_url      TEXT,
  UNIQUE (mesa_id, discord_user_id)
);
