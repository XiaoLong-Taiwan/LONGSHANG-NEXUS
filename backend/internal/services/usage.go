package services

import (
	"context"

	"ai-gateway/backend/internal/models"
	"ai-gateway/backend/pkg/openai"

	"gorm.io/gorm"
)

type UsageService struct {
	db *gorm.DB
}

func NewUsageService(db *gorm.DB) *UsageService {
	return &UsageService{db: db}
}

func (s *UsageService) Log(ctx context.Context, apiKeyID *string, provider, model string, proxyID *string, latency int64, usage openai.Usage, statusCode int, errMsg string) {
	log := models.UsageLog{
		APIKeyID:         apiKeyID,
		Provider:         provider,
		Model:            model,
		Tokens:           usage.TotalTokens,
		PromptTokens:     usage.PromptTokens,
		CompletionTokens: usage.CompletionTokens,
		Latency:          latency,
		StatusCode:       statusCode,
		ErrorMessage:     errMsg,
		ProxyID:          proxyID,
	}
	_ = s.db.WithContext(ctx).Create(&log).Error
}
