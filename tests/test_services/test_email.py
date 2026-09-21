from types import SimpleNamespace

from src.services import email as email_service


def test_smtp_uses_verified_tls_and_retries(monkeypatch):
    settings = SimpleNamespace(
        smtp_host="smtp.example.com",
        smtp_port=587,
        smtp_from="noreply@example.com",
        smtp_from_name="MediCheck",
        smtp_username="smtp-user",
        smtp_password="smtp-password",
        smtp_starttls=True,
        smtp_ssl=False,
        smtp_timeout_seconds=15,
        smtp_max_retries=2,
        smtp_retry_delay_seconds=0,
        app_env="test",
        gmail_oauth_refresh_token="",
    )
    monkeypatch.setattr(email_service, "get_settings", lambda: settings)
    tls_context = object()
    monkeypatch.setattr(email_service.ssl, "create_default_context", lambda: tls_context)
    calls = {"connections": 0, "sent": 0}

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            assert (host, port, timeout) == ("smtp.example.com", 587, 15)
            calls["connections"] += 1

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def starttls(self, *, context):
            assert context is tls_context

        def login(self, username, password):
            assert (username, password) == ("smtp-user", "smtp-password")

        def send_message(self, _message):
            if calls["connections"] == 1:
                raise OSError("temporary SMTP failure")
            calls["sent"] += 1

    monkeypatch.setattr(email_service.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(email_service.time, "sleep", lambda _: None)

    email_service._send("user@example.com", "Subject", "Text", "<p>HTML</p>")

    assert calls == {"connections": 2, "sent": 1}
