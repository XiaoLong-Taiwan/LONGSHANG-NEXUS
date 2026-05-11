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
	response, err := jsonRequest(ctx, http.MethodPost, p.baseURL(route)+"/v1/chat/completions", req, map[string]string{
		"Authorization": "Bearer " + route.ProviderKey.APIKey,
	}, p.timeout, route.ProxyNode)
	if err != nil {
		return nil, err
	}

	var parsed openai.ChatCompletionResponse
	return &parsed, copyJSONResponse(response, &parsed)
}

func (p *OpenAIProvider) StreamChatCompletions(ctx context.Context, route Route, req openai.ChatCompletionRequest, writer http.ResponseWriter) error {
	req.Stream = true
	response, err := jsonRequest(ctx, http.MethodPost, p.baseURL(route)+"/v1/chat/completions", req, map[string]string{
		"Authorization": "Bearer " + route.ProviderKey.APIKey,
		"Accept":        "text/event-stream",
	}, p.timeout, route.ProxyNode)
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
	response, err := jsonRequest(ctx, http.MethodPost, p.baseURL(route)+"/v1/embeddings", req, map[string]string{
		"Authorization": "Bearer " + route.ProviderKey.APIKey,
	}, p.timeout, route.ProxyNode)
	if err != nil {
		return nil, err
	}

	var parsed openai.EmbeddingResponse
	return &parsed, copyJSONResponse(response, &parsed)
}

func (p *OpenAIProvider) ImageGeneration(ctx context.Context, route Route, req openai.ImageGenerationRequest) (*openai.ImageGenerationResponse, error) {
	response, err := jsonRequest(ctx, http.MethodPost, p.baseURL(route)+"/v1/images/generations", req, map[string]string{
		"Authorization": "Bearer " + route.ProviderKey.APIKey,
	}, p.timeout, route.ProxyNode)
	if err != nil {
		return nil, err
	}

	var parsed openai.ImageGenerationResponse
	return &parsed, copyJSONResponse(response, &parsed)
}

func (p *OpenAIProvider) ListModels(ctx context.Context, route Route) (*openai.ModelListResponse, error) {
	response, err := jsonRequest(ctx, http.MethodGet, p.baseURL(route)+"/v1/models", nil, map[string]string{
		"Authorization": "Bearer " + route.ProviderKey.APIKey,
	}, p.timeout, route.ProxyNode)
	if err != nil {
		return nil, err
	}

	var parsed openai.ModelListResponse
	return &parsed, copyJSONResponse(response, &parsed)
}

func (p *OpenAIProvider) baseURL(route Route) string {
	if route.ProviderKey.BaseURL != "" {
		return strings.TrimRight(route.ProviderKey.BaseURL, "/")
	}
	return p.defaultBaseURL
}

func decodeOpenAIError(body []byte) error {
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err == nil {
		return fmt.Errorf("%v", payload)
	}
	return fmt.Errorf("%s", string(body))
}
