package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"ai-gateway/backend/internal/models"
	"ai-gateway/backend/internal/providers"
	"ai-gateway/backend/internal/services"
	"ai-gateway/backend/pkg/openai"

	"github.com/gin-gonic/gin"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type oauthAccountUpsertRequest struct {
	Name              string                 `json:"name"`
	Provider          string                 `json:"provider"`
	Email             string                 `json:"email"`
	ProviderAccountID string                 `json:"provider_account_id"`
	UserID            string                 `json:"user_id"`
	AccessToken       string                 `json:"access_token"`
	RefreshToken      string                 `json:"refresh_token"`
	ProxyID           *string                `json:"proxy_id"`
	Status            string                 `json:"status"`
	QuotaUsed         float64                `json:"quota_used"`
	QuotaTotal        float64                `json:"quota_total"`
	QuotaUnit         string                 `json:"quota_unit"`
	Notes             string                 `json:"notes"`
	Metadata          map[string]any         `json:"metadata"`
}

type providerDiscoveryRequest struct {
	Provider       string   `json:"provider"`
	Name           string   `json:"name"`
	AuthMode       string   `json:"auth_mode"`
	OAuthAccountID *string  `json:"oauth_account_id"`
	APIKeys        []string `json:"api_keys"`
	APIKey         string   `json:"api_key"`
	BaseURL        string   `json:"base_url"`
	ProxyID        *string  `json:"proxy_id"`
	TestModel      string   `json:"test_model"`
	TestType       string   `json:"test_type"`
}

type aggregateModelResponse struct {
	ModelName   string                   `json:"model_name"`
	Providers   []string                 `json:"providers"`
	Types       []string                 `json:"types"`
	Priority    int                      `json:"priority"`
	Status      string                   `json:"status"`
	LastChecked time.Time                `json:"last_checked"`
	Upstreams   []servicesProviderSource `json:"upstreams"`
}

type servicesProviderSource struct {
	Provider        string `json:"provider"`
	IntegrationID   string `json:"integration_id"`
	IntegrationName string `json:"integration_name"`
	Source          string `json:"source"`
}

func (h *Handler) UpsertOAuthAccount(c *gin.Context) {
	var payload oauthAccountUpsertRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(payload.Provider) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "provider is required"})
		return
	}
	if strings.TrimSpace(payload.UserID) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_id is required"})
		return
	}

	metadata, _ := json.Marshal(payload.Metadata)
	record := models.OAuthAccount{
		Name:              strings.TrimSpace(payload.Name),
		Provider:          strings.TrimSpace(payload.Provider),
		Email:             strings.TrimSpace(payload.Email),
		ProviderAccountID: strings.TrimSpace(payload.ProviderAccountID),
		UserID:            strings.TrimSpace(payload.UserID),
		AccessToken:       strings.TrimSpace(payload.AccessToken),
		RefreshToken:      strings.TrimSpace(payload.RefreshToken),
		ProxyID:           normalizeNullableString(payload.ProxyID),
		Status:            defaultIfEmpty(payload.Status, "active"),
		QuotaUsed:         payload.QuotaUsed,
		QuotaTotal:        payload.QuotaTotal,
		QuotaUnit:         strings.TrimSpace(payload.QuotaUnit),
		Notes:             strings.TrimSpace(payload.Notes),
		Metadata:          datatypes.JSON(metadata),
	}

	id := c.Param("id")
	if id == "" {
		if err := h.db.Create(&record).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, record)
		return
	}

	existing := models.OAuthAccount{}
	if err := h.db.First(&existing, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "oauth account not found"})
		return
	}
	record.ID = existing.ID
	record.CreatedAt = existing.CreatedAt
	record.LastQuotaCheck = existing.LastQuotaCheck
	if err := h.db.Save(&record).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, record)
}

func (h *Handler) DeleteOAuthAccount(c *gin.Context) {
	if err := h.db.Delete(&models.OAuthAccount{}, "id = ?", c.Param("id")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) DetectOAuthQuota(c *gin.Context) {
	account := models.OAuthAccount{}
	if err := h.db.First(&account, "id = ?", c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "oauth account not found"})
		return
	}

	metadata := map[string]any{
		"detection": "manual",
		"message":   "No official quota endpoint is configured for this provider yet. Manual quota tracking is preserved.",
		"provider":  account.Provider,
	}
	if strings.TrimSpace(account.AccessToken) != "" {
		metadata["token_present"] = true
	}

	encoded, _ := json.Marshal(metadata)
	now := time.Now()
	account.LastQuotaCheck = &now
	account.Metadata = datatypes.JSON(encoded)
	if account.Status == "" {
		account.Status = "active"
	}
	if err := h.db.Save(&account).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status":           "checked",
		"oauth_account_id": account.ID,
		"quota_used":       account.QuotaUsed,
		"quota_total":      account.QuotaTotal,
		"quota_unit":       account.QuotaUnit,
		"metadata":         metadata,
	})
}

func (h *Handler) GetSettings(c *gin.Context) {
	record := models.GatewaySetting{}
	if err := h.db.First(&record, "key = ?", "default").Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusOK, defaultGatewaySettings())
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	result := defaultGatewaySettings()
	_ = json.Unmarshal(record.Value, &result)
	c.JSON(http.StatusOK, result)
}

func (h *Handler) SaveSettings(c *gin.Context) {
	payload := defaultGatewaySettings()
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	encoded, _ := json.Marshal(payload)
	record := models.GatewaySetting{
		Key:       "default",
		Value:     datatypes.JSON(encoded),
		UpdatedAt: time.Now(),
	}
	if err := h.db.Save(&record).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, payload)
}

func (h *Handler) DiscoverProviderModels(c *gin.Context) {
	var payload providerDiscoveryRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	route, err := h.buildProviderRoute(c.Request.Context(), payload)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	adapter, ok := h.providers.Get(payload.Provider)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "provider not registered"})
		return
	}
	modelsResponse, err := adapter.ListModels(c.Request.Context(), route)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	items := make([]string, 0, len(modelsResponse.Data))
	for _, item := range modelsResponse.Data {
		items = append(items, item.ID)
	}
	c.JSON(http.StatusOK, gin.H{"models": items})
}

func (h *Handler) TestProviderConnection(c *gin.Context) {
	var payload providerDiscoveryRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	route, err := h.buildProviderRoute(c.Request.Context(), payload)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	adapter, ok := h.providers.Get(payload.Provider)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "provider not registered"})
		return
	}

	testType := defaultIfEmpty(strings.TrimSpace(payload.TestType), "models")
	switch testType {
	case "chat":
		if strings.TrimSpace(payload.TestModel) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "test_model is required for chat test"})
			return
		}
		response, err := adapter.ChatCompletions(c.Request.Context(), route, openai.ChatCompletionRequest{
			Model: payload.TestModel,
			Messages: []openai.Message{{
				Role:    "user",
				Content: "Reply with the single word: ok",
			}},
			MaxTokens: 16,
		})
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"status":     "ok",
			"test_type":  testType,
			"model":      payload.TestModel,
			"preview":    firstChoiceText(response),
			"usage":      response.Usage,
			"provider":   payload.Provider,
			"base_url":   payload.BaseURL,
		})
	case "embeddings":
		if strings.TrimSpace(payload.TestModel) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "test_model is required for embeddings test"})
			return
		}
		response, err := adapter.Embeddings(c.Request.Context(), route, openai.EmbeddingRequest{
			Model: payload.TestModel,
			Input: "health check",
		})
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		length := 0
		if len(response.Data) > 0 {
			length = len(response.Data[0].Embedding)
		}
		c.JSON(http.StatusOK, gin.H{
			"status":           "ok",
			"test_type":        testType,
			"model":            payload.TestModel,
			"embedding_length": length,
			"usage":            response.Usage,
		})
	case "image":
		if strings.TrimSpace(payload.TestModel) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "test_model is required for image test"})
			return
		}
		response, err := adapter.ImageGeneration(c.Request.Context(), route, openai.ImageGenerationRequest{
			Model:  payload.TestModel,
			Prompt: "simple abstract blue square",
			N:      1,
		})
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"status":      "ok",
			"test_type":   testType,
			"model":       payload.TestModel,
			"image_count": len(response.Data),
		})
	default:
		modelsResponse, err := adapter.ListModels(c.Request.Context(), route)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		sample := []string{}
		for _, item := range modelsResponse.Data {
			sample = append(sample, item.ID)
			if len(sample) == 10 {
				break
			}
		}
		c.JSON(http.StatusOK, gin.H{
			"status":      "ok",
			"test_type":   "models",
			"model_count": len(modelsResponse.Data),
			"sample":      sample,
		})
	}
}

func (h *Handler) AggregateModels(c *gin.Context) {
	var records []models.ModelRegistry
	if err := h.db.Order("model_name asc, provider asc").Find(&records).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	grouped := map[string]*aggregateModelResponse{}
	for _, record := range records {
		item, exists := grouped[record.ModelName]
		if !exists {
			item = &aggregateModelResponse{
				ModelName:   record.ModelName,
				Providers:   []string{},
				Types:       []string{},
				Priority:    record.Priority,
				Status:      record.Status,
				LastChecked: record.LastChecked,
				Upstreams:   []servicesProviderSource{},
			}
			grouped[record.ModelName] = item
		}
		item.Providers = appendUnique(item.Providers, record.Provider)
		item.Types = appendUnique(item.Types, record.Type)
		if record.Priority > item.Priority {
			item.Priority = record.Priority
		}
		if record.LastChecked.After(item.LastChecked) {
			item.LastChecked = record.LastChecked
		}

		sources, _ := services.ModelRegistrySources(record.Capabilities)
		for _, source := range sources {
			item.Upstreams = appendUniqueUpstreams(item.Upstreams, servicesProviderSource{
				Provider:        record.Provider,
				IntegrationID:   source.IntegrationID,
				IntegrationName: source.IntegrationName,
				Source:          source.Source,
			})
		}
	}

	result := make([]aggregateModelResponse, 0, len(grouped))
	for _, item := range grouped {
		result = append(result, *item)
	}
	c.JSON(http.StatusOK, result)
}

func (h *Handler) buildProviderRoute(ctx context.Context, payload providerDiscoveryRequest) (providers.Route, error) {
	providerName := strings.TrimSpace(payload.Provider)
	if providerName == "" {
		return providers.Route{}, fmt.Errorf("provider is required")
	}

	credential := strings.TrimSpace(payload.APIKey)
	if credential == "" {
		items := normalizeStringList(payload.APIKeys)
		if len(items) > 0 {
			credential = items[0]
		}
	}

	authMode := defaultIfEmpty(strings.TrimSpace(payload.AuthMode), "api_key")
	if authMode == "oauth_account" {
		if payload.OAuthAccountID == nil || strings.TrimSpace(*payload.OAuthAccountID) == "" {
			return providers.Route{}, fmt.Errorf("oauth_account_id is required")
		}
		account := models.OAuthAccount{}
		if err := h.db.WithContext(ctx).First(&account, "id = ?", strings.TrimSpace(*payload.OAuthAccountID)).Error; err != nil {
			return providers.Route{}, err
		}
		credential = account.AccessToken
	}
	if credential == "" {
		return providers.Route{}, fmt.Errorf("no credential available")
	}

	var proxyNode *models.ProxyNode
	if payload.ProxyID != nil && strings.TrimSpace(*payload.ProxyID) != "" {
		node := models.ProxyNode{}
		if err := h.db.WithContext(ctx).First(&node, "id = ?", strings.TrimSpace(*payload.ProxyID)).Error; err == nil {
			proxyNode = &node
		}
	}

	return providers.Route{
		Provider: providerName,
		Model:    strings.TrimSpace(payload.TestModel),
		ProviderKey: models.ProviderKey{
			Provider: providerName,
			BaseURL:  strings.TrimSpace(payload.BaseURL),
		},
		ProxyNode:  proxyNode,
		Credential: credential,
	}, nil
}

func defaultGatewaySettings() map[string]any {
	return map[string]any{
		"chaos_mode":                           false,
		"session_sticky_routing":              true,
		"websocket_auth":                      true,
		"request_shaper":                      false,
		"thinking_signature_shaper":           false,
		"thinking_budget_shaper":              false,
		"api_key_signature_shaper":            false,
		"request_fingerprint_normalization":   true,
		"metadata_passthrough":                true,
		"cch_signature":                       false,
		"anthropic_cache_ttl_injection":       false,
		"rewrite_message_cache_breakpoints":   false,
	}
}

func firstChoiceText(response *openai.ChatCompletionResponse) string {
	if response == nil || len(response.Choices) == 0 {
		return ""
	}
	return fmt.Sprint(response.Choices[0].Message.Content)
}

func appendUnique(items []string, value string) []string {
	for _, item := range items {
		if item == value {
			return items
		}
	}
	return append(items, value)
}

func appendUniqueUpstreams(items []servicesProviderSource, value servicesProviderSource) []servicesProviderSource {
	for _, item := range items {
		if item.Provider == value.Provider && item.IntegrationID == value.IntegrationID && item.Source == value.Source {
			return items
		}
	}
	return append(items, value)
}

func defaultIfEmpty(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
