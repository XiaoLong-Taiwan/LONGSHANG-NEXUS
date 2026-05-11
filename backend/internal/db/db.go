package db

import (
	"context"
	"fmt"

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

func seedAdmin(database *gorm.DB, cfg config.Config) error {
	var count int64
	if err := database.Model(&models.User{}).Where("email = ?", cfg.AdminEmail).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	hash, err := auth.HashPassword(cfg.AdminPassword)
	if err != nil {
		return err
	}
	admin := models.User{
		Email:        cfg.AdminEmail,
		PasswordHash: hash,
		Role:         "admin",
	}
	return database.Create(&admin).Error
}
