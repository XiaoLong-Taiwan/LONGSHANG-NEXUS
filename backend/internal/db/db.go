package db

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"ai-gateway/backend/internal/auth"
	"ai-gateway/backend/internal/config"
	"ai-gateway/backend/internal/models"

	"github.com/redis/go-redis/v9"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type Clients struct {
	DB    *gorm.DB
	Redis *redis.Client
}

func Connect(cfg config.Config) (*Clients, error) {
	database, err := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("connect postgres: %w", err)
	}

	if cfg.DBAutoMigrate {
		if err := database.AutoMigrate(
			&models.User{},
			&models.APIKey{},
			&models.OAuthAccount{},
			&models.ProxyNode{},
			&models.ProviderKey{},
			&models.ModelRegistry{},
			&models.UsageLog{},
			&models.GatewaySetting{},
		); err != nil {
			return nil, fmt.Errorf("migrate database: %w", err)
		}
		if err := ensureOAuthTableCompatibility(database); err != nil {
			return nil, err
		}
		if err := ensureFeatureSchema(database); err != nil {
			return nil, err
		}
	} else {
		if err := ensureOAuthTableCompatibility(database); err != nil {
			return nil, err
		}
		if err := verifySchema(database); err != nil {
			return nil, err
		}
		if err := ensureFeatureSchema(database); err != nil {
			return nil, err
		}
	}

	redisOptions, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	redisClient := redis.NewClient(redisOptions)
	if err := redisClient.Ping(context.Background()).Err(); err != nil {
		return nil, fmt.Errorf("connect redis: %w", err)
	}

	if err := seedAdmin(database, cfg); err != nil {
		return nil, err
	}

	return &Clients{DB: database, Redis: redisClient}, nil
}

func verifySchema(database *gorm.DB) error {
	requiredTables := []string{
		"users",
		"api_keys",
		"oauth_accounts",
		"proxy_nodes",
		"provider_keys",
		"model_registry",
		"usage_logs",
	}

	missing := []string{}
	for _, table := range requiredTables {
		if !database.Migrator().HasTable(table) {
			missing = append(missing, table)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("database schema is missing required tables: %s", strings.Join(missing, ", "))
	}
	return nil
}

func ensureFeatureSchema(database *gorm.DB) error {
	statements := []string{
		`ALTER TABLE provider_keys ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE provider_keys ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE provider_keys ADD COLUMN IF NOT EXISTS api_keys JSONB NOT NULL DEFAULT '[]'::jsonb`,
		`ALTER TABLE provider_keys ADD COLUMN IF NOT EXISTS auth_mode TEXT NOT NULL DEFAULT 'api_key'`,
		`ALTER TABLE provider_keys ADD COLUMN IF NOT EXISTS oauth_account_id UUID NULL`,
		`DO $$
		BEGIN
		  IF EXISTS (
		    SELECT 1
		    FROM information_schema.columns
		    WHERE table_name = 'provider_keys' AND column_name = 'o_auth_account_id'
		  ) THEN
		    UPDATE provider_keys
		       SET oauth_account_id = COALESCE(oauth_account_id, o_auth_account_id)
		     WHERE o_auth_account_id IS NOT NULL;
		  END IF;
		END $$`,
		`ALTER TABLE provider_keys ADD COLUMN IF NOT EXISTS access_mode TEXT NOT NULL DEFAULT 'round_robin'`,
		`ALTER TABLE provider_keys ADD COLUMN IF NOT EXISTS model_detection_enabled BOOLEAN NOT NULL DEFAULT true`,
		`ALTER TABLE provider_keys ADD COLUMN IF NOT EXISTS model_overrides JSONB NOT NULL DEFAULT '[]'::jsonb`,
		`ALTER TABLE provider_keys ADD COLUMN IF NOT EXISTS test_model TEXT NOT NULL DEFAULT ''`,
		`CREATE INDEX IF NOT EXISTS idx_provider_keys_oauth_account_id ON provider_keys(oauth_account_id)`,
		`ALTER TABLE oauth_accounts ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE oauth_accounts ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE oauth_accounts ADD COLUMN IF NOT EXISTS provider_account_id TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE oauth_accounts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`,
		`ALTER TABLE oauth_accounts ADD COLUMN IF NOT EXISTS quota_used DOUBLE PRECISION NOT NULL DEFAULT 0`,
		`ALTER TABLE oauth_accounts ADD COLUMN IF NOT EXISTS quota_total DOUBLE PRECISION NOT NULL DEFAULT 0`,
		`ALTER TABLE oauth_accounts ADD COLUMN IF NOT EXISTS quota_unit TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE oauth_accounts ADD COLUMN IF NOT EXISTS last_quota_check TIMESTAMPTZ NULL`,
		`ALTER TABLE oauth_accounts ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE oauth_accounts ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb`,
		`CREATE TABLE IF NOT EXISTS gateway_settings (
		  key TEXT PRIMARY KEY,
		  value JSONB NOT NULL DEFAULT '{}'::jsonb,
		  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`UPDATE provider_keys
		   SET api_keys = jsonb_build_array(api_key)
		 WHERE COALESCE(api_key, '') <> ''
		   AND (api_keys IS NULL OR api_keys = '[]'::jsonb)`,
		`UPDATE provider_keys
		   SET name = provider
		 WHERE COALESCE(name, '') = ''`,
		`ALTER TABLE api_keys ALTER COLUMN rate_limit SET DEFAULT 0`,
		`UPDATE api_keys
		    SET allowed_models = '[]'::jsonb
		  WHERE allowed_models = '["gpt-4o-mini", "claude-3-5-sonnet-latest"]'::jsonb
		     OR allowed_models = '["gpt-4o-mini","claude-3-5-sonnet-latest"]'::jsonb`,
	}

	for _, statement := range statements {
		if err := database.Exec(statement).Error; err != nil {
			return fmt.Errorf("ensure feature schema: %w", err)
		}
	}
	return nil
}

func ensureOAuthTableCompatibility(database *gorm.DB) error {
	statements := []string{
		`DO $$
		BEGIN
		  IF to_regclass('public.o_auth_accounts') IS NOT NULL
		     AND to_regclass('public.oauth_accounts') IS NULL THEN
		    ALTER TABLE o_auth_accounts RENAME TO oauth_accounts;
		  END IF;
		END $$`,
		`DO $$
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
		END $$`,
	}
	for _, statement := range statements {
		if err := database.Exec(statement).Error; err != nil {
			return fmt.Errorf("ensure oauth table compatibility: %w", err)
		}
	}
	return nil
}

func seedAdmin(database *gorm.DB, cfg config.Config) error {
	hash, err := auth.HashPassword(cfg.AdminPassword)
	if err != nil {
		return err
	}

	var admin models.User
	err = database.Where("email = ?", cfg.AdminEmail).First(&admin).Error
	if err == nil {
		updates := map[string]any{
			"role":          "admin",
			"password_hash": hash,
		}
		return database.Model(&admin).Updates(updates).Error
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	admin = models.User{
		Email:        cfg.AdminEmail,
		PasswordHash: hash,
		Role:         "admin",
	}
	return database.Create(&admin).Error
}
