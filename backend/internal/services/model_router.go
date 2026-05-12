package services

import (
	"context"
	"strings"

	"ai-gateway/backend/internal/models"

	"gorm.io/gorm"
)

type ModelRoute struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
}

type ModelRouter struct {
	db *gorm.DB
}

func NewModelRouter(db *gorm.DB) *ModelRouter {
	return &ModelRouter{db: db}
}

func (m *ModelRouter) Resolve(ctx context.Context, model string) ([]ModelRoute, error) {
	var registry []models.ModelRegistry
	err := m.db.WithContext(ctx).
		Where("model_name = ? AND status = ?", model, "active").
		Order("priority desc").
		Find(&registry).Error
	if err != nil {
		return nil, err
	}
	if len(registry) > 0 {
		routes := make([]ModelRoute, 0, len(registry))
		for _, item := range registry {
			routes = append(routes, ModelRoute{Provider: item.Provider, Model: item.ModelName})
		}
		for _, fallback := range inferRoutes(model) {
			routes = appendRouteIfMissing(routes, fallback)
		}
		return routes, nil
	}
	return inferRoutes(model), nil
}

func appendRouteIfMissing(routes []ModelRoute, candidate ModelRoute) []ModelRoute {
	for _, route := range routes {
		if route.Provider == candidate.Provider && route.Model == candidate.Model {
			return routes
		}
	}
	return append(routes, candidate)
}

func inferRoutes(model string) []ModelRoute {
	lower := strings.ToLower(model)
	switch {
	case strings.HasPrefix(lower, "gpt"), strings.HasPrefix(lower, "o1"), strings.HasPrefix(lower, "o3"), strings.HasPrefix(lower, "text-embedding"):
		return []ModelRoute{{Provider: "openai", Model: model}}
	case strings.HasPrefix(lower, "claude"):
		return []ModelRoute{{Provider: "anthropic", Model: model}}
	case strings.HasPrefix(lower, "gemini"), strings.Contains(lower, "imagen"):
		return []ModelRoute{{Provider: "gemini", Model: model}}
	case strings.HasPrefix(lower, "deepseek"):
		return []ModelRoute{{Provider: "deepseek", Model: model}}
	case strings.HasPrefix(lower, "mistral"):
		return []ModelRoute{{Provider: "mistral", Model: model}}
	default:
		return []ModelRoute{
			{Provider: "openai", Model: model},
			{Provider: "openai-compatible", Model: model},
			{Provider: "local-llm", Model: model},
			{Provider: "deepseek", Model: model},
			{Provider: "mistral", Model: model},
			{Provider: "anthropic", Model: model},
			{Provider: "gemini", Model: model},
		}
	}
}
