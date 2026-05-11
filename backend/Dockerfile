FROM golang:1.23-alpine AS builder

WORKDIR /src
COPY backend/go.mod ./
RUN go mod download

COPY backend/. .
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/server ./cmd/server
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/worker ./cmd/worker

FROM alpine:3.20

WORKDIR /app
RUN apk add --no-cache ca-certificates
COPY --from=builder /out/server /app/server
COPY --from=builder /out/worker /app/worker

EXPOSE 8080
ENTRYPOINT ["/app/server"]
