DO $$
BEGIN
  IF to_regclass('public.o_auth_accounts') IS NOT NULL
     AND to_regclass('public.oauth_accounts') IS NULL THEN
    ALTER TABLE o_auth_accounts RENAME TO oauth_accounts;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.o_auth_accounts') IS NOT NULL
     AND to_regclass('public.oauth_accounts') IS NOT NULL THEN
    INSERT INTO oauth_accounts (
      id, provider, user_id, access_token, refresh_token, proxy_id, created_at, updated_at
    )
    SELECT id, provider, user_id, access_token, refresh_token, proxy_id, created_at, updated_at
      FROM o_auth_accounts
     WHERE NOT EXISTS (
       SELECT 1 FROM oauth_accounts WHERE oauth_accounts.id = o_auth_accounts.id
     );
  END IF;
END $$;
