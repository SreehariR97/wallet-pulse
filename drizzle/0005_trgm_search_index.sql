-- pg_trgm + GIN trigram indexes for fast ILIKE '%...%' on transactions.
--
-- Wrapped in DO...EXCEPTION blocks so the migration is a no-op where the
-- extension is unavailable (notably PGlite, used in tests). Real Postgres
-- (Neon, docker-compose) ships pg_trgm and creates the indexes normally.
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_trgm unavailable; skipping trigram indexes';
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS tx_desc_trgm ON transactions USING gin (description gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_trgm operator class unavailable; skipping tx_desc_trgm';
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS tx_notes_trgm ON transactions USING gin (notes gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_trgm operator class unavailable; skipping tx_notes_trgm';
END $$;
