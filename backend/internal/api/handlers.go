package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
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
	var payload models.ProviderKey
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if payload.Status == "" {
		payload.Status = "active"
	}
	if payload.Priority == 0 {
		payload.Priority = 100
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
	items := make([]openai.ModelInfo, 0, len(registry))
	for _, item := range registry {
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
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
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

	routes, err := h.models.Resolve(c.Request.Context(), req.Model)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	var lastErr error
	start := time.Now()
	for _, candidate := range routes {
		providerAdapter, ok := h.providers.Get(candidate.Provider)
		if !ok {
			continue
		}
		providerRoutes, err := h.keyPool.RoutesForProvider(c.Request.Context(), candidate.Provider, candidate.Model, h.cfg.DefaultBalanceStrategy)
		if err != nil {
			lastErr = err
			continue
		}
		for _, route := range providerRoutes {
			response, err := providerAdapter.Embeddings(c.Request.Context(), route, req)
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

	routes, err := h.models.Resolve(c.Request.Context(), req.Model)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	var lastErr error
	start := time.Now()
	for _, candidate := range routes {
		providerAdapter, ok := h.providers.Get(candidate.Provider)
		if !ok {
			continue
		}
		providerRoutes, err := h.keyPool.RoutesForProvider(c.Request.Context(), candidate.Provider, candidate.Model, h.cfg.DefaultBalanceStrategy)
		if err != nil {
			lastErr = err
			continue
		}
		for _, route := range providerRoutes {
			response, err := providerAdapter.ImageGeneration(c.Request.Context(), route, req)
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
	routes, err := h.models.Resolve(ctx, req.Model)
	if err != nil {
		return nil, providers.Route{}, err
	}

	var lastErr error
	for _, candidate := range routes {
		providerAdapter, ok := h.providers.Get(candidate.Provider)
		if !ok {
			continue
		}

		providerRoutes, err := h.keyPool.RoutesForProvider(ctx, candidate.Provider, candidate.Model, h.cfg.DefaultBalanceStrategy)
		if err != nil {
			lastErr = err
			continue
		}

		for _, route := range providerRoutes {
			response, err := providerAdapter.ChatCompletions(ctx, route, req)
			if err == nil {
				return response, route, nil
			}
			lastErr = err
		}
	}
	return nil, providers.Route{}, fmt.Errorf("chat completion failed after fallback: %s", errorText(lastErr, "no provider available"))
}

func (h *Handler) streamChatCompletions(c *gin.Context, apiKey models.APIKey, req openai.ChatCompletionRequest) {
	routes, err := h.models.Resolve(c.Request.Context(), req.Model)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	var lastErr error
	start := time.Now()
	for _, candidate := range routes {
		providerAdapter, ok := h.providers.Get(candidate.Provider)
		if !ok {
			continue
		}
		providerRoutes, err := h.keyPool.RoutesForProvider(c.Request.Context(), candidate.Provider, candidate.Model, h.cfg.DefaultBalanceStrategy)
		if err != nil {
			lastErr = err
			continue
		}
		for _, route := range providerRoutes {
			if err := providerAdapter.StreamChatCompletions(c.Request.Context(), route, req, c.Writer); err == nil {
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

func (h *Handler) isModelAllowed(apiKey models.APIKey, model string) bool {
	if len(apiKey.AllowedModels) == 0 || string(apiKey.AllowedModels) == "null" {
		return true
	}
	var items []string
	if err := json.Unmarshal(apiKey.AllowedModels, &items); err != nil || len(items) == 0 {
		return true
	}
	for _, item := range items {
		if item == model {
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
