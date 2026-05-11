ALTER TABLE provider_keys ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE provider_keys ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE provider_keys ADD COLUMN IF NOT EXISTS api_keys JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE provider_keys ADD COLUMN IF NOT EXISTS auth_mode TEXT NOT NULL DEFAULT 'api_key';
ALTER TABLE provider_keys ADD COLUMN IF NOT EXISTS oauth_account_id UUID NULL;
ALTER TABLE provider_keys ADD COLUMN IF NOT EXISTS access_mode TEXT NOT NULL DEFAULT 'round_robin';
ALTER TABLE provider_keys ADD COLUMN IF NOT EXISTS model_detection_enabled BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_provider_keys_oauth_account_id ON provider_keys(oauth_account_id);

UPDATE provider_keys
SET api_keys = jsonb_build_array(api_key)
WHERE COALESCE(api_key, '') <> ''
  AND (api_keys IS NULL OR api_keys = '[]'::jsonb);

UPDATE provider_keys
SET name = provider
WHERE COALESCE(name, '') = '';
