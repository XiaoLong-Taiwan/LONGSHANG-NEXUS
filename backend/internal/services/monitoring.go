package services

import (
	"context"
	"time"

	"gorm.io/gorm"
)

type MonitoringService struct {
	db *gorm.DB
}

func NewMonitoringService(db *gorm.DB) *MonitoringService {
	return &MonitoringService{db: db}
}

func (s *MonitoringService) Overview(ctx context.Context) (map[string]any, error) {
	now := time.Now()
	since := now.Add(-24 * time.Hour)

	var totals struct {
		Requests      int64   `json:"requests"`
		Tokens        int64   `json:"tokens"`
		AvgLatency    float64 `json:"avg_latency"`
		P95Latency    float64 `json:"p95_latency"`
		Errors        int64   `json:"errors"`
		RPM           float64 `json:"rpm"`
		TPM           float64 `json:"tpm"`
		SuccessRate   float64 `json:"success_rate"`
		PromptTokens  int64   `json:"prompt_tokens"`
		CompletionTokens int64 `json:"completion_tokens"`
	}
	if err := s.db.WithContext(ctx).Raw(`
		SELECT
			COUNT(*) AS requests,
			COALESCE(SUM(tokens), 0) AS tokens,
			COALESCE(AVG(latency), 0) AS avg_latency,
			COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency), 0) AS p95_latency,
			COALESCE(SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END), 0) AS errors,
			COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
			COALESCE(SUM(completion_tokens), 0) AS completion_tokens
		FROM usage_logs
		WHERE created_at >= ?
	`, since).Scan(&totals).Error; err != nil {
		return nil, err
	}
	totals.RPM = float64(totals.Requests) / (24 * 60)
	totals.TPM = float64(totals.Tokens) / (24 * 60)
	if totals.Requests > 0 {
		totals.SuccessRate = float64(totals.Requests-totals.Errors) / float64(totals.Requests)
	}

	var providerStats []map[string]any
	if err := s.db.WithContext(ctx).Raw(`
		SELECT provider, COUNT(*) AS requests, COALESCE(AVG(latency), 0) AS avg_latency,
		       COALESCE(SUM(tokens), 0) AS tokens,
		       COALESCE(SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END), 0) AS errors
		FROM usage_logs
		WHERE created_at >= ?
		GROUP BY provider
		ORDER BY requests DESC
	`, since).Scan(&providerStats).Error; err != nil {
		return nil, err
	}

	var proxyStats []map[string]any
	if err := s.db.WithContext(ctx).Raw(`
		SELECT COALESCE(proxy_id::text, 'direct') AS proxy_id, COUNT(*) AS requests, COALESCE(AVG(latency), 0) AS avg_latency
		FROM usage_logs
		WHERE created_at >= ?
		GROUP BY COALESCE(proxy_id::text, 'direct')
		ORDER BY requests DESC
	`, since).Scan(&proxyStats).Error; err != nil {
		return nil, err
	}

	var timeline []map[string]any
	if err := s.db.WithContext(ctx).Raw(`
		SELECT to_char(date_trunc('hour', created_at), 'YYYY-MM-DD HH24:00') AS bucket,
		       COUNT(*) AS requests,
		       COALESCE(SUM(tokens), 0) AS tokens,
		       COALESCE(AVG(latency), 0) AS avg_latency
		FROM usage_logs
		WHERE created_at >= ?
		GROUP BY bucket
		ORDER BY bucket
	`, since).Scan(&timeline).Error; err != nil {
		return nil, err
	}

	var modelStats []map[string]any
	if err := s.db.WithContext(ctx).Raw(`
		SELECT model, COUNT(*) AS requests, COALESCE(SUM(tokens), 0) AS tokens
		FROM usage_logs
		WHERE created_at >= ?
		GROUP BY model
		ORDER BY requests DESC
		LIMIT 20
	`, since).Scan(&modelStats).Error; err != nil {
		return nil, err
	}

	return map[string]any{
		"window_start": since,
		"window_end":   now,
		"totals":       totals,
		"provider_stats": providerStats,
		"proxy_stats":  proxyStats,
		"timeline":     timeline,
		"model_stats":  modelStats,
	}, nil
}
