package providers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"ai-gateway/backend/pkg/openai"
)

type OpenAIProvider struct {
	defaultBaseURL string
	timeout        time.Duration
}

func NewOpenAIProvider(baseURL string, timeout time.Duration) *OpenAIProvider {
	return &OpenAIProvider{defaultBaseURL: strings.TrimRight(baseURL, "/"), timeout: timeout}
}

func (p *OpenAIProvider) Name() string { return "openai" }

func (p *OpenAIProvider) ChatCompletions(ctx context.Context, route Route, req openai.ChatCompletionRequest) (*openai.ChatCompletionResponse, error) {
	response, err := p.openAIRequest(ctx, http.MethodPost, route, "/chat/completions", req, map[string]string{
		"Authorization": "Bearer " + route.Credential,
	})
	if err != nil {
		return nil, err
	}

	var parsed openai.ChatCompletionResponse
	return &parsed, copyJSONResponse(response, &parsed)
}

func (p *OpenAIProvider) StreamChatCompletions(ctx context.Context, route Route, req openai.ChatCompletionRequest, writer http.ResponseWriter) error {
	req.Stream = true
	response, err := p.openAIRequest(ctx, http.MethodPost, route, "/chat/completions", req, map[string]string{
		"Authorization": "Bearer " + route.Credential,
		"Accept":        "text/event-stream",
	})
	if err != nil {
		return err
	}
	defer response.Body.Close()

	writer.Header().Set("Content-Type", "text/event-stream")
	writer.Header().Set("Cache-Control", "no-cache")
	writer.WriteHeader(http.StatusOK)

	_, err = io.Copy(writer, response.Body)
	return err
}

func (p *OpenAIProvider) Embeddings(ctx context.Context, route Route, req openai.EmbeddingRequest) (*openai.EmbeddingResponse, error) {
	response, err := p.openAIRequest(ctx, http.MethodPost, route, "/embeddings", req, map[string]string{
		"Authorization": "Bearer " + route.Credential,
	})
	if err != nil {
		return nil, err
	}

	var parsed openai.EmbeddingResponse
	return &parsed, copyJSONResponse(response, &parsed)
}

func (p *OpenAIProvider) ImageGeneration(ctx context.Context, route Route, req openai.ImageGenerationRequest) (*openai.ImageGenerationResponse, error) {
	response, err := p.openAIRequest(ctx, http.MethodPost, route, "/images/generations", req, map[string]string{
		"Authorization": "Bearer " + route.Credential,
	})
	if err != nil {
		return nil, err
	}

	var parsed openai.ImageGenerationResponse
	return &parsed, copyJSONResponse(response, &parsed)
}

func (p *OpenAIProvider) ListModels(ctx context.Context, route Route) (*openai.ModelListResponse, error) {
	response, err := p.openAIRequest(ctx, http.MethodGet, route, "/models", nil, map[string]string{
		"Authorization": "Bearer " + route.Credential,
	})
	if err != nil {
		return nil, err
	}

	var parsed openai.ModelListResponse
	return &parsed, copyJSONResponse(response, &parsed)
}

func (p *OpenAIProvider) baseURL(route Route) string {
	if route.ProviderKey.BaseURL != "" {
		return normalizeOpenAIBaseURL(route.ProviderKey.BaseURL)
	}
	return normalizeOpenAIBaseURL(p.defaultBaseURL)
}

func (p *OpenAIProvider) v1URL(route Route) string {
	base := p.baseURL(route)
	if strings.HasSuffix(base, "/v1") {
		return base
	}
	return base + "/v1"
}

func (p *OpenAIProvider) openAIRequest(ctx context.Context, method string, route Route, path string, body any, headers map[string]string) (*http.Response, error) {
	primary := p.v1URL(route) + path
	response, err := jsonRequest(ctx, method, primary, body, headers, p.timeout, route.ProxyNode)
	if err == nil || !shouldTryNextEndpoint(err) {
		return response, err
	}

	fallback := p.baseURL(route) + path
	if fallback == primary {
		return nil, err
	}
	response, fallbackErr := jsonRequest(ctx, method, fallback, body, headers, p.timeout, route.ProxyNode)
	if fallbackErr == nil {
		return response, nil
	}
	return nil, fmt.Errorf("%w; fallback endpoint %s failed: %s", err, fallback, fallbackErr.Error())
}

func normalizeOpenAIBaseURL(value string) string {
	base := strings.TrimRight(strings.TrimSpace(value), "/")
	if base == "" {
		return base
	}
	for _, suffix := range []string{
		"/chat/completions",
		"/completions",
		"/embeddings",
		"/images/generations",
		"/models",
	} {
		if strings.HasSuffix(base, suffix) {
			base = strings.TrimRight(strings.TrimSuffix(base, suffix), "/")
		}
	}
	return base
}

func decodeOpenAIError(body []byte) error {
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err == nil {
		return fmt.Errorf("%v", payload)
	}
	return fmt.Errorf("%s", string(body))
}
