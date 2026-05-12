CREATE TABLE IF NOT EXISTS model_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_model TEXT NOT NULL,
  provider TEXT NOT NULL,
  upstream_model TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'chat',
  provider_key_id UUID NULL REFERENCES provider_keys(id) ON DELETE SET NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_mappings_public_model ON model_mappings(public_model);
CREATE INDEX IF NOT EXISTS idx_model_mappings_provider ON model_mappings(provider);
CREATE INDEX IF NOT EXISTS idx_model_mappings_status ON model_mappings(status);
CREATE INDEX IF NOT EXISTS idx_model_mappings_provider_key_id ON model_mappings(provider_key_id);
