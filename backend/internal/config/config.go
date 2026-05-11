package config

import (
	"log"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	AppEnv                string
	Port                  string
	DatabaseURL           string
	DBAutoMigrate         bool
	RedisURL              string
	JWTSecret             string
	FrontendURL           string
	AdminEmail            string
	AdminPassword         string
	GoogleClientID        string
	GoogleClientSecret    string
	GitHubClientID        string
	GitHubClientSecret    string
	OAuthRedirectBaseURL  string
	DefaultBalanceStrategy string
	RequestTimeout        time.Duration
	ModelSyncInterval     time.Duration
	OpenAIBaseURL         string
}

func Load() Config {
	_ = godotenv.Load("../.env")
	_ = godotenv.Load(".env")

	cfg := Config{
		AppEnv:                getEnv("APP_ENV", "development"),
		Port:                  getEnv("PORT", "8080"),
		DatabaseURL:           getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/ai_gateway?sslmode=disable"),
		DBAutoMigrate:         getBool("DB_AUTO_MIGRATE", false),
		RedisURL:              getEnv("REDIS_URL", "redis://localhost:6379/0"),
		JWTSecret:             getEnv("JWT_SECRET", "change-me"),
		FrontendURL:           getEnv("FRONTEND_URL", "http://localhost:8080"),
		AdminEmail:            getEnv("ADMIN_EMAIL", "admin@example.com"),
		AdminPassword:         getEnv("ADMIN_PASSWORD", "admin123456"),
		GoogleClientID:        getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret:    getEnv("GOOGLE_CLIENT_SECRET", ""),
		GitHubClientID:        getEnv("GITHUB_CLIENT_ID", ""),
		GitHubClientSecret:    getEnv("GITHUB_CLIENT_SECRET", ""),
		OAuthRedirectBaseURL:  getEnv("OAUTH_REDIRECT_BASE_URL", "http://localhost:8080"),
		DefaultBalanceStrategy: getEnv("DEFAULT_BALANCE_STRATEGY", "priority"),
		RequestTimeout:        getSeconds("REQUEST_TIMEOUT_SECONDS", 120),
		ModelSyncInterval:     getSeconds("MODEL_SYNC_INTERVAL_SECONDS", 900),
		OpenAIBaseURL:         getEnv("OPENAI_BASE_URL", "https://api.openai.com"),
	}

	if cfg.JWTSecret == "change-me" && cfg.AppEnv == "production" {
		log.Println("warning: JWT_SECRET is using the default value")
	}

	return cfg
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func getSeconds(key string, fallback int) time.Duration {
	raw := getEnv(key, "")
	if raw == "" {
		return time.Duration(fallback) * time.Second
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil {
		return time.Duration(fallback) * time.Second
	}
	return time.Duration(parsed) * time.Second
}

func getBool(key string, fallback bool) bool {
	raw := getEnv(key, "")
	if raw == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(raw)
	if err != nil {
		return fallback
	}
	return parsed
}
