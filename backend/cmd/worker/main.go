package main

import (
	"context"
	"log"

	"ai-gateway/backend/internal/config"
	"ai-gateway/backend/internal/db"
	"ai-gateway/backend/internal/providers"
	"ai-gateway/backend/internal/services"
	"ai-gateway/backend/internal/workers"
)

func main() {
	cfg := config.Load()
	clients, err := db.Connect(cfg)
	if err != nil {
		log.Fatalf("bootstrap database: %v", err)
	}

	providerManager := providers.NewManager(
		providers.NewOpenAIProvider(cfg.OpenAIBaseURL, cfg.RequestTimeout),
		providers.NewAnthropicProvider(cfg.RequestTimeout),
		providers.NewGeminiProvider(cfg.RequestTimeout),
	)
	keyPool := services.NewProviderKeyPool(clients.DB, clients.Redis)
	syncer := services.NewModelSyncService(clients.DB, providerManager, keyPool, cfg.DefaultBalanceStrategy)

	workers.StartModelSyncLoop(context.Background(), cfg.ModelSyncInterval, syncer)
}
