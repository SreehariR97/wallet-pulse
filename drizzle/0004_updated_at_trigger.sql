CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON "users";--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON "categories";--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "categories"
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON "transactions";--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "transactions"
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON "budgets";--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "budgets"
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON "credit_cards";--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "credit_cards"
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON "remittances";--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "remittances"
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();