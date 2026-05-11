package middleware

import (
	"context"
	"net/http"
	"strings"
	"time"

	"ai-gateway/backend/internal/auth"
	"ai-gateway/backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

func APIKeyAuth(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
		if raw == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing api key"})
			return
		}

		hash := auth.HashAPISecret(raw)
		var apiKey models.APIKey
		if err := db.First(&apiKey, "key = ? AND status = ?", hash, "active").Error; err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid api key"})
			return
		}

		c.Set("api_key", apiKey)
		c.Next()
	}
}

func RateLimit(redisClient *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		value, exists := c.Get("api_key")
		if !exists {
			c.Next()
			return
		}

		apiKey := value.(models.APIKey)
		limit := apiKey.RateLimit
		if limit <= 0 {
			limit = 60
		}

		key := "ratelimit:" + apiKey.ID + ":" + time.Now().UTC().Format("200601021504")
		count, err := redisClient.Incr(context.Background(), key).Result()
		if err == nil && count == 1 {
			redisClient.Expire(context.Background(), key, time.Minute)
		}
		if err == nil && count > int64(limit) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "rate limit exceeded"})
			return
		}

		c.Next()
	}
}
