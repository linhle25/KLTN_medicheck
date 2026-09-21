from types import SimpleNamespace

import pytest

from src.config import validate_production_auth_settings


def _production_settings(**overrides):
    values = {
        "app_env": "production",
        "secret_key": "s" * 32,
        "cookie_secure": True,
        "google_client_id": "google-client-id",
        "smtp_host": "smtp.example.com",
        "smtp_from": "noreply@example.com",
        "smtp_username": "smtp-user",
        "smtp_password": "smtp-password",
        "smtp_starttls": True,
        "smtp_ssl": False,
        "gmail_oauth_client_id": "",
        "gmail_oauth_client_secret": "",
        "gmail_oauth_refresh_token": "",
        "frontend_url": "https://app.example.com",
        "cors_origins": "https://app.example.com",
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_valid_production_auth_settings():
    validate_production_auth_settings(_production_settings())


@pytest.mark.parametrize(
    "overrides",
    [
        {"frontend_url": "http://app.example.com"},
        {"cors_origins": "*"},
        {"cors_origins": "https://other.example.com"},
        {"smtp_starttls": True, "smtp_ssl": True},
        {"smtp_password": ""},
    ],
)
def test_invalid_production_auth_settings(overrides):
    with pytest.raises(RuntimeError):
        validate_production_auth_settings(_production_settings(**overrides))
