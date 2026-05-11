package services

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"ai-gateway/backend/internal/models"
	"ai-gateway/backend/internal/providers"

	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type ModelSyncService struct {
	db       *gorm.DB
	provider *providers.Manager
	keyPool  *ProviderKeyPool
	strategy string
}

func NewModelSyncService(db *gorm.DB, provider *providers.Manager, keyPool *ProviderKeyPool, strategy string) *ModelSyncService {
	return &ModelSyncService{
		db:       db,
		provider: provider,
		keyPool:  keyPool,
		strategy: strategy,
	}
}

func (s *ModelSyncService) SyncAll(ctx context.Context) error {
	for _, provider := range []string{"openai", "anthropic", "gemini"} {
		_ = s.SyncProvider(ctx, provider)
	}
	return nil
}

func (s *ModelSyncService) DetectAllUpstreams(ctx context.Context) error {
	var integrations []models.ProviderKey
	if err := s.db.WithContext(ctx).Where("status = ? AND model_detection_enabled = ?", "active", true).Find(&integrations).Error; err != nil {
		return err
	}
	for _, integration := range integrations {
		_ = s.DetectIntegration(ctx, integration.ID)
	}
	return nil
}

func (s *ModelSyncService) DetectIntegration(ctx context.Context, integrationID string) error {
	var integration models.ProviderKey
	if err := s.db.WithContext(ctx).First(&integration, "id = ?", integrationID).Error; err != nil {
		return err
	}
	adapter, ok := s.provider.Get(integration.Provider)
	if !ok {
		return errors.New("provider not registered")
	}

	routes, err := s.keyPool.RoutesForIntegration(ctx, integrationID, "")
	if err != nil {
		return err
	}
	if len(routes) == 0 {
		return errors.New("integration has no usable route")
	}

	modelsResponse, err := adapter.ListModels(ctx, routes[0])
	if err != nil {
		return err
	}

	for _, item := range modelsResponse.Data {
		payload, _ := json.Marshal(map[string]any{
			"source":           "integration_detect",
			"integration_id":   integration.ID,
			"integration_name": integration.Name,
		})
		record := models.ModelRegistry{
			Provider:     integration.Provider,
			ModelName:    item.ID,
			Type:         inferModelType(item.ID),
			Priority:     integration.Priority,
			Status:       "active",
			LastChecked:  time.Now(),
			Capabilities: datatypes.JSON(payload),
		}

		var existing models.ModelRegistry
		err := s.db.WithContext(ctx).Where("provider = ? AND model_name = ?", integration.Provider, item.ID).First(&existing).Error
		if err == nil {
			existing.LastChecked = time.Now()
			existing.Status = "active"
			existing.Priority = integration.Priority
			existing.Type = record.Type
			existing.Capabilities = record.Capabilities
			_ = s.db.WithContext(ctx).Save(&existing).Error
			continue
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			_ = s.db.WithContext(ctx).Create(&record).Error
		}
	}
	return nil
}

func (s *ModelSyncService) SyncProvider(ctx context.Context, providerName string) error {
	adapter, ok := s.provider.Get(providerName)
	if !ok {
		return errors.New("provider not registered")
	}

	routes, err := s.keyPool.RoutesForProvider(ctx, providerName, "", s.strategy)
	if err != nil {
		return err
	}
	modelsResponse, err := adapter.ListModels(ctx, routes[0])
	if err != nil {
		return err
	}

	for _, item := range modelsResponse.Data {
		record := models.ModelRegistry{
			Provider:     providerName,
			ModelName:    item.ID,
			Type:         inferModelType(item.ID),
			Priority:     100,
			Status:       "active",
			LastChecked:  time.Now(),
			Capabilities: datatypes.JSON([]byte(`{"source":"sync"}`)),
		}

		var existing models.ModelRegistry
		err := s.db.WithContext(ctx).
			Where("provider = ? AND model_name = ?", providerName, item.ID).
			First(&existing).Error
		if err == nil {
			existing.LastChecked = time.Now()
			existing.Status = "active"
			existing.Type = record.Type
			_ = s.db.WithContext(ctx).Save(&existing).Error
			continue
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			_ = s.db.WithContext(ctx).Create(&record).Error
		}
	}
	return nil
}

func inferModelType(model string) string {
	switch {
	case containsAny(model, "embedding"):
		return "embedding"
	case containsAny(model, "image", "imagen", "dall"):
		return "image"
	default:
		return "chat"
	}
}

func containsAny(source string, values ...string) bool {
	lower := strings.ToLower(source)
	for _, value := range values {
		if strings.Contains(lower, strings.ToLower(value)) {
			return true
		}
	}
	return false
}
