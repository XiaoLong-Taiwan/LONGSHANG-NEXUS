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
	ID                string         `gorm:"primaryKey;size:36" json:"id"`
	Provider          string         `gorm:"index;not null" json:"provider"`
	Name              string         `gorm:"not null;default:''" json:"name"`
	Email             string         `gorm:"not null;default:''" json:"email"`
	ProviderAccountID string         `gorm:"column:provider_account_id;not null;default:''" json:"provider_account_id"`
	UserID            string         `gorm:"index;not null" json:"user_id"`
	AccessToken       string         `gorm:"type:text" json:"access_token"`
	RefreshToken      string         `gorm:"type:text" json:"refresh_token"`
	ProxyID           *string        `gorm:"index" json:"proxy_id"`
	Status            string         `gorm:"index;not null;default:active" json:"status"`
	QuotaUsed         float64        `gorm:"default:0" json:"quota_used"`
	QuotaTotal        float64        `gorm:"default:0" json:"quota_total"`
	QuotaUnit         string         `gorm:"not null;default:''" json:"quota_unit"`
	LastQuotaCheck    *time.Time     `json:"last_quota_check"`
	Notes             string         `gorm:"type:text;not null;default:''" json:"notes"`
	Metadata          datatypes.JSON `gorm:"type:jsonb;default:'{}'" json:"metadata"`
	CreatedAt         time.Time      `json:"created_at"`
	UpdatedAt         time.Time      `json:"updated_at"`
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
	ID                   string         `gorm:"primaryKey;size:36" json:"id"`
	Name                 string         `gorm:"not null;default:''" json:"name"`
	Description          string         `gorm:"type:text;default:''" json:"description"`
	Provider             string         `gorm:"index;not null" json:"provider"`
	APIKey               string         `gorm:"type:text;not null" json:"api_key"`
	APIKeys              datatypes.JSON `gorm:"type:jsonb;default:'[]'" json:"api_keys"`
	AuthMode             string         `gorm:"not null;default:api_key" json:"auth_mode"`
	OAuthAccountID       *string        `gorm:"column:oauth_account_id;index" json:"oauth_account_id"`
	BaseURL              string         `json:"base_url"`
	AccessMode           string         `gorm:"not null;default:round_robin" json:"access_mode"`
	Priority             int            `gorm:"default:100" json:"priority"`
	UsageCount           int64          `gorm:"default:0" json:"usage_count"`
	ProxyID              *string        `gorm:"index" json:"proxy_id"`
	Status               string         `gorm:"index;default:active" json:"status"`
	ModelDetectionEnabled bool          `gorm:"default:true" json:"model_detection_enabled"`
	ModelOverrides       datatypes.JSON `gorm:"column:model_overrides;type:jsonb;default:'[]'" json:"model_overrides"`
	TestModel            string         `gorm:"not null;default:''" json:"test_model"`
	CreatedAt            time.Time      `json:"created_at"`
	UpdatedAt            time.Time      `json:"updated_at"`
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

type ModelMapping struct {
	ID            string    `gorm:"primaryKey;size:36" json:"id"`
	PublicModel   string    `gorm:"column:public_model;index;not null" json:"public_model"`
	Provider      string    `gorm:"index;not null" json:"provider"`
	UpstreamModel string    `gorm:"column:upstream_model;not null" json:"upstream_model"`
	Type          string    `gorm:"index;not null;default:chat" json:"type"`
	ProviderKeyID *string   `gorm:"column:provider_key_id;index" json:"provider_key_id"`
	Priority      int       `gorm:"default:100" json:"priority"`
	Status        string    `gorm:"index;default:active" json:"status"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
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

type GatewaySetting struct {
	Key       string         `gorm:"primaryKey;size:64" json:"key"`
	Value     datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'" json:"value"`
	UpdatedAt time.Time      `json:"updated_at"`
}

func (m *User) BeforeCreate(_ *gorm.DB) error           { return ensureID(&m.ID) }
func (m *APIKey) BeforeCreate(_ *gorm.DB) error         { return ensureID(&m.ID) }
func (m *OAuthAccount) BeforeCreate(_ *gorm.DB) error   { return ensureID(&m.ID) }
func (m *ProxyNode) BeforeCreate(_ *gorm.DB) error      { return ensureID(&m.ID) }
func (m *ProviderKey) BeforeCreate(_ *gorm.DB) error    { return ensureID(&m.ID) }
func (m *ModelRegistry) BeforeCreate(_ *gorm.DB) error  { return ensureID(&m.ID) }
func (m *ModelMapping) BeforeCreate(_ *gorm.DB) error   { return ensureID(&m.ID) }
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

func (ModelMapping) TableName() string {
	return "model_mappings"
}

func (OAuthAccount) TableName() string {
	return "oauth_accounts"
}

func (GatewaySetting) TableName() string {
	return "gateway_settings"
}
