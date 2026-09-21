from functools import lru_cache
from typing import Literal
from urllib.parse import urlparse

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_name: str = "MediCheck"
    app_env: Literal["development", "production", "test"] = "development"
    app_port: int = Field(default=8000, ge=1, le=65535)
    app_host: str = "0.0.0.0"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    cors_origins: str = "http://localhost:3000"
    frontend_url: str = "http://localhost:3000"

    # LLM
    openai_api_key: str = ""
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    model_name: str = "deepseek-chat"
    # Giảm từ 0.7 -> 0.3 (01/09, sau khi metric consistency + subagent-judge cho
    # thấy 0.7 khiến LLM thỉnh thoảng "sáng tạo" thêm câu khuyên xử trí/liều lượng
    # mà 2/3 lần sinh lại không có - docs/evaluation.md mục Consistency).
    # Vẫn > 0 để giữ chút đa dạng cách diễn đạt (tránh lặp y hệt 1 câu công thức,
    # xem docstring SAFETY_RULES/style prompt trong tone_prompt.py/rollup_explain.py)
    # nhưng giảm mạnh biên độ "phăng" ra ngoài nguồn.
    llm_temperature: float = Field(default=0.3, ge=0.0, le=2.0)

    # Database
    database_url: str = "sqlite:///./data/app.db"
    # DB "facts" (interactions/food_interactions/disease_interactions) - tuỳ chọn
    # tách sang 1 DB Postgres-compatible riêng khi hạ tầng chính có giới hạn dung
    # lượng (3 bảng này chiếm >95% dung lượng). Rỗng -> fallback dùng database_url
    # (mặc định, phù hợp 1 Postgres/SQLite local duy nhất). Xem docs/database-split.md.
    database_url_facts: str = ""

    # Auth (token HMAC tự ký - xem src/services/auth.py; đổi secret_key khi deploy that)
    secret_key: str = "dev-secret-change-me"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    cookie_domain: str | None = None
    google_client_id: str = ""
    enable_demo_accounts: bool = False

    # Transactional email. In development/test, missing SMTP settings emit a
    # warning without logging one-time verification/reset credentials.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = Field(
        default="",
        validation_alias=AliasChoices("SMTP_FROM", "SMTP_FROM_EMAIL"),
    )
    smtp_from_name: str = ""
    smtp_starttls: bool = Field(
        default=True,
        validation_alias=AliasChoices("SMTP_STARTTLS", "SMTP_USE_TLS"),
    )
    smtp_ssl: bool = False
    smtp_timeout_seconds: int = Field(default=15, ge=1, le=60)
    smtp_max_retries: int = Field(default=3, ge=1, le=5)
    smtp_retry_delay_seconds: float = Field(default=1.0, ge=0, le=10)

    # Gmail API (OAuth) - alternate transport for transactional email, used
    # instead of SMTP on hosts (e.g. Render) that block outbound SMTP at the
    # network level. When gmail_oauth_refresh_token is set, src/services/email.py
    # sends via the Gmail API over HTTPS instead of smtplib.
    gmail_oauth_client_id: str = ""
    gmail_oauth_client_secret: str = ""
    gmail_oauth_refresh_token: str = ""

    # Vector Store
    chroma_persist_dir: str = "./data/chroma"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def validate_production_auth_settings(settings: Settings) -> None:
    if settings.app_env != "production":
        return
    problems: list[str] = []
    if settings.secret_key == "dev-secret-change-me" or len(settings.secret_key) < 32:
        problems.append("SECRET_KEY phai la gia tri ngau nhien it nhat 32 ky tu")
    if not settings.cookie_secure:
        problems.append("COOKIE_SECURE phai bat trong production")
    if not settings.google_client_id:
        problems.append("GOOGLE_CLIENT_ID chua duoc cau hinh")
    has_gmail_api = bool(
        settings.gmail_oauth_client_id
        and settings.gmail_oauth_client_secret
        and settings.gmail_oauth_refresh_token
    )
    has_smtp = bool(settings.smtp_host and settings.smtp_from)
    if not has_gmail_api and not has_smtp:
        problems.append("Can cau hinh SMTP_HOST/SMTP_FROM hoac GMAIL_OAUTH_* de gui duoc email")
    if not has_gmail_api:
        if settings.smtp_username and not settings.smtp_password:
            problems.append("SMTP_PASSWORD bat buoc khi co SMTP_USERNAME")
        if settings.smtp_starttls and settings.smtp_ssl:
            problems.append("Chi duoc bat mot trong SMTP_STARTTLS hoac SMTP_SSL")

    frontend = urlparse(settings.frontend_url)
    if frontend.scheme != "https" or not frontend.netloc:
        problems.append("FRONTEND_URL phai la URL HTTPS hop le trong production")

    origins = [origin.strip().rstrip("/") for origin in settings.cors_origins.split(",") if origin.strip()]
    if not origins:
        problems.append("CORS_ORIGINS khong duoc de trong")
    for origin in origins:
        parsed = urlparse(origin)
        if origin == "*" or parsed.scheme != "https" or not parsed.netloc or parsed.path not in {"", "/"}:
            problems.append(f"CORS origin khong hop le cho production: {origin}")
    frontend_origin = f"{frontend.scheme}://{frontend.netloc}" if frontend.scheme and frontend.netloc else ""
    if frontend_origin and frontend_origin not in origins:
        problems.append("CORS_ORIGINS phai chua origin cua FRONTEND_URL")
    if problems:
        raise RuntimeError("Cau hinh auth production khong hop le: " + "; ".join(problems))
