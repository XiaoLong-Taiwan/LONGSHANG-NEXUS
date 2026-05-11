package providers

import (
	"bytes"
	"context"
	"encoding/json"
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
}

type Provider interface {
	Name() string
	ChatCompletions(ctx context.Context, route Route, req openai.ChatCompletionRequest) (*openai.ChatCompletionResponse, error)
	StreamChatCompletions(ctx context.Context, route Route, req openai.ChatCompletionRequest, writer http.ResponseWriter) error
	Embeddings(ctx context.Context, route Route, req openai.EmbeddingRequest) (*openai.EmbeddingResponse, error)
	ImageGeneration(ctx context.Context, route Route, req openai.ImageGenerationRequest) (*openai.ImageGenerationResponse, error)
	ListModels(ctx context.Context, route Route) (*openai.ModelListResponse, error)
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
	p, ok := m.providers[name]
	return p, ok
}

func jsonRequest(ctx context.Context, method, endpoint string, body any, headers map[string]string, timeout time.Duration, proxyNode *models.ProxyNode) (*http.Response, error) {
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewBuffer(payload)
	}

	client, err := proxy.NewHTTPClient(timeout, proxyNode)
	if err != nil {
		return nil, err
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
		return nil, err
	}

	if response.StatusCode >= 400 {
		defer response.Body.Close()
		body, _ := io.ReadAll(response.Body)
		return nil, fmt.Errorf("provider %s returned %d: %s", endpoint, response.StatusCode, string(body))
	}

	return response, nil
}

func copyJSONResponse[T any](response *http.Response, target *T) error {
	defer response.Body.Close()
	return json.NewDecoder(response.Body).Decode(target)
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
