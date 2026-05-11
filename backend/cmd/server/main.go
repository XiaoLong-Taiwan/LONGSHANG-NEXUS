package main

import (
	"crypto/tls"
	"log"
	"net/http"

	"ai-gateway/backend/internal/api"
	"ai-gateway/backend/internal/config"
	"ai-gateway/backend/internal/db"
	"ai-gateway/backend/internal/providers"
	"ai-gateway/backend/internal/router"
	"ai-gateway/backend/internal/services"
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
	modelRouter := services.NewModelRouter(clients.DB)
	usageService := services.NewUsageService(clients.DB)
	monitoring := services.NewMonitoringService(clients.DB)
	modelSync := services.NewModelSyncService(clients.DB, providerManager, keyPool, cfg.DefaultBalanceStrategy)
	handler := api.NewHandler(cfg, clients.DB, providerManager, keyPool, modelRouter, usageService, monitoring, modelSync)

	engine := router.Setup(cfg, clients.DB, clients.Redis, handler)
	address := cfg.Host + ":" + cfg.Port
	server := &http.Server{
		Addr:    address,
		Handler: engine,
		TLSConfig: &tls.Config{
			MinVersion: tls.VersionTLS12,
		},
	}
	if cfg.TLSEnabled {
		log.Printf("ai gateway listening on https://%s", address)
		if err := server.ListenAndServeTLS(cfg.TLSCertFile, cfg.TLSKeyFile); err != nil {
			log.Fatalf("run tls server: %v", err)
		}
		return
	}
	log.Printf("ai gateway listening on http://%s", address)
	if err := server.ListenAndServe(); err != nil {
		log.Fatalf("run server: %v", err)
	}
}
