package workers

import (
	"context"
	"log"
	"time"

	"ai-gateway/backend/internal/services"
)

func StartModelSyncLoop(ctx context.Context, interval time.Duration, syncer *services.ModelSyncService) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		if err := syncer.SyncAll(ctx); err != nil {
			log.Printf("model sync failed: %v", err)
		}

		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
