package services

import (
	"context"
	"fmt"
	"strings"

	"ai-gateway/backend/internal/models"

	"gorm.io/gorm"
)

type ModelRoute struct {
	Provider      string `json:"provider"`
	Model         string `json:"model"`
	ProviderKeyID string `json:"provider_key_id,omitempty"`
}

type ModelRouter struct {
	db *gorm.DB
}

func NewModelRouter(db *gorm.DB) *ModelRouter {
	return &ModelRouter{db: db}
}

func (m *ModelRouter) Resolve(ctx context.Context, model string) ([]ModelRoute, error) {
	return m.ResolveForType(ctx, model, "")
}

func (m *ModelRouter) ResolveForType(ctx context.Context, model string, endpointType string) ([]ModelRoute, error) {
	model = strings.TrimSpace(model)
	endpointType = normalizeModelType(endpointType)
	mappings, hasMapping, err := m.resolveMappings(ctx, model, endpointType)
	if err != nil {
		return nil, err
	}
	if len(mappings) > 0 {
		return mappings, nil
	}
	if hasMapping {
		return nil, endpointTypeMismatch(model, endpointType)
	}

	var registry []models.ModelRegistry
	err = m.db.WithContext(ctx).
		Where("model_name = ? AND status = ?", model, "active").
		Order("priority desc").
		Find(&registry).Error
	if err != nil {
		return nil, err
	}
	if len(registry) > 0 {
		routes := make([]ModelRoute, 0, len(registry))
		for _, item := range registry {
			if endpointType != "" && normalizeModelType(item.Type) != endpointType {
				continue
			}
			routes = append(routes, ModelRoute{Provider: item.Provider, Model: item.ModelName})
		}
		if len(routes) == 0 {
			return nil, endpointTypeMismatch(model, endpointType)
		}
		return routes, nil
	}
	if endpointType != "" && normalizeModelType(inferModelType(model)) != endpointType {
		return nil, endpointTypeMismatch(model, endpointType)
	}
	return inferRoutes(model), nil
}

func (m *ModelRouter) resolveMappings(ctx context.Context, model string, endpointType string) ([]ModelRoute, bool, error) {
	var mappings []models.ModelMapping
	query := m.db.WithContext(ctx).
		Where("public_model = ? AND status = ?", model, "active").
		Order("priority desc")
	if err := query.Find(&mappings).Error; err != nil {
		return nil, false, err
	}
	if len(mappings) == 0 {
		return nil, false, nil
	}

	routes := make([]ModelRoute, 0, len(mappings))
	for _, mapping := range mappings {
		if endpointType != "" && normalizeModelType(mapping.Type) != endpointType {
			continue
		}
		route := ModelRoute{
			Provider: strings.TrimSpace(mapping.Provider),
			Model:    strings.TrimSpace(mapping.UpstreamModel),
		}
		if route.Model == "" {
			route.Model = model
		}
		if mapping.ProviderKeyID != nil {
			route.ProviderKeyID = strings.TrimSpace(*mapping.ProviderKeyID)
		}
		if route.Provider != "" {
			routes = append(routes, route)
		}
	}
	return routes, true, nil
}

func endpointTypeMismatch(model string, endpointType string) error {
	if endpointType == "" {
		return fmt.Errorf("model %s is not available for this endpoint", model)
	}
	return fmt.Errorf("model %s is not available for %s requests; check model mapping or use the matching OpenAI-compatible endpoint", model, endpointType)
}

func appendRouteIfMissing(routes []ModelRoute, candidate ModelRoute) []ModelRoute {
	for _, route := range routes {
		if route.Provider == candidate.Provider && route.Model == candidate.Model && route.ProviderKeyID == candidate.ProviderKeyID {
			return routes
		}
	}
	return append(routes, candidate)
}

func inferRoutes(model string) []ModelRoute {
	lower := strings.ToLower(model)
	switch {
	case strings.HasPrefix(lower, "gpt"), strings.HasPrefix(lower, "o1"), strings.HasPrefix(lower, "o3"), strings.HasPrefix(lower, "o4"), strings.HasPrefix(lower, "text-embedding"):
		return []ModelRoute{
			{Provider: "openai", Model: model},
			{Provider: "openai-compatible", Model: model},
			{Provider: "local-llm", Model: model},
		}
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

func normalizeModelType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "embeddings":
		return "embedding"
	case "images":
		return "image"
	case "completion", "completions":
		return "chat"
	default:
		return strings.ToLower(strings.TrimSpace(value))
	}
}

func inferModelType(model string) string {
	lower := strings.ToLower(strings.TrimSpace(model))
	switch {
	case containsAny(lower, "embedding", "embed"):
		return "embedding"
	case containsAny(lower, "gpt-image", "image", "imagen", "dall", "flux", "sdxl", "stable-diffusion"):
		return "image"
	default:
		return "chat"
	}
}

func containsAny(source string, values ...string) bool {
	for _, value := range values {
		if strings.Contains(source, strings.ToLower(value)) {
			return true
		}
	}
	return false
}
