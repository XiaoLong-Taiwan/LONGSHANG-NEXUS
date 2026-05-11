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
		); err != nil {
			return nil, fmt.Errorf("migrate database: %w", err)
		}
	} else {
		if err := verifySchema(database); err != nil {
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
