from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.db.models import AuthActionToken, Base, RefreshSession, User
from src.services import auth


def test_argon2_and_legacy_password_verification():
    encoded = auth.hash_password("correct-horse-battery")
    assert encoded.startswith("$argon2")
    assert auth.verify_password("correct-horse-battery", encoded)
    assert not auth.verify_password("wrong", encoded)

    # Known legacy PBKDF2 shape remains readable and is marked for rehash.
    import hashlib
    salt = "00" * 16
    digest = hashlib.pbkdf2_hmac("sha256", b"legacy-password", bytes.fromhex(salt), 100_000).hex()
    legacy = f"{salt}${digest}"
    assert auth.verify_password("legacy-password", legacy)
    assert auth.password_needs_rehash(legacy)


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class _FakeAsyncClient:
    """Gia lap httpx.AsyncClient - tra ve tokeninfo_resp cho goi
    oauth2.googleapis.com/tokeninfo, userinfo_resp (mac dinh rong/200) cho goi
    www.googleapis.com/oauth2/v3/userinfo. verify_google_credential() goi ca 2
    API that qua tokeninfo + userinfo, khong con verify JWT offline nua."""

    def __init__(self, tokeninfo_resp: _FakeResponse, userinfo_resp: _FakeResponse | None = None):
        self.tokeninfo_resp = tokeninfo_resp
        self.userinfo_resp = userinfo_resp or _FakeResponse(200, {})

    def __call__(self, *args, **kwargs):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url, params=None, headers=None):
        if "tokeninfo" in url:
            return self.tokeninfo_resp
        return self.userinfo_resp


@pytest.mark.asyncio
async def test_google_claim_validation(monkeypatch):
    monkeypatch.setattr(auth, "get_settings", lambda: SimpleNamespace(google_client_id="client-123"))
    valid = {"sub": "subject", "email": "user@gmail.com", "email_verified": True, "aud": "client-123"}

    monkeypatch.setattr(auth.httpx, "AsyncClient", _FakeAsyncClient(_FakeResponse(200, valid.copy())))
    assert (await auth.verify_google_credential("access-token"))["sub"] == "subject"

    for changed in (
        {"aud": "wrong"},
        {"email_verified": False},
        {"sub": None},
    ):
        claims = valid | changed
        monkeypatch.setattr(auth.httpx, "AsyncClient", _FakeAsyncClient(_FakeResponse(200, claims)))
        with pytest.raises(ValueError):
            await auth.verify_google_credential("access-token")

    # Access token het han/khong hop le -> Google tra ve status != 200.
    monkeypatch.setattr(auth.httpx, "AsyncClient", _FakeAsyncClient(_FakeResponse(400, {})))
    with pytest.raises(ValueError):
        await auth.verify_google_credential("access-token")


def test_action_and_refresh_tokens_reject_stale_concurrent_claims(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'atomic-auth.db'}")
    factory = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    Base.metadata.create_all(engine)
    action_raw = "action-token-value-that-is-long-enough"
    refresh_raw = "refresh-token-value-that-is-long-enough"

    with factory() as db:
        user = User(
            ho_ten="Atomic User",
            email="atomic@example.com",
            email_normalized="atomic@example.com",
            email_verified_at=datetime.utcnow(),
            mat_khau_hash=auth.hash_password("atomic-password"),
            vai_tro="patient",
            account_status="active",
        )
        db.add(user)
        db.flush()
        db.add(AuthActionToken(
            user_id=user.id,
            purpose="verify_email",
            token_hash=auth.hash_token(action_raw),
            expires_at=datetime.utcnow() + timedelta(minutes=30),
        ))
        db.add(RefreshSession(
            user_id=user.id,
            token_hash=auth.hash_token(refresh_raw),
            expires_at=datetime.utcnow() + timedelta(days=1),
        ))
        db.commit()

    first = factory()
    stale = factory()
    try:
        # Load the same rows into both identity maps before the first claim.
        first.query(AuthActionToken).one()
        stale.query(AuthActionToken).one()
        first.query(RefreshSession).one()
        stale.query(RefreshSession).one()

        assert auth.consume_action_token(first, action_raw, "verify_email") is not None
        first.commit()
        assert auth.consume_action_token(stale, action_raw, "verify_email") is None

        assert auth.rotate_refresh_session(first, refresh_raw) is not None
        assert auth.rotate_refresh_session(stale, refresh_raw) is None
    finally:
        first.close()
        stale.close()

    with factory() as db:
        action = db.query(AuthActionToken).one()
        old_refresh = db.query(RefreshSession).filter_by(token_hash=auth.hash_token(refresh_raw)).one()
        assert action.used_at is not None
        assert old_refresh.revoked_at is not None
        assert old_refresh.replaced_by_id is not None
        assert db.query(RefreshSession).count() == 2
    engine.dispose()
