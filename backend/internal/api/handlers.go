package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"ai-gateway/backend/internal/auth"
	"ai-gateway/backend/internal/config"
	"ai-gateway/backend/internal/models"
	"ai-gateway/backend/internal/providers"
	"ai-gateway/backend/internal/services"
	"ai-gateway/backend/pkg/openai"

	"github.com/gin-gonic/gin"
	"golang.org/x/oauth2"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type Handler struct {
	cfg        config.Config
	db         *gorm.DB
	providers  *providers.Manager
	keyPool    *services.ProviderKeyPool
	models     *services.ModelRouter
	usage      *services.UsageService
	monitoring *services.MonitoringService
	modelSync  *services.ModelSyncService
}

type providerKeyUpsertRequest struct {
	Name                  string   `json:"name"`
	Description           string   `json:"description"`
	Provider              string   `json:"provider"`
	APIKey                string   `json:"api_key"`
	APIKeys               []string `json:"api_keys"`
	AuthMode              string   `json:"auth_mode"`
	OAuthAccountID        *string  `json:"oauth_account_id"`
	BaseURL               string   `json:"base_url"`
	AccessMode            string   `json:"access_mode"`
	Priority              *int     `json:"priority"`
	ProxyID               *string  `json:"proxy_id"`
	Status                string   `json:"status"`
	ModelDetectionEnabled *bool    `json:"model_detection_enabled"`
	ModelOverrides        []string `json:"model_overrides"`
	TestModel             string   `json:"test_model"`
}

type modelMappingRequest struct {
	PublicModel   string  `json:"public_model"`
	Provider      string  `json:"provider"`
	UpstreamModel string  `json:"upstream_model"`
	Type          string  `json:"type"`
	ProviderKeyID *string `json:"provider_key_id"`
	Priority      int     `json:"priority"`
	Status        string  `json:"status"`
}

func NewHandler(cfg config.Config, db *gorm.DB, providers *providers.Manager, keyPool *services.ProviderKeyPool, modelRouter *services.ModelRouter, usage *services.UsageService, monitoring *services.MonitoringService, modelSync *services.ModelSyncService) *Handler {
	return &Handler{
		cfg:        cfg,
		db:         db,
		providers:  providers,
		keyPool:    keyPool,
		models:     modelRouter,
		usage:      usage,
		monitoring: monitoring,
		modelSync:  modelSync,
	}
}

func (h *Handler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "ai-gateway"})
}

func (h *Handler) Register(c *gin.Context) {
	var payload struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required,min=8"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hash, err := auth.HashPassword(payload.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	user := models.User{Email: payload.Email, PasswordHash: hash, Role: "user"}
	if err := h.db.Create(&user).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, err := auth.GenerateJWT(user, h.cfg.JWTSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"user": user, "token": token})
}

func (h *Handler) Login(c *gin.Context) {
	var payload struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user models.User
	if err := h.db.First(&user, "email = ?", payload.Email).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}
	if !auth.CheckPassword(user.PasswordHash, payload.Password) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	token, err := auth.GenerateJWT(user, h.cfg.JWTSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": user, "token": token})
}

func (h *Handler) CurrentUser(c *gin.Context) {
	value, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found in context"})
		return
	}
	user := value.(models.User)
	c.JSON(http.StatusOK, gin.H{"user": user})
}

func (h *Handler) OAuthLogin(c *gin.Context) {
	providerName := c.Param("provider")
	conf, err := h.oauthConfig(providerName)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.Redirect(http.StatusFound, conf.AuthCodeURL(providerName+"-"+fmt.Sprint(time.Now().Unix())))
}

func (h *Handler) OAuthCallback(c *gin.Context) {
	providerName := c.Param("provider")
	conf, err := h.oauthConfig(providerName)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, err := conf.Exchange(c.Request.Context(), c.Query("code"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	email, err := h.fetchOAuthEmail(c.Request.Context(), providerName, conf, token)
	if err != nil || email == "" {
		email = fmt.Sprintf("%s-user-%d@example.local", providerName, time.Now().Unix())
	}

	user, err := h.findOrCreateOAuthUser(email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	account := models.OAuthAccount{
		Provider:     providerName,
		UserID:       user.ID,
		AccessToken:  token.AccessToken,
		RefreshToken: token.RefreshToken,
	}
	_ = h.db.Where("provider = ? AND user_id = ?", providerName, user.ID).Assign(account).FirstOrCreate(&account).Error

	jwtToken, err := auth.GenerateJWT(user, h.cfg.JWTSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Redirect(http.StatusFound, h.cfg.FrontendURL+"/?token="+jwtToken)
}

func (h *Handler) ExportOAuthToken(c *gin.Context) {
	id := c.Param("id")
	account := models.OAuthAccount{}
	if err := h.db.First(&account, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "oauth account not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"id":            account.ID,
		"provider":      account.Provider,
		"access_token":  account.AccessToken,
		"refresh_token": account.RefreshToken,
	})
}

func (h *Handler) CreateAPIKey(c *gin.Context) {
	var payload struct {
		UserID        string   `json:"user_id" binding:"required"`
		RateLimit     int      `json:"rate_limit"`
		AllowedModels []string `json:"allowed_models"`
		ProxyID       *string  `json:"proxy_id"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	raw, hash, err := auth.GenerateAPISecret()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	allowedModels, _ := json.Marshal(payload.AllowedModels)
	apiKey := models.APIKey{
		UserID:        payload.UserID,
		Key:           hash,
		KeyPreview:    raw[:12] + "..." + raw[len(raw)-4:],
		Status:        "active",
		RateLimit:     payload.RateLimit,
		AllowedModels: datatypes.JSON(allowedModels),
		ProxyID:       payload.ProxyID,
	}
	if err := h.db.Create(&apiKey).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"api_key": apiKey, "raw_key": raw})
}

func (h *Handler) ListAPIKeys(c *gin.Context) {
	var items []models.APIKey
	if err := h.db.Order("created_at desc").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *Handler) RotateAPIKey(c *gin.Context) {
	id := c.Param("id")
	record := models.APIKey{}
	if err := h.db.First(&record, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "api key not found"})
		return
	}

	raw, hash, err := auth.GenerateAPISecret()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	record.Key = hash
	record.KeyPreview = raw[:12] + "..." + raw[len(raw)-4:]
	if err := h.db.Save(&record).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"api_key": record, "raw_key": raw})
}

func (h *Handler) DisableAPIKey(c *gin.Context) {
	if err := h.db.Model(&models.APIKey{}).Where("id = ?", c.Param("id")).Update("status", "disabled").Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "disabled"})
}

func (h *Handler) DeleteAPIKey(c *gin.Context) {
	if err := h.db.Delete(&models.APIKey{}, "id = ?", c.Param("id")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) ListUsers(c *gin.Context) {
	var users []models.User
	if err := h.db.Order("created_at desc").Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, users)
}

func (h *Handler) CreateUser(c *gin.Context) {
	var payload struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required,min=8"`
		Role     string `json:"role"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if payload.Role == "" {
		payload.Role = "user"
	}
	hash, err := auth.HashPassword(payload.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	user := models.User{Email: payload.Email, PasswordHash: hash, Role: payload.Role}
	if err := h.db.Create(&user).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, user)
}

func (h *Handler) DeleteUser(c *gin.Context) {
	if err := h.db.Delete(&models.User{}, "id = ?", c.Param("id")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) ListProviderKeys(c *gin.Context) {
	var items []models.ProviderKey
	if err := h.db.Order("provider asc, priority desc").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *Handler) UpsertProviderKey(c *gin.Context) {
	var payload providerKeyUpsertRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(payload.Provider) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "provider is required"})
		return
	}
	if strings.TrimSpace(payload.Name) == "" {
		payload.Name = payload.Provider
	}
	if payload.AuthMode == "" {
		payload.AuthMode = "api_key"
	}
	if payload.AccessMode == "" {
		payload.AccessMode = "round_robin"
	}
	if payload.Status == "" {
		payload.Status = "active"
	}
	if payload.AuthMode == "oauth_account" && (payload.OAuthAccountID == nil || strings.TrimSpace(*payload.OAuthAccountID) == "") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "oauth_account_id is required for oauth auth mode"})
		return
	}
	if payload.AuthMode != "oauth_account" && len(normalizeStringList(payload.APIKeys)) == 0 && strings.TrimSpace(payload.APIKey) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "at least one api key is required"})
		return
	}

	modelDetectionEnabled := true
	if payload.ModelDetectionEnabled != nil {
		modelDetectionEnabled = *payload.ModelDetectionEnabled
	}
	priority := 100
	if payload.Priority != nil {
		priority = *payload.Priority
	}
	if priority < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "priority must be greater than or equal to 0"})
		return
	}

	normalizedKeys := normalizeStringList(payload.APIKeys)
	if len(normalizedKeys) == 0 && strings.TrimSpace(payload.APIKey) != "" {
		normalizedKeys = []string{strings.TrimSpace(payload.APIKey)}
	}
	if payload.AuthMode == "oauth_account" {
		normalizedKeys = nil
		payload.APIKey = ""
	}
	baseURL := defaultBaseURLForProvider(strings.TrimSpace(payload.Provider), strings.TrimSpace(payload.BaseURL))
	if providerRequiresBaseURL(payload.Provider) && strings.TrimSpace(baseURL) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "api base is required for openai-compatible and local-llm providers"})
		return
	}
	if looksLikeGatewayUIURL(baseURL) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "api base must point to an upstream API server, not the gateway frontend or admin page"})
		return
	}

	serializedKeys, _ := json.Marshal(normalizedKeys)
	normalizedOverrides := normalizeStringList(payload.ModelOverrides)
	serializedOverrides, _ := json.Marshal(normalizedOverrides)
	record := models.ProviderKey{
		Name:                  strings.TrimSpace(payload.Name),
		Description:           strings.TrimSpace(payload.Description),
		Provider:              strings.TrimSpace(payload.Provider),
		APIKey:                firstOrEmpty(normalizedKeys),
		APIKeys:               datatypes.JSON(serializedKeys),
		AuthMode:              payload.AuthMode,
		OAuthAccountID:        normalizeNullableString(payload.OAuthAccountID),
		BaseURL:               baseURL,
		AccessMode:            payload.AccessMode,
		Priority:              priority,
		ProxyID:               normalizeNullableString(payload.ProxyID),
		Status:                payload.Status,
		ModelDetectionEnabled: modelDetectionEnabled,
		ModelOverrides:        datatypes.JSON(serializedOverrides),
		TestModel:             strings.TrimSpace(payload.TestModel),
	}

	id := c.Param("id")
	if id == "" {
		if err := h.db.Create(&record).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		_ = h.modelSync.SyncIntegrationModels(c.Request.Context(), record, normalizedOverrides, "manual_override")
		c.JSON(http.StatusCreated, record)
		return
	}

	existing := models.ProviderKey{}
	if err := h.db.First(&existing, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "provider key not found"})
		return
	}

	record.ID = existing.ID
	record.CreatedAt = existing.CreatedAt
	record.UsageCount = existing.UsageCount
	if err := h.db.Save(&record).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_ = h.modelSync.SyncIntegrationModels(c.Request.Context(), record, normalizedOverrides, "manual_override")
	c.JSON(http.StatusOK, record)
}

func (h *Handler) DetectProviderKeyModels(c *gin.Context) {
	if err := h.modelSync.DetectIntegration(c.Request.Context(), c.Param("id")); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "detected", "integration_id": c.Param("id")})
}

func (h *Handler) DetectAllProviderKeyModels(c *gin.Context) {
	if err := h.modelSync.DetectAllUpstreams(c.Request.Context()); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "detected"})
}

func (h *Handler) DeleteProviderKey(c *gin.Context) {
	if err := h.db.Delete(&models.ProviderKey{}, "id = ?", c.Param("id")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) ListProxyNodes(c *gin.Context) {
	var items []models.ProxyNode
	if err := h.db.Order("created_at desc").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *Handler) UpsertProxyNode(c *gin.Context) {
	var payload models.ProxyNode
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if payload.Status == "" {
		payload.Status = "active"
	}
	if id := c.Param("id"); id != "" {
		payload.ID = id
	}
	if payload.ID == "" {
		if err := h.db.Create(&payload).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, payload)
		return
	}
	if err := h.db.Save(&payload).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, payload)
}

func (h *Handler) DeleteProxyNode(c *gin.Context) {
	if err := h.db.Delete(&models.ProxyNode{}, "id = ?", c.Param("id")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) ListOAuthAccounts(c *gin.Context) {
	var items []models.OAuthAccount
	if err := h.db.Order("created_at desc").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *Handler) ListModelRegistry(c *gin.Context) {
	var items []models.ModelRegistry
	if err := h.db.Order("provider asc, model_name asc").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *Handler) ListModelMappings(c *gin.Context) {
	var items []models.ModelMapping
	if err := h.db.Order("public_model asc, priority desc").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *Handler) UpsertModelMapping(c *gin.Context) {
	var payload modelMappingRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(payload.PublicModel) == "" || strings.TrimSpace(payload.Provider) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "public_model and provider are required"})
		return
	}
	if strings.TrimSpace(payload.UpstreamModel) == "" {
		payload.UpstreamModel = payload.PublicModel
	}
	if strings.TrimSpace(payload.Type) == "" {
		payload.Type = "chat"
	}
	if strings.TrimSpace(payload.Status) == "" {
		payload.Status = "active"
	}
	if payload.Priority == 0 {
		payload.Priority = 100
	}

	record := models.ModelMapping{
		PublicModel:   strings.TrimSpace(payload.PublicModel),
		Provider:      strings.TrimSpace(payload.Provider),
		UpstreamModel: strings.TrimSpace(payload.UpstreamModel),
		Type:          strings.TrimSpace(payload.Type),
		ProviderKeyID: normalizeNullableString(payload.ProviderKeyID),
		Priority:      payload.Priority,
		Status:        payload.Status,
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

	existing := models.ModelMapping{}
	if err := h.db.First(&existing, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "model mapping not found"})
		return
	}
	record.ID = existing.ID
	record.CreatedAt = existing.CreatedAt
	if err := h.db.Save(&record).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, record)
}

func (h *Handler) DeleteModelMapping(c *gin.Context) {
	if err := h.db.Delete(&models.ModelMapping{}, "id = ?", c.Param("id")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) SyncModels(c *gin.Context) {
	providerName := c.Query("provider")
	var err error
	if providerName != "" {
		err = h.modelSync.SyncProvider(c.Request.Context(), providerName)
	} else {
		err = h.modelSync.SyncAll(c.Request.Context())
	}
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "synced", "provider": providerName})
}

func (h *Handler) UsageLogs(c *gin.Context) {
	var items []models.UsageLog
	if err := h.db.Order("created_at desc").Limit(200).Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *Handler) MonitoringOverview(c *gin.Context) {
	response, err := h.monitoring.Overview(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, response)
}

func (h *Handler) OpenAIModels(c *gin.Context) {
	var registry []models.ModelRegistry
	if err := h.db.Where("status = ?", "active").Order("provider asc, priority desc").Find(&registry).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var mappings []models.ModelMapping
	if err := h.db.Where("status = ?", "active").Order("priority desc").Find(&mappings).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	items := make([]openai.ModelInfo, 0, len(registry))
	seen := map[string]struct{}{}
	for _, item := range mappings {
		if _, exists := seen[item.PublicModel]; exists {
			continue
		}
		seen[item.PublicModel] = struct{}{}
		items = append(items, openai.ModelInfo{
			ID:      item.PublicModel,
			Object:  "model",
			OwnedBy: item.Provider,
		})
	}
	for _, item := range registry {
		if _, exists := seen[item.ModelName]; exists {
			continue
		}
		seen[item.ModelName] = struct{}{}
		items = append(items, openai.ModelInfo{
			ID:      item.ModelName,
			Object:  "model",
			OwnedBy: item.Provider,
		})
	}
	c.JSON(http.StatusOK, openai.ModelListResponse{Object: "list", Data: items})
}

func (h *Handler) ChatCompletions(c *gin.Context) {
	var req openai.ChatCompletionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	apiKey := c.MustGet("api_key").(models.APIKey)
	if !h.isModelAllowed(apiKey, req.Model) {
		c.JSON(http.StatusForbidden, gin.H{"error": "model not allowed for this api key"})
		return
	}

	if req.Stream {
		h.streamChatCompletions(c, apiKey, req)
		return
	}

	start := time.Now()
	response, route, err := h.executeChat(c.Request.Context(), req)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		apiKeyID := apiKey.ID
		h.usage.Log(c.Request.Context(), &apiKeyID, "", req.Model, nil, latency, openai.Usage{}, http.StatusBadGateway, err.Error())
		status := http.StatusBadGateway
		if isClientModelRoutingError(err) {
			status = http.StatusBadRequest
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	apiKeyID := apiKey.ID
	h.keyPool.MarkUsage(c.Request.Context(), route.ProviderKey.ID)
	h.usage.Log(c.Request.Context(), &apiKeyID, route.Provider, req.Model, route.ProviderKey.ProxyID, latency, response.Usage, http.StatusOK, "")
	c.JSON(http.StatusOK, response)
}

func (h *Handler) Embeddings(c *gin.Context) {
	var req openai.EmbeddingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	apiKey := c.MustGet("api_key").(models.APIKey)
	if !h.isModelAllowed(apiKey, req.Model) {
		c.JSON(http.StatusForbidden, gin.H{"error": "model not allowed for this api key"})
		return
	}

	routes, err := h.models.ResolveForType(c.Request.Context(), req.Model, "embedding")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var lastErr error
	start := time.Now()
	for _, candidate := range routes {
		providerAdapter, ok := h.providers.Get(candidate.Provider)
		if !ok {
			continue
		}
		providerRoutes, err := h.providerRoutesForCandidate(c.Request.Context(), candidate)
		if err != nil {
			lastErr = err
			continue
		}
		for _, route := range providerRoutes {
			upstreamReq := req
			if route.Model != "" {
				upstreamReq.Model = route.Model
			}
			response, err := providerAdapter.Embeddings(c.Request.Context(), route, upstreamReq)
			if err != nil {
				lastErr = err
				continue
			}
			apiKeyID := apiKey.ID
			h.keyPool.MarkUsage(c.Request.Context(), route.ProviderKey.ID)
			h.usage.Log(c.Request.Context(), &apiKeyID, route.Provider, req.Model, route.ProviderKey.ProxyID, time.Since(start).Milliseconds(), response.Usage, http.StatusOK, "")
			c.JSON(http.StatusOK, response)
			return
		}
	}
	c.JSON(http.StatusBadGateway, gin.H{"error": errorText(lastErr, "embedding request failed")})
}

func (h *Handler) Images(c *gin.Context) {
	var req openai.ImageGenerationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Model == "" {
		req.Model = "gpt-image-1"
	}

	apiKey := c.MustGet("api_key").(models.APIKey)
	if !h.isModelAllowed(apiKey, req.Model) {
		c.JSON(http.StatusForbidden, gin.H{"error": "model not allowed for this api key"})
		return
	}

	routes, err := h.models.ResolveForType(c.Request.Context(), req.Model, "image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var lastErr error
	start := time.Now()
	for _, candidate := range routes {
		providerAdapter, ok := h.providers.Get(candidate.Provider)
		if !ok {
			continue
		}
		providerRoutes, err := h.providerRoutesForCandidate(c.Request.Context(), candidate)
		if err != nil {
			lastErr = err
			continue
		}
		for _, route := range providerRoutes {
			upstreamReq := req
			if route.Model != "" {
				upstreamReq.Model = route.Model
			}
			response, err := providerAdapter.ImageGeneration(c.Request.Context(), route, upstreamReq)
			if err != nil {
				lastErr = err
				continue
			}
			apiKeyID := apiKey.ID
			h.keyPool.MarkUsage(c.Request.Context(), route.ProviderKey.ID)
			h.usage.Log(c.Request.Context(), &apiKeyID, route.Provider, req.Model, route.ProviderKey.ProxyID, time.Since(start).Milliseconds(), openai.Usage{}, http.StatusOK, "")
			c.JSON(http.StatusOK, response)
			return
		}
	}
	c.JSON(http.StatusBadGateway, gin.H{"error": errorText(lastErr, "image request failed")})
}

func (h *Handler) executeChat(ctx context.Context, req openai.ChatCompletionRequest) (*openai.ChatCompletionResponse, providers.Route, error) {
	routes, err := h.models.ResolveForType(ctx, req.Model, "chat")
	if err != nil {
		return nil, providers.Route{}, err
	}

	var lastErr error
	for _, candidate := range routes {
		providerAdapter, ok := h.providers.Get(candidate.Provider)
		if !ok {
			continue
		}

		providerRoutes, err := h.providerRoutesForCandidate(ctx, candidate)
		if err != nil {
			lastErr = err
			continue
		}

		for _, route := range providerRoutes {
			upstreamReq := req
			if route.Model != "" {
				upstreamReq.Model = route.Model
			}
			response, err := providerAdapter.ChatCompletions(ctx, route, upstreamReq)
			if err == nil {
				return response, route, nil
			}
			lastErr = err
		}
	}
	return nil, providers.Route{}, fmt.Errorf("chat completion failed after fallback: %s", errorText(lastErr, "no provider available"))
}

func (h *Handler) streamChatCompletions(c *gin.Context, apiKey models.APIKey, req openai.ChatCompletionRequest) {
	routes, err := h.models.ResolveForType(c.Request.Context(), req.Model, "chat")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var lastErr error
	start := time.Now()
	for _, candidate := range routes {
		providerAdapter, ok := h.providers.Get(candidate.Provider)
		if !ok {
			continue
		}
		providerRoutes, err := h.providerRoutesForCandidate(c.Request.Context(), candidate)
		if err != nil {
			lastErr = err
			continue
		}
		for _, route := range providerRoutes {
			upstreamReq := req
			if route.Model != "" {
				upstreamReq.Model = route.Model
			}
			if err := providerAdapter.StreamChatCompletions(c.Request.Context(), route, upstreamReq, c.Writer); err == nil {
				apiKeyID := apiKey.ID
				h.keyPool.MarkUsage(c.Request.Context(), route.ProviderKey.ID)
				h.usage.Log(c.Request.Context(), &apiKeyID, route.Provider, req.Model, route.ProviderKey.ProxyID, time.Since(start).Milliseconds(), openai.Usage{}, http.StatusOK, "")
				return
			} else {
				lastErr = err
			}
		}
	}
	c.JSON(http.StatusBadGateway, gin.H{"error": errorText(lastErr, "streaming request failed")})
}

func (h *Handler) providerRoutesForCandidate(ctx context.Context, candidate services.ModelRoute) ([]providers.Route, error) {
	if strings.TrimSpace(candidate.ProviderKeyID) != "" {
		return h.keyPool.RoutesForIntegration(ctx, candidate.ProviderKeyID, candidate.Model)
	}
	return h.keyPool.RoutesForProvider(ctx, candidate.Provider, candidate.Model, h.cfg.DefaultBalanceStrategy)
}

func (h *Handler) isModelAllowed(apiKey models.APIKey, model string) bool {
	if len(apiKey.AllowedModels) == 0 || string(apiKey.AllowedModels) == "null" {
		return true
	}
	var items []string
	if err := json.Unmarshal(apiKey.AllowedModels, &items); err != nil || len(items) == 0 {
		return true
	}
	model = strings.TrimSpace(model)
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item == "" || item == "*" {
			return true
		}
		if item == model {
			return true
		}
		if strings.HasSuffix(item, "*") && strings.HasPrefix(model, strings.TrimSuffix(item, "*")) {
			return true
		}
	}
	return false
}

func (h *Handler) oauthConfig(providerName string) (*oauth2.Config, error) {
	switch providerName {
	case "google":
		return auth.GoogleConfig(h.cfg), nil
	case "github":
		return auth.GitHubConfig(h.cfg), nil
	default:
		return nil, fmt.Errorf("unsupported oauth provider")
	}
}

func (h *Handler) fetchOAuthEmail(ctx context.Context, providerName string, conf *oauth2.Config, token *oauth2.Token) (string, error) {
	client := conf.Client(ctx, token)
	switch providerName {
	case "google":
		response, err := client.Get("https://openidconnect.googleapis.com/v1/userinfo")
		if err != nil {
			return "", err
		}
		defer response.Body.Close()
		var payload struct {
			Email string `json:"email"`
		}
		if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
			return "", err
		}
		return payload.Email, nil
	case "github":
		response, err := client.Get("https://api.github.com/user/emails")
		if err != nil {
			return "", err
		}
		defer response.Body.Close()
		var payload []struct {
			Email   string `json:"email"`
			Primary bool   `json:"primary"`
		}
		if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
			return "", err
		}
		for _, item := range payload {
			if item.Primary {
				return item.Email, nil
			}
		}
		if len(payload) > 0 {
			return payload[0].Email, nil
		}
	}
	return "", nil
}

func (h *Handler) findOrCreateOAuthUser(email string) (models.User, error) {
	user := models.User{}
	if err := h.db.First(&user, "email = ?", email).Error; err == nil {
		return user, nil
	}
	hash, _ := auth.HashPassword("oauth-login-placeholder")
	user = models.User{Email: email, PasswordHash: hash, Role: "user"}
	return user, h.db.Create(&user).Error
}

func errorText(err error, fallback string) string {
	if err == nil {
		return fallback
	}
	return err.Error()
}

func isClientModelRoutingError(err error) bool {
	if err == nil {
		return false
	}
	text := strings.ToLower(err.Error())
	return strings.Contains(text, "not available for chat") ||
		strings.Contains(text, "not available for embedding") ||
		strings.Contains(text, "not available for image")
}

func normalizeStringList(values []string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func normalizeNullableString(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func firstOrEmpty(values []string) string {
	if len(values) == 0 {
		return ""
	}
	return values[0]
}

func defaultBaseURLForProvider(providerName, baseURL string) string {
	if strings.TrimSpace(baseURL) != "" {
		return strings.TrimRight(strings.TrimSpace(baseURL), "/")
	}
	switch strings.TrimSpace(providerName) {
	case "deepseek":
		return "https://api.deepseek.com"
	case "mistral":
		return "https://api.mistral.ai"
	default:
		return ""
	}
}

func looksLikeGatewayUIURL(baseURL string) bool {
	lower := strings.ToLower(strings.TrimSpace(baseURL))
	return strings.Contains(lower, "/dashboard") ||
		strings.Contains(lower, "/_next") ||
		strings.Contains(lower, "/api/proxy")
}

func providerRequiresBaseURL(providerName string) bool {
	switch strings.TrimSpace(providerName) {
	case "openai-compatible", "local-llm":
		return true
	default:
		return false
	}
}
