package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type User struct {
	ID           string    `gorm:"primaryKey;size:36" json:"id"`
	Email        string    `gorm:"uniqueIndex;not null" json:"email"`
	PasswordHash string    `gorm:"not null" json:"-"`
	Role         string    `gorm:"not null;default:user" json:"role"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type APIKey struct {
	ID            string         `gorm:"primaryKey;size:36" json:"id"`
	UserID        string         `gorm:"index;not null" json:"user_id"`
	Key           string         `gorm:"column:key;not null" json:"-"`
	KeyPreview    string         `gorm:"size:32;not null" json:"key_preview"`
	Status        string         `gorm:"index;not null;default:active" json:"status"`
	RateLimit     int            `json:"rate_limit"`
	AllowedModels datatypes.JSON `gorm:"type:jsonb" json:"allowed_models"`
	ProxyID       *string        `gorm:"index" json:"proxy_id"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
}

type OAuthAccount struct {
	ID           string    `gorm:"primaryKey;size:36" json:"id"`
	Provider     string    `gorm:"index;not null" json:"provider"`
	UserID       string    `gorm:"index;not null" json:"user_id"`
	AccessToken  string    `gorm:"type:text" json:"access_token"`
	RefreshToken string    `gorm:"type:text" json:"refresh_token"`
	ProxyID      *string   `gorm:"index" json:"proxy_id"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type ProxyNode struct {
	ID        string    `gorm:"primaryKey;size:36" json:"id"`
	Type      string    `gorm:"index;not null" json:"type"`
	Host      string    `gorm:"not null" json:"host"`
	Port      int       `json:"port"`
	Username  string    `json:"username"`
	Password  string    `json:"password"`
	Region    string    `gorm:"index" json:"region"`
	Latency   int64     `json:"latency"`
	Status    string    `gorm:"index;default:active" json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type ProviderKey struct {
	ID         string    `gorm:"primaryKey;size:36" json:"id"`
	Provider   string    `gorm:"index;not null" json:"provider"`
	APIKey     string    `gorm:"type:text;not null" json:"api_key"`
	BaseURL    string    `json:"base_url"`
	Priority   int       `gorm:"default:100" json:"priority"`
	UsageCount int64     `gorm:"default:0" json:"usage_count"`
	ProxyID    *string   `gorm:"index" json:"proxy_id"`
	Status     string    `gorm:"index;default:active" json:"status"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type ModelRegistry struct {
	ID           string         `gorm:"primaryKey;size:36" json:"id"`
	Provider     string         `gorm:"index;not null" json:"provider"`
	ModelName    string         `gorm:"index;not null" json:"model_name"`
	Type         string         `gorm:"index" json:"type"`
	Priority     int            `gorm:"default:100" json:"priority"`
	Status       string         `gorm:"index;default:active" json:"status"`
	LastChecked  time.Time      `json:"last_checked"`
	Capabilities datatypes.JSON `gorm:"type:jsonb" json:"capabilities"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
}

type UsageLog struct {
	ID               string    `gorm:"primaryKey;size:36" json:"id"`
	APIKeyID         *string   `gorm:"index" json:"api_key_id"`
	Provider         string    `gorm:"index" json:"provider"`
	Model            string    `gorm:"index" json:"model"`
	Tokens           int       `json:"tokens"`
	PromptTokens     int       `json:"prompt_tokens"`
	CompletionTokens int       `json:"completion_tokens"`
	Latency          int64     `json:"latency"`
	StatusCode       int       `json:"status_code"`
	ErrorMessage     string    `json:"error_message"`
	ProxyID          *string   `gorm:"index" json:"proxy_id"`
	CreatedAt        time.Time `gorm:"index" json:"created_at"`
}

func (m *User) BeforeCreate(_ *gorm.DB) error           { return ensureID(&m.ID) }
func (m *APIKey) BeforeCreate(_ *gorm.DB) error         { return ensureID(&m.ID) }
func (m *OAuthAccount) BeforeCreate(_ *gorm.DB) error   { return ensureID(&m.ID) }
func (m *ProxyNode) BeforeCreate(_ *gorm.DB) error      { return ensureID(&m.ID) }
func (m *ProviderKey) BeforeCreate(_ *gorm.DB) error    { return ensureID(&m.ID) }
func (m *ModelRegistry) BeforeCreate(_ *gorm.DB) error  { return ensureID(&m.ID) }
func (m *UsageLog) BeforeCreate(_ *gorm.DB) error       { return ensureID(&m.ID) }

func ensureID(id *string) error {
	if *id == "" {
		*id = uuid.NewString()
	}
	return nil
}

func (ModelRegistry) TableName() string {
	return "model_registry"
}
