package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"ai-gateway/backend/internal/models"
	"ai-gateway/backend/internal/proxy"
	"ai-gateway/backend/pkg/openai"
)

type Route struct {
	Provider    string
	Model       string
	ProviderKey models.ProviderKey
	ProxyNode   *models.ProxyNode
	Credential  string
}

type Provider interface {
	Name() string
	ChatCompletions(ctx context.Context, route Route, req openai.ChatCompletionRequest) (*openai.ChatCompletionResponse, error)
	StreamChatCompletions(ctx context.Context, route Route, req openai.ChatCompletionRequest, writer http.ResponseWriter) error
	Embeddings(ctx context.Context, route Route, req openai.EmbeddingRequest) (*openai.EmbeddingResponse, error)
	ImageGeneration(ctx context.Context, route Route, req openai.ImageGenerationRequest) (*openai.ImageGenerationResponse, error)
	ListModels(ctx context.Context, route Route) (*openai.ModelListResponse, error)
}

type ProviderHTTPError struct {
	Endpoint   string
	StatusCode int
	Body       string
}

func (e *ProviderHTTPError) Error() string {
	return fmt.Sprintf("provider %s returned %d: %s", e.Endpoint, e.StatusCode, e.Body)
}

type Manager struct {
	providers map[string]Provider
}

func NewManager(items ...Provider) *Manager {
	m := &Manager{providers: map[string]Provider{}}
	for _, provider := range items {
		m.providers[provider.Name()] = provider
	}
	return m
}

func (m *Manager) Get(name string) (Provider, bool) {
	switch name {
	case "openai-compatible", "local-llm", "deepseek", "mistral":
		name = "openai"
	}
	p, ok := m.providers[name]
	return p, ok
}

func jsonRequest(ctx context.Context, method, endpoint string, body any, headers map[string]string, timeout time.Duration, proxyNode *models.ProxyNode) (*http.Response, error) {
	var payload []byte
	var err error
	if body != nil {
		payload, err = json.Marshal(body)
		if err != nil {
			return nil, err
		}
	}

	client, err := proxy.NewHTTPClient(timeout, proxyNode)
	if err != nil {
		return nil, err
	}

	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(time.Duration(attempt) * 350 * time.Millisecond):
			}
		}

		var reader io.Reader
		if payload != nil {
			reader = bytes.NewReader(payload)
		}
		request, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
		if err != nil {
			return nil, err
		}
		request.Header.Set("Content-Type", "application/json")
		for key, value := range headers {
			request.Header.Set(key, value)
		}

		response, err := client.Do(request)
		if err != nil {
			lastErr = err
			if !isRetryableNetworkError(err) || attempt == 2 {
				return nil, err
			}
			continue
		}

		if response.StatusCode < 400 {
			return response, nil
		}

		body, _ := io.ReadAll(response.Body)
		_ = response.Body.Close()
		lastErr = &ProviderHTTPError{
			Endpoint:   endpoint,
			StatusCode: response.StatusCode,
			Body:       summarizeProviderError(response.Header.Get("Content-Type"), body),
		}
		if !isRetryableStatus(response.StatusCode) || attempt == 2 {
			return nil, lastErr
		}
	}

	return nil, lastErr
}

func shouldTryNextEndpoint(err error) bool {
	var httpErr *ProviderHTTPError
	if !errors.As(err, &httpErr) {
		return false
	}
	return httpErr.StatusCode == http.StatusNotFound || httpErr.StatusCode == http.StatusMethodNotAllowed
}

func isRetryableStatus(status int) bool {
	switch status {
	case http.StatusRequestTimeout, http.StatusConflict, http.StatusTooEarly, http.StatusTooManyRequests,
		http.StatusInternalServerError, http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout:
		return true
	default:
		return false
	}
}

func isRetryableNetworkError(err error) bool {
	if err == nil {
		return false
	}
	text := strings.ToLower(err.Error())
	return strings.Contains(text, "timeout") ||
		strings.Contains(text, "connection reset") ||
		strings.Contains(text, "connection refused") ||
		strings.Contains(text, "temporary") ||
		strings.Contains(text, "eof")
}

func copyJSONResponse[T any](response *http.Response, target *T) error {
	defer response.Body.Close()
	return json.NewDecoder(response.Body).Decode(target)
}

func summarizeProviderError(contentType string, body []byte) string {
	text := strings.TrimSpace(string(body))
	if strings.Contains(strings.ToLower(contentType), "text/html") || strings.Contains(text, "__NEXT_DATA__") {
		return "received an HTML page instead of a provider API response. Check the upstream API base URL; it may be pointing at the frontend/admin panel rather than the provider API endpoint"
	}
	if len(text) > 1200 {
		return text[:1200] + "...(truncated)"
	}
	return text
}

func stringifyContent(content any) string {
	switch value := content.(type) {
	case string:
		return value
	case []any:
		parts := make([]string, 0, len(value))
		for _, item := range value {
			if raw, ok := item.(map[string]any); ok {
				if text, ok := raw["text"].(string); ok {
					parts = append(parts, text)
				}
			}
		}
		return strings.Join(parts, "\n")
	default:
		payload, _ := json.Marshal(value)
		return string(payload)
	}
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
