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
	response, err := jsonRequest(ctx, http.MethodPost, p.v1URL(route)+"/chat/completions", req, map[string]string{
		"Authorization": "Bearer " + route.Credential,
	}, p.timeout, route.ProxyNode)
	if err != nil {
		return nil, err
	}

	var parsed openai.ChatCompletionResponse
	return &parsed, copyJSONResponse(response, &parsed)
}

func (p *OpenAIProvider) StreamChatCompletions(ctx context.Context, route Route, req openai.ChatCompletionRequest, writer http.ResponseWriter) error {
	req.Stream = true
	response, err := jsonRequest(ctx, http.MethodPost, p.v1URL(route)+"/chat/completions", req, map[string]string{
		"Authorization": "Bearer " + route.Credential,
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
	response, err := jsonRequest(ctx, http.MethodPost, p.v1URL(route)+"/embeddings", req, map[string]string{
		"Authorization": "Bearer " + route.Credential,
	}, p.timeout, route.ProxyNode)
	if err != nil {
		return nil, err
	}

	var parsed openai.EmbeddingResponse
	return &parsed, copyJSONResponse(response, &parsed)
}

func (p *OpenAIProvider) ImageGeneration(ctx context.Context, route Route, req openai.ImageGenerationRequest) (*openai.ImageGenerationResponse, error) {
	response, err := jsonRequest(ctx, http.MethodPost, p.v1URL(route)+"/images/generations", req, map[string]string{
		"Authorization": "Bearer " + route.Credential,
	}, p.timeout, route.ProxyNode)
	if err != nil {
		return nil, err
	}

	var parsed openai.ImageGenerationResponse
	return &parsed, copyJSONResponse(response, &parsed)
}

func (p *OpenAIProvider) ListModels(ctx context.Context, route Route) (*openai.ModelListResponse, error) {
	response, err := jsonRequest(ctx, http.MethodGet, p.v1URL(route)+"/models", nil, map[string]string{
		"Authorization": "Bearer " + route.Credential,
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

func (p *OpenAIProvider) v1URL(route Route) string {
	base := p.baseURL(route)
	if strings.HasSuffix(base, "/v1") {
		return base
	}
	return base + "/v1"
}

func decodeOpenAIError(body []byte) error {
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err == nil {
		return fmt.Errorf("%v", payload)
	}
	return fmt.Errorf("%s", string(body))
}
