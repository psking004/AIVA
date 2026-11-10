"""AIVA Integrations - Loopback OAuth Token Broker.

Implements zero-password OAuth 2.0 PKCE authorization flows for GitHub and Google Workspace.
Runs an ephemeral local callback server, exchanges authorization codes directly for tokens,
stores them into SecureCredentialVault, and auto-refreshes tokens before expiration.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import secrets
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, ClassVar

from aiva.security.vault import SecureCredentialVault

logger = logging.getLogger("aiva.integrations.oauth_broker")

DEFAULT_CALLBACK_HOST = "127.0.0.1"
DEFAULT_CALLBACK_PORT = 8765
DEFAULT_EXPIRY_HEADROOM_SEC = 300.0  # Auto-refresh if within 5 minutes of expiration


class OAuthCallbackHandler(BaseHTTPRequestHandler):
    """Ephemeral handler receiving OAuth redirect callbacks."""

    server: OAuthCallbackServer

    def log_message(self, format: str, *args: Any) -> None:
        """Silence standard stderr access logs."""

    def do_GET(self) -> None:
        parsed_url = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed_url.query)

        if "code" in params:
            self.server.auth_code = params["code"][0]
            self.server.state = params.get("state", [""])[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<html><body><h2>Authentication Successful</h2><p>You may close this tab.</p></body></html>")
        elif "error" in params:
            self.server.error = params["error"][0]
            self.send_response(400)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<html><body><h2>Authentication Failed</h2></body></html>")
        else:
            self.send_response(404)
            self.end_headers()

        # Shutdown server immediately in a separate thread so response completes
        threading.Thread(target=self.server.shutdown, daemon=True).start()


class OAuthCallbackServer(HTTPServer):
    """Single-request callback HTTP server."""

    def __init__(self, server_address: tuple[str, int]) -> None:
        self.auth_code: str | None = None
        self.state: str | None = None
        self.error: str | None = None
        super().__init__(server_address, OAuthCallbackHandler)


class OAuthBroker:
    """Manages PKCE OAuth2 flows, credential injection, and auto-refresh."""

    SERVICE_CONFIGS: ClassVar[dict[str, dict[str, str]]] = {
        "github": {
            "auth_endpoint": "https://github.com/login/oauth/authorize",
            "token_endpoint": "https://github.com/login/oauth/access_token",
            "default_scope": "repo,user,workflow",
        },
        "google": {
            "auth_endpoint": "https://accounts.google.com/o/oauth2/v2/auth",
            "token_endpoint": "https://oauth2.googleapis.com/token",
            "default_scope": "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.modify",
        },
    }

    def __init__(
        self,
        vault: SecureCredentialVault,
        callback_port: int = DEFAULT_CALLBACK_PORT,
    ) -> None:
        self.vault = vault
        self.callback_port = callback_port
        self._token_metadata: dict[str, dict[str, Any]] = {}

    @staticmethod
    def generate_pkce_pair() -> tuple[str, str]:
        """Generate high-entropy PKCE code_verifier and code_challenge (S256)."""
        verifier = secrets.token_urlsafe(64)
        digest = hashlib.sha256(verifier.encode("ascii")).digest()
        challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
        return verifier, challenge

    def get_authorization_url(
        self,
        service: str,
        client_id: str,
        code_challenge: str,
        state: str,
        scope: str | None = None,
    ) -> str:
        """Construct OAuth2 authorization URL with PKCE parameters."""
        cfg = self.SERVICE_CONFIGS.get(service.lower())
        if not cfg:
            raise ValueError(f"Unsupported service '{service}'. Supported: {list(self.SERVICE_CONFIGS.keys())}")

        redirect_uri = f"http://{DEFAULT_CALLBACK_HOST}:{self.callback_port}/callback"
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": scope or cfg["default_scope"],
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
        if service.lower() == "google":
            params["access_type"] = "offline"
            params["prompt"] = "consent"

        return f"{cfg['auth_endpoint']}?{urllib.parse.urlencode(params)}"

    def listen_for_callback(self, timeout_sec: float = 60.0) -> str:
        """Start ephemeral loopback server, await authorization code, and return code."""
        server = OAuthCallbackServer((DEFAULT_CALLBACK_HOST, self.callback_port))
        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()

        start_time = time.time()
        while server.auth_code is None and server.error is None:
            if time.time() - start_time > timeout_sec:
                server.shutdown()
                server.server_close()
                raise TimeoutError(f"OAuth callback timed out after {timeout_sec}s.")
            time.sleep(0.1)

        server.server_close()
        if server.error:
            raise RuntimeError(f"OAuth authorization failed with error: {server.error}")
        if not server.auth_code:
            raise RuntimeError("OAuth callback completed without receiving an authorization code.")

        return server.auth_code

    def exchange_code_for_tokens(
        self,
        service: str,
        client_id: str,
        client_secret: str,
        code: str,
        code_verifier: str,
    ) -> dict[str, Any]:
        """Exchange authorization code for access and refresh tokens, securely storing in vault."""
        cfg = self.SERVICE_CONFIGS.get(service.lower())
        if not cfg:
            raise ValueError(f"Unsupported service '{service}'.")

        redirect_uri = f"http://{DEFAULT_CALLBACK_HOST}:{self.callback_port}/callback"
        post_data = {
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "code_verifier": code_verifier,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        }
        body = urllib.parse.urlencode(post_data).encode("utf-8")
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        }

        req = urllib.request.Request(cfg["token_endpoint"], data=body, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=15.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        return self.store_token_response(service, data)

    def store_token_response(self, service: str, token_data: dict[str, Any]) -> dict[str, Any]:
        """Store access and refresh tokens directly into vault under opaque handles."""
        service_key = service.lower()
        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        expires_in = token_data.get("expires_in", 3600)
        expires_at = time.time() + float(expires_in)

        if not access_token:
            raise ValueError(f"Token response for '{service}' did not contain 'access_token'. Response: {token_data}")

        # Store tokens under opaque handles
        access_handle = f"vault://oauth/{service_key}/access_token"
        self.vault.store_secret(access_handle, access_token)

        refresh_handle = f"vault://oauth/{service_key}/refresh_token"
        if refresh_token:
            self.vault.store_secret(refresh_handle, refresh_token)

        self._token_metadata[service_key] = {
            "expires_at": expires_at,
            "scope": token_data.get("scope", ""),
            "has_refresh": bool(refresh_token),
        }

        return {
            "service": service_key,
            "access_token_handle": access_handle,
            "refresh_token_handle": refresh_handle if refresh_token else None,
            "expires_at": expires_at,
        }

    def is_token_expired(self, service: str) -> bool:
        """Check if access token is expired or within headroom window (300 seconds)."""
        meta = self._token_metadata.get(service.lower())
        if not meta:
            return True
        return time.time() >= (meta["expires_at"] - DEFAULT_EXPIRY_HEADROOM_SEC)

    def refresh_access_token(
        self,
        service: str,
        client_id: str,
        client_secret: str,
    ) -> dict[str, Any]:
        """Use refresh token from vault to acquire a fresh access token without user prompt."""
        service_key = service.lower()
        refresh_handle = f"vault://oauth/{service_key}/refresh_token"
        if not self.vault.contains(refresh_handle):
            raise KeyError(f"No refresh token found in vault for service '{service}'.")

        refresh_token = self.vault.get_secret(refresh_handle)
        cfg = self.SERVICE_CONFIGS.get(service_key)
        if not cfg:
            raise ValueError(f"Unsupported service '{service}'.")

        post_data = {
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
        body = urllib.parse.urlencode(post_data).encode("utf-8")
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        }

        req = urllib.request.Request(cfg["token_endpoint"], data=body, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=15.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        return self.store_token_response(service, data)

    def get_valid_token_handle(
        self,
        service: str,
        client_id: str | None = None,
        client_secret: str | None = None,
    ) -> str:
        """Return the opaque handle to a valid access token, auto-refreshing if near expiration."""
        service_key = service.lower()
        access_handle = f"vault://oauth/{service_key}/access_token"
        if not self.vault.contains(access_handle):
            raise KeyError(f"No access token stored for '{service}'. Run authentication flow first.")

        if self.is_token_expired(service_key) and client_id and client_secret:
            logger.info("Access token for '%s' near expiration. Initiating background refresh.", service_key)
            self.refresh_access_token(service_key, client_id, client_secret)

        return access_handle
