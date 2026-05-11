# AI Gateway

High-performance AI API Gateway built with Go, PostgreSQL, Redis, Next.js, and nginx. The system exposes OpenAI-compatible endpoints while routing requests to OpenAI, Google Gemini, and Anthropic Claude. It focuses only on API transit, schema normalization, key management, proxy routing, model sync, fallback, and self-hosted monitoring.

The project intentionally excludes payment, recharge, token sales, balance, subscription, and billing logic.

## Features

- OpenAI-compatible API surface: `/v1/chat/completions`, `/v1/embeddings`, `/v1/images/generations`, `/v1/models`
- Provider adapters for OpenAI, Gemini, and Claude with provider fallback
- API key management with rotate, disable, delete, per-key rate limit, and allowed-model policy
- Multi-user system with `admin` and `user` roles
- Google OAuth and GitHub OAuth integration in backend, with local credential login as the default console entry
- Proxy node pool with HTTP and SOCKS5 support
- Provider key pool with priority, round-robin, and least-used strategies
- Model registry sync worker
- Redis-backed rate limiting
- Self-hosted monitoring dashboard without Grafana
- Dockerized deployment with nginx as the only public entry point
- nginx reverse proxy optimized for frontend SSR, OpenAI-compatible APIs, streaming responses, and long-lived requests

## Project Structure

```text
ai-gateway/
|-- backend/
|   |-- cmd/server
|   |-- cmd/worker
|   |-- internal/
|   |   |-- api
|   |   |-- auth
|   |   |-- config
|   |   |-- db
|   |   |-- middleware
|   |   |-- models
|   |   |-- providers
|   |   |-- proxy
|   |   |-- router
|   |   |-- services
|   |   `-- workers
|   |-- migrations/
|   `-- pkg/openai
|-- frontend/
|   |-- components
|   |-- lib
|   |-- pages
|   `-- styles
|-- docker-compose.yml
|-- nginx/
`-- .env.example
```

## Deployment

1. Copy the environment template.

```bash
cp .env.example .env
```

2. Fill in provider keys, OAuth credentials, and JWT secret.
   By default, `DB_AUTO_MIGRATE=false`, so the backend will use the SQL schema from `backend/migrations/001_init.sql` instead of mutating constraints at runtime.

3. Start the full stack.

```bash
docker compose up -d
```

Service after boot:

- Unified gateway entry: `http://localhost:8080`

Only nginx is exposed publicly. Frontend, API, PostgreSQL, and Redis stay inside the Docker network.

Default admin credentials come from `.env`:

- Email: `ADMIN_EMAIL`
- Password: `ADMIN_PASSWORD`

## Architecture Notes

- Backend framework: Gin
- Edge gateway: Nginx
- Database: PostgreSQL
- Cache and rate limiting: Redis
- Admin UI: Next.js + React + Tailwind CSS
- Monitoring: custom dashboard backed by `usage_logs`
- Provider routing: model registry first, naming heuristics second
- Fallback: next provider key, then next provider
- Runtime health checks: nginx, frontend, and API all expose container health probes in Docker Compose
- Schema strategy: PostgreSQL is initialized from SQL files; GORM auto-migration is disabled by default to avoid constraint-name drift

## Main APIs

### Authentication

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/oauth/google/login`
- `GET /api/auth/oauth/github/login`

### Admin APIs

- `GET /api/admin/users`
- `GET /api/admin/api-keys`
- `GET /api/admin/provider-keys`
- `GET /api/admin/proxy-nodes`
- `GET /api/admin/models`
- `POST /api/admin/models/sync`
- `GET /api/admin/usage`
- `GET /api/admin/monitoring/overview`

### OpenAI-Compatible APIs

- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/embeddings`
- `POST /v1/images/generations`

## Example Requests

### Chat Completions

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer YOUR_GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Write a haiku about gateways."}
    ],
    "stream": false
  }'
```

### Streaming Chat

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer YOUR_GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -N \
  -d '{
    "model": "claude-3-5-sonnet-latest",
    "messages": [{"role": "user", "content": "Stream a short answer."}],
    "stream": true
  }'
```

### Embeddings

```bash
curl http://localhost:8080/v1/embeddings \
  -H "Authorization: Bearer YOUR_GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "gateway observability"
  }'
```

### Image Generation

```bash
curl http://localhost:8080/v1/images/generations \
  -H "Authorization: Bearer YOUR_GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-1",
    "prompt": "A network gateway floating above a neon city",
    "size": "1024x1024"
  }'
```

### OpenAI SDK Example

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.GATEWAY_API_KEY,
  baseURL: "http://localhost:8080/v1",
});

const completion = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Hello gateway" }],
});

console.log(completion.choices[0].message.content);
```

## Database Schema

The initial PostgreSQL schema is in [backend/migrations/001_init.sql](/d:/DEV%20PROJET/ai-gateway/backend/migrations/001_init.sql).

Core tables:

- `users`
- `api_keys`
- `oauth_accounts`
- `proxy_nodes`
- `provider_keys`
- `model_registry`
- `usage_logs`

## Operational Notes

- `provider_keys.base_url` allows OpenAI-compatible APIs and local LLM servers to plug into the same adapter.
- The worker process periodically syncs upstream model catalogs into `model_registry`.
- `usage_logs` power the dashboard for request volume, token usage, provider latency, error rate, and proxy latency.
- API keys are stored as SHA-256 hashes in the `key` column. The raw key is only returned at create and rotate time.
- The homepage now uses a direct local login flow and does not show third-party sign-in buttons.
- nginx proxies `/`, `/_next/*` to the frontend and `/api/*`, `/v1/*`, `/health` to the backend.
- `/v1/*` on nginx is configured for streaming compatibility with disabled proxy buffering and longer read timeouts.

## Troubleshooting

If `http://localhost:8080` still does not open after rebuild, check service health first:

```bash
docker compose ps
docker compose logs nginx --tail=100
docker compose logs frontend --tail=100
docker compose logs api --tail=100
```

Expected healthy path through the stack:

- Browser -> `nginx:80`
- nginx -> `frontend:3000` for pages and static assets
- nginx -> `api:8080` for `/api/*`, `/v1/*`, `/health`

## Known Limits

- Gemini image generation uses the Gemini multimodal generate-content flow and expects image-capable Gemini models.
- Anthropic embeddings are not exposed because Anthropic does not currently offer an equivalent embeddings API in this gateway.
- The current environment did not include local Go or Node toolchains, so the code was prepared statically and not compiled in-place here.
