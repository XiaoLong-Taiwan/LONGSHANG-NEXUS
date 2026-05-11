package providers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"ai-gateway/backend/pkg/openai"
)

type GeminiProvider struct {
	timeout time.Duration
}

func NewGeminiProvider(timeout time.Duration) *GeminiProvider {
	return &GeminiProvider{timeout: timeout}
}

func (p *GeminiProvider) Name() string { return "gemini" }

func (p *GeminiProvider) ChatCompletions(ctx context.Context, route Route, req openai.ChatCompletionRequest) (*openai.ChatCompletionResponse, error) {
	response, err := jsonRequest(ctx, http.MethodPost, p.endpoint(route.Model, "generateContent", route.ProviderKey.APIKey), p.toGeminiRequest(req), nil, p.timeout, route.ProxyNode)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	var payload geminiGenerateResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, err
	}

	text := payload.text()
	usage := payload.UsageMetadata
	return &openai.ChatCompletionResponse{
		ID:      "gemini-" + fmt.Sprint(time.Now().UnixNano()),
		Object:  "chat.completion",
		Created: time.Now().Unix(),
		Model:   route.Model,
		Choices: []openai.ChatCompletionChoice{{
			Index:        0,
			Message:      openai.Message{Role: "assistant", Content: text},
			FinishReason: "stop",
		}},
		Usage: openai.Usage{
			PromptTokens:     usage.PromptTokenCount,
			CompletionTokens: usage.CandidatesTokenCount,
			TotalTokens:      usage.TotalTokenCount,
		},
	}, nil
}

func (p *GeminiProvider) StreamChatCompletions(ctx context.Context, route Route, req openai.ChatCompletionRequest, writer http.ResponseWriter) error {
	response, err := jsonRequest(ctx, http.MethodPost, p.endpoint(route.Model, "streamGenerateContent?alt=sse", route.ProviderKey.APIKey), p.toGeminiRequest(req), nil, p.timeout, route.ProxyNode)
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
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "" || data == "[DONE]" {
			continue
		}

		var payload geminiGenerateResponse
		if err := json.Unmarshal([]byte(data), &payload); err != nil {
			continue
		}
		text := payload.text()
		if text == "" {
			continue
		}

		chunk := openai.ChatCompletionResponse{
			ID:      "gemini-stream",
			Object:  "chat.completion.chunk",
			Created: time.Now().Unix(),
			Model:   route.Model,
			Choices: []openai.ChatCompletionChoice{{
				Index: 0,
				Delta: &openai.Message{Role: "assistant", Content: text},
			}},
		}
		encoded, _ := json.Marshal(chunk)
		_, _ = writer.Write([]byte("data: " + string(encoded) + "\n\n"))
		flusher.Flush()
	}

	finalChunk := openai.ChatCompletionResponse{
		ID:      "gemini-stream",
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

	return scanner.Err()
}

func (p *GeminiProvider) Embeddings(ctx context.Context, route Route, req openai.EmbeddingRequest) (*openai.EmbeddingResponse, error) {
	body := map[string]any{
		"content": map[string]any{
			"parts": []map[string]any{{"text": stringifyContent(req.Input)}},
		},
	}
	response, err := jsonRequest(ctx, http.MethodPost, p.endpoint(route.Model, "embedContent", route.ProviderKey.APIKey), body, nil, p.timeout, route.ProxyNode)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	var payload struct {
		Embedding struct {
			Values []float64 `json:"values"`
		} `json:"embedding"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, err
	}

	return &openai.EmbeddingResponse{
		Object: "list",
		Model:  route.Model,
		Data: []openai.EmbeddingData{{
			Object:    "embedding",
			Embedding: payload.Embedding.Values,
			Index:     0,
		}},
	}, nil
}

func (p *GeminiProvider) ImageGeneration(ctx context.Context, route Route, req openai.ImageGenerationRequest) (*openai.ImageGenerationResponse, error) {
	body := map[string]any{
		"contents": []map[string]any{{
			"role": "user",
			"parts": []map[string]any{{
				"text": req.Prompt,
			}},
		}},
		"generationConfig": map[string]any{
			"responseModalities": []string{"TEXT", "IMAGE"},
		},
	}
	response, err := jsonRequest(ctx, http.MethodPost, p.endpoint(route.Model, "generateContent", route.ProviderKey.APIKey), body, nil, p.timeout, route.ProxyNode)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	var payload geminiGenerateResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, err
	}

	data := []openai.ImageData{}
	for _, candidate := range payload.Candidates {
		for _, part := range candidate.Content.Parts {
			if inlineData, ok := part["inlineData"].(map[string]any); ok {
				if encoded, ok := inlineData["data"].(string); ok {
					data = append(data, openai.ImageData{B64JSON: encoded})
				}
			}
		}
	}
	return &openai.ImageGenerationResponse{
		Created: time.Now().Unix(),
		Data:    data,
	}, nil
}

func (p *GeminiProvider) ListModels(ctx context.Context, route Route) (*openai.ModelListResponse, error) {
	endpoint := "https://generativelanguage.googleapis.com/v1beta/models?key=" + url.QueryEscape(route.ProviderKey.APIKey)
	response, err := jsonRequest(ctx, http.MethodGet, endpoint, nil, nil, p.timeout, route.ProxyNode)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	var payload struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, err
	}

	items := make([]openai.ModelInfo, 0, len(payload.Models))
	for _, item := range payload.Models {
		items = append(items, openai.ModelInfo{
			ID:      strings.TrimPrefix(item.Name, "models/"),
			Object:  "model",
			OwnedBy: "google",
		})
	}
	return &openai.ModelListResponse{Object: "list", Data: items}, nil
}

func (p *GeminiProvider) endpoint(model, method, apiKey string) string {
	separator := "?"
	if strings.Contains(method, "?") {
		separator = "&"
	}
	return fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:%s%skey=%s", model, method, separator, url.QueryEscape(apiKey))
}

func (p *GeminiProvider) toGeminiRequest(req openai.ChatCompletionRequest) map[string]any {
	contents := make([]map[string]any, 0, len(req.Messages))
	systemParts := []string{}
	for _, message := range req.Messages {
		if message.Role == "system" {
			systemParts = append(systemParts, stringifyContent(message.Content))
			continue
		}
		role := "user"
		if message.Role == "assistant" {
			role = "model"
		}
		contents = append(contents, map[string]any{
			"role": role,
			"parts": []map[string]any{{
				"text": stringifyContent(message.Content),
			}},
		})
	}

	body := map[string]any{
		"contents": contents,
		"generationConfig": map[string]any{
			"temperature":     req.Temperature,
			"topP":            req.TopP,
			"maxOutputTokens": maxInt(256, req.MaxTokens),
		},
	}
	if len(systemParts) > 0 {
		body["systemInstruction"] = map[string]any{
			"parts": []map[string]any{{"text": strings.Join(systemParts, "\n")}},
		}
	}
	return body
}

type geminiGenerateResponse struct {
	Candidates []struct {
		Content struct {
			Parts []map[string]any `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
	UsageMetadata struct {
		PromptTokenCount     int `json:"promptTokenCount"`
		CandidatesTokenCount int `json:"candidatesTokenCount"`
		TotalTokenCount      int `json:"totalTokenCount"`
	} `json:"usageMetadata"`
}

func (g geminiGenerateResponse) text() string {
	parts := []string{}
	for _, candidate := range g.Candidates {
		for _, part := range candidate.Content.Parts {
			if text, ok := part["text"].(string); ok {
				parts = append(parts, text)
			}
		}
	}
	return strings.Join(parts, "")
}
