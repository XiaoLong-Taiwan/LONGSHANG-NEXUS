package proxy

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"time"

	"ai-gateway/backend/internal/models"

	xproxy "golang.org/x/net/proxy"
)

func NewHTTPClient(timeout time.Duration, proxyNode *models.ProxyNode) (*http.Client, error) {
	transport := &http.Transport{
		Proxy:               nil,
		DialContext:         (&net.Dialer{Timeout: timeout}).DialContext,
		TLSHandshakeTimeout: 15 * time.Second,
	}

	if proxyNode != nil {
		switch proxyNode.Type {
		case "http":
			proxyURL := &url.URL{
				Scheme: "http",
				Host:   fmt.Sprintf("%s:%d", proxyNode.Host, proxyNode.Port),
			}
			if proxyNode.Username != "" {
				proxyURL.User = url.UserPassword(proxyNode.Username, proxyNode.Password)
			}
			transport.Proxy = http.ProxyURL(proxyURL)
		case "socks5":
			var auth *xproxy.Auth
			if proxyNode.Username != "" {
				auth = &xproxy.Auth{User: proxyNode.Username, Password: proxyNode.Password}
			}
			dialer, err := xproxy.SOCKS5("tcp", fmt.Sprintf("%s:%d", proxyNode.Host, proxyNode.Port), auth, &net.Dialer{Timeout: timeout})
			if err != nil {
				return nil, err
			}
			transport.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
				return dialer.Dial(network, addr)
			}
		}
	}

	return &http.Client{
		Timeout:   timeout,
		Transport: transport,
	}, nil
}
