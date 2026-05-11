package services

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"sync/atomic"
	"time"

	"ai-gateway/backend/internal/models"
	"ai-gateway/backend/internal/providers"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

type ProviderKeyPool struct {
	db           *gorm.DB
	redis        *redis.Client
	roundRobinID uint64
}

func NewProviderKeyPool(db *gorm.DB, redis *redis.Client) *ProviderKeyPool {
	return &ProviderKeyPool{db: db, redis: redis}
}

func (p *ProviderKeyPool) RoutesForProvider(ctx context.Context, provider, model, strategy string) ([]providers.Route, error) {
	var keys []models.ProviderKey
	query := p.db.WithContext(ctx).Where("provider = ? AND status = ?", provider, "active")
	switch strategy {
	case "least-used":
		query = query.Order("usage_count asc, priority desc")
	case "round-robin":
		query = query.Order("priority desc, created_at asc")
	default:
		query = query.Order("priority desc, usage_count asc")
	}
	if err := query.Find(&keys).Error; err != nil {
		return nil, err
	}
	if len(keys) == 0 {
		return nil, fmt.Errorf("no active provider key for %s", provider)
	}

	if strategy == "round-robin" && len(keys) > 1 {
		start := int(atomic.AddUint64(&p.roundRobinID, 1) % uint64(len(keys)))
		keys = append(keys[start:], keys[:start]...)
	}

	routes := make([]providers.Route, 0, len(keys))
	for _, key := range keys {
		expanded, err := p.routesForIntegration(ctx, key, model, strategy)
		if err != nil {
			continue
		}
		routes = append(routes, expanded...)
	}
	if len(routes) == 0 {
		return nil, fmt.Errorf("no usable credentials for %s", provider)
	}
	return routes, nil
}

func (p *ProviderKeyPool) RoutesForIntegration(ctx context.Context, integrationID, model string) ([]providers.Route, error) {
	var key models.ProviderKey
	if err := p.db.WithContext(ctx).First(&key, "id = ? AND status = ?", integrationID, "active").Error; err != nil {
		return nil, err
	}
	return p.routesForIntegration(ctx, key, model, key.AccessMode)
}

func (p *ProviderKeyPool) MarkUsage(ctx context.Context, providerKeyID string) {
	_ = p.db.WithContext(ctx).Model(&models.ProviderKey{}).Where("id = ?", providerKeyID).UpdateColumn("usage_count", gorm.Expr("usage_count + 1")).Error
}

func (p *ProviderKeyPool) routesForIntegration(ctx context.Context, key models.ProviderKey, model, fallbackStrategy string) ([]providers.Route, error) {
	proxyNode := p.proxyNode(ctx, key.ProxyID)
	credentials, err := p.credentialsForIntegration(ctx, key)
	if err != nil {
		return nil, err
	}
	if len(credentials) == 0 {
		return nil, fmt.Errorf("integration %s has no available credentials", key.ID)
	}

	mode := key.AccessMode
	if mode == "" {
		mode = fallbackStrategy
	}
	credentials = reorderCredentials(credentials, mode, &p.roundRobinID)

	routes := make([]providers.Route, 0, len(credentials))
	for _, credential := range credentials {
		routes = append(routes, providers.Route{
			Provider:    key.Provider,
			Model:       model,
			ProviderKey: key,
			ProxyNode:   proxyNode,
			Credential:  credential,
		})
	}
	return routes, nil
}

func (p *ProviderKeyPool) proxyNode(ctx context.Context, proxyID *string) *models.ProxyNode {
	if proxyID == nil || *proxyID == "" {
		return nil
	}
	node := models.ProxyNode{}
	if err := p.db.WithContext(ctx).First(&node, "id = ? AND status = ?", *proxyID, "active").Error; err == nil {
		return &node
	}
	return nil
}

func (p *ProviderKeyPool) credentialsForIntegration(ctx context.Context, key models.ProviderKey) ([]string, error) {
	switch key.AuthMode {
	case "oauth_account":
		if key.OAuthAccountID == nil || *key.OAuthAccountID == "" {
			return nil, fmt.Errorf("oauth auth mode requires oauth_account_id")
		}
		account := models.OAuthAccount{}
		if err := p.db.WithContext(ctx).First(&account, "id = ?", *key.OAuthAccountID).Error; err != nil {
			return nil, err
		}
		if account.AccessToken == "" {
			return nil, fmt.Errorf("oauth account has empty access token")
		}
		return []string{account.AccessToken}, nil
	default:
		var items []string
		if len(key.APIKeys) > 0 && string(key.APIKeys) != "null" {
			_ = json.Unmarshal(key.APIKeys, &items)
		}
		if len(items) == 0 && key.APIKey != "" {
			items = []string{key.APIKey}
		}
		filtered := make([]string, 0, len(items))
		for _, item := range items {
			if item != "" {
				filtered = append(filtered, item)
			}
		}
		return filtered, nil
	}
}

func reorderCredentials(credentials []string, mode string, roundRobinID *uint64) []string {
	items := append([]string{}, credentials...)
	switch mode {
	case "random":
		randomizer := rand.New(rand.NewSource(time.Now().UnixNano()))
		randomizer.Shuffle(len(items), func(i, j int) {
			items[i], items[j] = items[j], items[i]
		})
	case "round_robin", "round-robin":
		if len(items) > 1 {
			start := int(atomic.AddUint64(roundRobinID, 1) % uint64(len(items)))
			items = append(items[start:], items[:start]...)
		}
	default:
	}
	return items
}
