package auth

import (
	"fmt"

	"ai-gateway/backend/internal/config"

	"golang.org/x/oauth2"
	githuboauth "golang.org/x/oauth2/github"
	googleoauth "golang.org/x/oauth2/google"
)

func GoogleConfig(cfg config.Config) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     cfg.GoogleClientID,
		ClientSecret: cfg.GoogleClientSecret,
		RedirectURL:  fmt.Sprintf("%s/api/auth/oauth/google/callback", cfg.OAuthRedirectBaseURL),
		Scopes:       []string{"openid", "email", "profile"},
		Endpoint:     googleoauth.Endpoint,
	}
}

func GitHubConfig(cfg config.Config) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     cfg.GitHubClientID,
		ClientSecret: cfg.GitHubClientSecret,
		RedirectURL:  fmt.Sprintf("%s/api/auth/oauth/github/callback", cfg.OAuthRedirectBaseURL),
		Scopes:       []string{"read:user", "user:email"},
		Endpoint:     githuboauth.Endpoint,
	}
}
