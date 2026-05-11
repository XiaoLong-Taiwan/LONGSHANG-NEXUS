package router

import (
	"ai-gateway/backend/internal/api"
	"ai-gateway/backend/internal/config"
	"ai-gateway/backend/internal/middleware"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

func Setup(cfg config.Config, db *gorm.DB, redis *redis.Client, handler *api.Handler) *gin.Engine {
	engine := gin.Default()
	engine.Use(cors.New(cors.Config{
		AllowOrigins:     []string{cfg.FrontendURL, "http://localhost:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	engine.GET("/health", handler.Health)

	authGroup := engine.Group("/api/auth")
	{
		authGroup.POST("/register", handler.Register)
		authGroup.POST("/login", handler.Login)
		authGroup.GET("/oauth/:provider/login", handler.OAuthLogin)
		authGroup.GET("/oauth/:provider/callback", handler.OAuthCallback)
	}

	admin := engine.Group("/api/admin")
	admin.Use(middleware.JWTAuth(cfg, db), middleware.AdminOnly())
	{
		admin.GET("/users", handler.ListUsers)
		admin.POST("/users", handler.CreateUser)
		admin.DELETE("/users/:id", handler.DeleteUser)

		admin.GET("/api-keys", handler.ListAPIKeys)
		admin.POST("/api-keys", handler.CreateAPIKey)
		admin.POST("/api-keys/:id/rotate", handler.RotateAPIKey)
		admin.POST("/api-keys/:id/disable", handler.DisableAPIKey)
		admin.DELETE("/api-keys/:id", handler.DeleteAPIKey)

		admin.GET("/provider-keys", handler.ListProviderKeys)
		admin.POST("/provider-keys", handler.UpsertProviderKey)
		admin.PUT("/provider-keys/:id", handler.UpsertProviderKey)
		admin.DELETE("/provider-keys/:id", handler.DeleteProviderKey)

		admin.GET("/proxy-nodes", handler.ListProxyNodes)
		admin.POST("/proxy-nodes", handler.UpsertProxyNode)
		admin.PUT("/proxy-nodes/:id", handler.UpsertProxyNode)
		admin.DELETE("/proxy-nodes/:id", handler.DeleteProxyNode)

		admin.GET("/oauth-accounts", handler.ListOAuthAccounts)
		admin.GET("/oauth-accounts/:id/export", handler.ExportOAuthToken)

		admin.GET("/models", handler.ListModelRegistry)
		admin.POST("/models/sync", handler.SyncModels)

		admin.GET("/usage", handler.UsageLogs)
		admin.GET("/monitoring/overview", handler.MonitoringOverview)
	}

	v1 := engine.Group("/v1")
	v1.Use(middleware.APIKeyAuth(db), middleware.RateLimit(redis))
	{
		v1.GET("/models", handler.OpenAIModels)
		v1.POST("/chat/completions", handler.ChatCompletions)
		v1.POST("/embeddings", handler.Embeddings)
		v1.POST("/images/generations", handler.Images)
	}

	return engine
}
