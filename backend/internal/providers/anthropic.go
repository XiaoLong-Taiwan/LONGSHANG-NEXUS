package providers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"ai-gateway/backend/pkg/openai"
)

type AnthropicProvider struct {
	timeout time.Duration
}

func NewAnthropicProvider(timeout time.Duration) *AnthropicProvider {
	return &AnthropicProvider{timeout: timeout}
}

func (p *AnthropicProvider) Name() string { return "anthropic" }

func (p *AnthropicProvider) ChatCompletions(ctx context.Context, route Route, req openai.ChatCompletionRequest) (*openai.ChatCompletionResponse, error) {
	body := p.toAnthropicRequest(req, false)
	response, err := jsonRequest(ctx, http.MethodPost, "https://api.anthropic.com/v1/messages", body, map[string]string{
		"x-api-key":         route.ProviderKey.APIKey,
		"anthropic-version": "2023-06-01",
	}, p.timeout, route.ProxyNode)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	var payload struct {
		ID      string `json:"id"`
		Model   string `json:"model"`
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		Usage struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
		StopReason string `json:"stop_reason"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, err
	}

	texts := make([]string, 0, len(payload.Content))
	for _, item := range payload.Content {
		if item.Text != "" {
			texts = append(texts, item.Text)
		}
	}

	return &openai.ChatCompletionResponse{
		ID:      payload.ID,
		Object:  "chat.completion",
		Created: time.Now().Unix(),
		Model:   route.Model,
		Choices: []openai.ChatCompletionChoice{{
			Index:        0,
			Message:      openai.Message{Role: "assistant", Content: strings.Join(texts, "")},
			FinishReason: payload.StopReason,
		}},
		Usage: openai.Usage{
			PromptTokens:     payload.Usage.InputTokens,
			CompletionTokens: payload.Usage.OutputTokens,
			TotalTokens:      payload.Usage.InputTokens + payload.Usage.OutputTokens,
		},
	}, nil
}

func (p *AnthropicProvider) StreamChatCompletions(ctx context.Context, route Route, req openai.ChatCompletionRequest, writer http.ResponseWriter) error {
	body := p.toAnthropicRequest(req, true)
	response, err := jsonRequest(ctx, http.MethodPost, "https://api.anthropic.com/v1/messages", body, map[string]string{
		"x-api-key":         route.ProviderKey.APIKey,
		"anthropic-version": "2023-06-01",
		"Accept":            "text/event-stream",
	}, p.timeout, route.ProxyNode)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	flusher, ok := writer.(http.Flusher)
	if !ok {
		return fmt.Errorf("streaming not supported by writer")
	}

	writer.Header().Set("Content-Type", "text/event-stream")
	writer.Header().Set("Cache-Control", "no-cache")
	writer.WriteHeader(http.StatusOK)

	scanner := bufio.NewScanner(response.Body)
	event := ""
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "event: ") {
			event = strings.TrimPrefix(line, "event: ")
			continue
		}
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			_, _ = writer.Write([]byte("data: [DONE]\n\n"))
			flusher.Flush()
			break
		}

		switch event {
		case "content_block_delta":
			var payload struct {
				Delta struct {
					Text string `json:"text"`
				} `json:"delta"`
			}
			if err := json.Unmarshal([]byte(data), &payload); err == nil && payload.Delta.Text != "" {
				chunk := openai.ChatCompletionResponse{
					ID:      "anthropic-stream",
					Object:  "chat.completion.chunk",
					Created: time.Now().Unix(),
					Model:   route.Model,
					Choices: []openai.ChatCompletionChoice{{
						Index: 0,
						Delta: &openai.Message{Role: "assistant", Content: payload.Delta.Text},
					}},
				}
				encoded, _ := json.Marshal(chunk)
				_, _ = writer.Write([]byte("data: " + string(encoded) + "\n\n"))
				flusher.Flush()
			}
		case "message_stop":
			finalChunk := openai.ChatCompletionResponse{
				ID:      "anthropic-stream",
				Object:  "chat.completion.chunk",
				Created: time.Now().Unix(),
				Model:   route.Model,
				Choices: []openai.ChatCompletionChoice{{
					Index:        0,
					Delta:        &openai.Message{},
					FinishReason: "stop",
				}},
			}
			encoded, _ := json.Marshal(finalChunk)
			_, _ = writer.Write([]byte("data: " + string(encoded) + "\n\n"))
			_, _ = writer.Write([]byte("data: [DONE]\n\n"))
			flusher.Flush()
		}
	}
	return scanner.Err()
}

func (p *AnthropicProvider) Embeddings(context.Context, Route, openai.EmbeddingRequest) (*openai.EmbeddingResponse, error) {
	return nil, fmt.Errorf("anthropic does not provide embeddings in this gateway")
}

func (p *AnthropicProvider) ImageGeneration(context.Context, Route, openai.ImageGenerationRequest) (*openai.ImageGenerationResponse, error) {
	return nil, fmt.Errorf("anthropic does not provide image generation in this gateway")
}

func (p *AnthropicProvider) ListModels(ctx context.Context, route Route) (*openai.ModelListResponse, error) {
	response, err := jsonRequest(ctx, http.MethodGet, "https://api.anthropic.com/v1/models", nil, map[string]string{
		"x-api-key":         route.ProviderKey.APIKey,
		"anthropic-version": "2023-06-01",
	}, p.timeout, route.ProxyNode)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	var payload struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, err
	}

	items := make([]openai.ModelInfo, 0, len(payload.Data))
	for _, item := range payload.Data {
		items = append(items, openai.ModelInfo{
			ID:      item.ID,
			Object:  "model",
			OwnedBy: "anthropic",
		})
	}

	return &openai.ModelListResponse{Object: "list", Data: items}, nil
}

func (p *AnthropicProvider) toAnthropicRequest(req openai.ChatCompletionRequest, stream bool) map[string]any {
	messages := make([]map[string]any, 0, len(req.Messages))
	systemParts := []string{}

	for _, message := range req.Messages {
		if message.Role == "system" {
			systemParts = append(systemParts, stringifyContent(message.Content))
			continue
		}
		role := message.Role
		if role != "assistant" {
			role = "user"
		}
		messages = append(messages, map[string]any{
			"role": role,
			"content": []map[string]any{{
				"type": "text",
				"text": stringifyContent(message.Content),
			}},
		})
	}

	body := map[string]any{
		"model":      req.Model,
		"messages":   messages,
		"max_tokens": maxInt(256, req.MaxTokens),
		"stream":     stream,
	}
	if len(systemParts) > 0 {
		body["system"] = strings.Join(systemParts, "\n")
	}
	if req.Temperature > 0 {
		body["temperature"] = req.Temperature
	}
	return body
}
