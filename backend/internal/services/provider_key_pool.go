package services

import (
	"context"
	"fmt"
	"sync/atomic"

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
		var proxyNode *models.ProxyNode
		if key.ProxyID != nil && *key.ProxyID != "" {
			node := models.ProxyNode{}
			if err := p.db.WithContext(ctx).First(&node, "id = ? AND status = ?", *key.ProxyID, "active").Error; err == nil {
				proxyNode = &node
			}
		}
		routes = append(routes, providers.Route{
			Provider:    provider,
			Model:       model,
			ProviderKey: key,
			ProxyNode:   proxyNode,
		})
	}
	return routes, nil
}

func (p *ProviderKeyPool) MarkUsage(ctx context.Context, providerKeyID string) {
	_ = p.db.WithContext(ctx).Model(&models.ProviderKey{}).Where("id = ?", providerKeyID).UpdateColumn("usage_count", gorm.Expr("usage_count + 1")).Error
}
