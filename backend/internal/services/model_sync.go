package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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

	modelNames := make([]string, 0, len(modelsResponse.Data))
	for _, item := range modelsResponse.Data {
		modelNames = append(modelNames, item.ID)
	}
	if err := s.SyncIntegrationModels(ctx, integration, modelNames, "integration_detect"); err != nil {
		return err
	}
	return s.SyncIntegrationModels(ctx, integration, decodeModelOverrides(integration.ModelOverrides), "manual_override")
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
			Capabilities: datatypes.JSON([]byte(`{"source":"sync","sources":[]}`)),
		}

		var existing models.ModelRegistry
		err := s.db.WithContext(ctx).
			Where("provider = ? AND model_name = ?", providerName, item.ID).
			First(&existing).Error
		if err == nil {
			existing.LastChecked = time.Now()
			existing.Status = "active"
			existing.Type = record.Type
			existing.Capabilities = mergeCapabilities(existing.Capabilities, providerModelSource{})
			_ = s.db.WithContext(ctx).Save(&existing).Error
			continue
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			_ = s.db.WithContext(ctx).Create(&record).Error
		}
	}
	return nil
}

func (s *ModelSyncService) SyncIntegrationModels(ctx context.Context, integration models.ProviderKey, modelNames []string, sourceType string) error {
	source := providerModelSource{
		IntegrationID:   integration.ID,
		IntegrationName: integration.Name,
		Source:          sourceType,
	}
	now := time.Now()
	desired := map[string]struct{}{}
	for _, modelName := range modelNames {
		modelName = strings.TrimSpace(modelName)
		if modelName == "" {
			continue
		}
		desired[modelName] = struct{}{}

		var existing models.ModelRegistry
		err := s.db.WithContext(ctx).Where("provider = ? AND model_name = ?", integration.Provider, modelName).First(&existing).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			payload := mergeCapabilities(nil, source)
			record := models.ModelRegistry{
				Provider:     integration.Provider,
				ModelName:    modelName,
				Type:         inferModelType(modelName),
				Priority:     integration.Priority,
				Status:       "active",
				LastChecked:  now,
				Capabilities: payload,
			}
			if createErr := s.db.WithContext(ctx).Create(&record).Error; createErr != nil {
				return createErr
			}
			continue
		}
		if err != nil {
			return err
		}
		existing.Priority = integration.Priority
		existing.Status = "active"
		existing.Type = inferModelType(modelName)
		existing.LastChecked = now
		existing.Capabilities = mergeCapabilities(existing.Capabilities, source)
		if saveErr := s.db.WithContext(ctx).Save(&existing).Error; saveErr != nil {
			return saveErr
		}
	}

	var providerRecords []models.ModelRegistry
	if err := s.db.WithContext(ctx).Where("provider = ?", integration.Provider).Find(&providerRecords).Error; err != nil {
		return err
	}
	for _, record := range providerRecords {
		if _, keep := desired[record.ModelName]; keep {
			continue
		}
		updated, removed, err := removeCapabilitySource(record.Capabilities, integration.ID, sourceType)
		if err != nil || !removed {
			continue
		}
		if len(extractSources(updated)) == 0 && sourceType != "integration_detect" {
			if err := s.db.WithContext(ctx).Delete(&record).Error; err != nil {
				return err
			}
			continue
		}
		record.Capabilities = updated
		if len(extractSources(updated)) == 0 && capabilitySourceType(updated) != "sync" {
			record.Status = "inactive"
		}
		if err := s.db.WithContext(ctx).Save(&record).Error; err != nil {
			return err
		}
	}
	return nil
}

type providerModelCapabilities struct {
	Source  string                `json:"source"`
	Sources []providerModelSource `json:"sources"`
}

type providerModelSource struct {
	IntegrationID   string `json:"integration_id,omitempty"`
	IntegrationName string `json:"integration_name,omitempty"`
	Source          string `json:"source,omitempty"`
}

func mergeCapabilities(raw datatypes.JSON, source providerModelSource) datatypes.JSON {
	payload := providerModelCapabilities{
		Source:  "integration_detect",
		Sources: []providerModelSource{},
	}
	if len(raw) > 0 && string(raw) != "null" {
		_ = json.Unmarshal(raw, &payload)
	}
	if payload.Source == "" {
		payload.Source = "integration_detect"
	}
	if source.IntegrationID != "" {
		found := false
		for index, item := range payload.Sources {
			if item.IntegrationID == source.IntegrationID && item.Source == source.Source {
				payload.Sources[index] = source
				found = true
				break
			}
		}
		if !found {
			payload.Sources = append(payload.Sources, source)
		}
	}
	encoded, _ := json.Marshal(payload)
	return datatypes.JSON(encoded)
}

func removeCapabilitySource(raw datatypes.JSON, integrationID, sourceType string) (datatypes.JSON, bool, error) {
	payload := providerModelCapabilities{}
	if len(raw) > 0 && string(raw) != "null" {
		if err := json.Unmarshal(raw, &payload); err != nil {
			return raw, false, err
		}
	}
	if len(payload.Sources) == 0 {
		return raw, false, nil
	}
	removed := false
	filtered := make([]providerModelSource, 0, len(payload.Sources))
	for _, item := range payload.Sources {
		if item.IntegrationID == integrationID && item.Source == sourceType {
			removed = true
			continue
		}
		filtered = append(filtered, item)
	}
	payload.Sources = filtered
	encoded, _ := json.Marshal(payload)
	return datatypes.JSON(encoded), removed, nil
}

func extractSources(raw datatypes.JSON) []providerModelSource {
	payload := providerModelCapabilities{}
	if len(raw) > 0 && string(raw) != "null" {
		_ = json.Unmarshal(raw, &payload)
	}
	return payload.Sources
}

func capabilitySourceType(raw datatypes.JSON) string {
	payload := providerModelCapabilities{}
	if len(raw) > 0 && string(raw) != "null" {
		_ = json.Unmarshal(raw, &payload)
	}
	return payload.Source
}

func decodeModelOverrides(raw datatypes.JSON) []string {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var items []string
	_ = json.Unmarshal(raw, &items)
	return items
}

func ModelRegistrySources(raw datatypes.JSON) ([]providerModelSource, error) {
	payload := providerModelCapabilities{}
	if len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, fmt.Errorf("decode model registry capabilities: %w", err)
	}
	return payload.Sources, nil
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
