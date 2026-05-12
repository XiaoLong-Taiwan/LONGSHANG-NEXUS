ALTER TABLE api_keys ALTER COLUMN rate_limit SET DEFAULT 0;

UPDATE api_keys
   SET allowed_models = '[]'::jsonb
 WHERE allowed_models = '["gpt-4o-mini", "claude-3-5-sonnet-latest"]'::jsonb
    OR allowed_models = '["gpt-4o-mini","claude-3-5-sonnet-latest"]'::jsonb;
