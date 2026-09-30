from datetime import datetime

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.orm import sessionmaker

from src.api.deps import get_db
from src.db.models import AuthActionToken, AuthIdentity, Base, RefreshSession, User
from src.main import app
from src.services.auth import hash_password, issue_action_token
from tests.conftest import isolated_postgres_engine


@pytest_asyncio.fixture
async def auth_env(monkeypatch):
    with isolated_postgres_engine() as engine:
        factory = sessionmaker(bind=engine, autocommit=False, autoflush=False)
        Base.metadata.create_all(engine)

        def override_db():
            db = factory()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_db

        async def fake_google(credential: str):
            if credential == "invalid-google-token-value":
                raise ValueError("Google token không hợp lệ")
            suffix = credential.rsplit("-", 1)[-1]
            return {"sub": f"google-{suffix}", "email": f"google-{suffix}@gmail.com", "email_verified": True, "name": f"Google {suffix}", "aud": "test", "iss": "https://accounts.google.com"}

        monkeypatch.setattr("src.api.auth_routes.verify_google_credential", fake_google)
        transport = ASGITransport(app=app, client=("pytest-auth", 123))
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client, factory, transport
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_email_verification_cookie_rotation_logout_and_csrf(auth_env):
    client, factory, _ = auth_env
    await client.get("/api/v1/auth/csrf")
    email = "verified@example.com"
    registered = await client.post("/api/v1/auth/register", json={"ho_ten": "Nguoi Dung", "email": email, "mat_khau": "a-strong-password", "vai_tro": "patient"})
    assert registered.status_code == 202
    assert (await client.post("/api/v1/auth/login", json={"email": email, "mat_khau": "a-strong-password"})).status_code == 202

    with factory() as db:
        token = db.query(AuthActionToken).filter_by(purpose="verify_email").one()
        # The raw value is never persisted, so issue a replacement we can exercise.
        from src.services.auth import issue_action_token
        raw = issue_action_token(db, token.user_id, "verify_email", 60)
    verified = await client.post("/api/v1/auth/verify-email", json={"token": raw})
    assert verified.status_code == 200
    assert (await client.post("/api/v1/auth/verify-email", json={"token": raw})).status_code == 400

    logged_in = await client.post("/api/v1/auth/login", json={"email": email, "mat_khau": "a-strong-password"})
    assert logged_in.status_code == 200
    assert client.cookies.get("medguard_access")
    old_refresh = client.cookies.get("medguard_refresh")
    assert (await client.get("/api/v1/auth/me")).json()["email"] == email

    csrf = client.cookies.get("medguard_csrf")
    assert (await client.post("/api/v1/auth/refresh", headers={"X-CSRF-Token": csrf})).status_code == 200
    assert client.cookies.get("medguard_refresh") != old_refresh
    with factory() as db:
        assert db.query(RefreshSession).filter_by(token_hash=__import__("hashlib").sha256(old_refresh.encode()).hexdigest()).one().revoked_at is not None

    assert (await client.post("/api/v1/auth/logout")).status_code == 403
    assert (await client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf})).status_code == 204
    assert (await client.get("/api/v1/auth/me")).status_code == 401


@pytest.mark.asyncio
async def test_google_registration_invalid_token_and_password_link(auth_env):
    client, factory, transport = auth_env
    assert (await client.post("/api/v1/auth/google", json={"credential": "invalid-google-token-value"})).status_code == 401
    credential = "valid-google-newperson"
    required = await client.post("/api/v1/auth/google", json={"credential": credential})
    assert required.status_code == 202 and required.json()["code"] == "REGISTRATION_REQUIRED"
    created = await client.post("/api/v1/auth/google/complete-registration", json={"credential": credential, "vai_tro": "patient"})
    assert created.status_code == 200
    with factory() as db:
        assert db.query(AuthIdentity).filter_by(subject="google-newperson").count() == 1

    async with AsyncClient(transport=transport, base_url="http://test") as second:
        with factory() as db:
            email = "google-collision@gmail.com"
            db.add(User(ho_ten="Existing", email=email, email_normalized=email, email_verified_at=datetime.utcnow(), mat_khau_hash=hash_password("existing-password"), vai_tro="patient", account_status="active"))
            db.commit()
        collision_credential = "valid-google-collision"
        collision = await second.post("/api/v1/auth/google", json={"credential": collision_credential})
        assert collision.status_code == 409 and collision.json()["code"] == "ACCOUNT_LINK_REQUIRED"
        assert (await second.post("/api/v1/auth/google/link", json={"credential": collision_credential, "mat_khau": "wrong"})).status_code == 401
        assert (await second.post("/api/v1/auth/google/link", json={"credential": collision_credential, "mat_khau": "existing-password"})).status_code == 200
    with factory() as db:
        assert db.query(User).filter_by(email_normalized="google-collision@gmail.com").count() == 1


@pytest.mark.asyncio
async def test_google_link_only_reactivates_legacy_migration_locks(auth_env):
    client, factory, transport = auth_env
    password = "existing-password"
    with factory() as db:
        db.add_all([
                User(
                    ho_ten="Legacy Locked",
                    email="google-legacyuser@gmail.com",
                    email_normalized="google-legacyuser@gmail.com",
                mat_khau_hash=hash_password(password),
                vai_tro="patient",
                account_status="locked",
                lock_source="legacy_migration",
            ),
            User(
                ho_ten="Admin Locked",
                email="google-adminlocked@gmail.com",
                email_normalized="google-adminlocked@gmail.com",
                email_verified_at=datetime.utcnow(),
                mat_khau_hash=hash_password(password),
                vai_tro="patient",
                account_status="locked",
                lock_source="admin",
            ),
        ])
        db.commit()

    async with AsyncClient(transport=transport, base_url="http://test") as legacy_client:
        response = await legacy_client.post(
            "/api/v1/auth/google/link",
            json={"credential": "valid-google-legacyuser", "mat_khau": password},
        )
        assert response.status_code == 200

    async with AsyncClient(transport=transport, base_url="http://test") as locked_client:
        response = await locked_client.post(
            "/api/v1/auth/google/link",
            json={"credential": "valid-google-adminlocked", "mat_khau": password},
        )
        assert response.status_code == 423

    with factory() as db:
        legacy = db.query(User).filter_by(email_normalized="google-legacyuser@gmail.com").one()
        admin_locked = db.query(User).filter_by(email_normalized="google-adminlocked@gmail.com").one()
        assert legacy.account_status == "active"
        assert legacy.lock_source is None
        assert db.query(AuthIdentity).filter_by(user_id=legacy.id, provider="google").count() == 1
        assert admin_locked.account_status == "locked"
        assert admin_locked.lock_source == "admin"
        assert db.query(AuthIdentity).filter_by(user_id=admin_locked.id, provider="google").count() == 0


@pytest.mark.asyncio
async def test_pharmacist_waits_for_admin_approval(auth_env):
    client, factory, transport = auth_env
    pending = await client.post("/api/v1/auth/google/complete-registration", json={"credential": "valid-google-pharmacist", "vai_tro": "pharmacist", "so_chung_chi_hanh_nghe": "CCHN-123", "noi_cong_tac": "Bệnh viện A"})
    assert pending.status_code == 202
    with factory() as db:
        email = "admin@example.com"
        db.add(User(ho_ten="Admin", email=email, email_normalized=email, email_verified_at=datetime.utcnow(), mat_khau_hash=hash_password("admin-password-123"), vai_tro="admin", account_status="active"))
        db.commit()
        pharmacist_id = db.query(User).filter_by(email_normalized="google-pharmacist@gmail.com").one().id

    async with AsyncClient(transport=transport, base_url="http://test") as admin:
        await admin.get("/api/v1/auth/csrf")
        assert (await admin.post("/api/v1/auth/login", json={"email": "admin@example.com", "mat_khau": "admin-password-123"})).status_code == 200
        csrf = admin.cookies.get("medguard_csrf")
        listed = await admin.get("/api/v1/admin/pharmacists/pending")
        assert [item["user_id"] for item in listed.json()] == [pharmacist_id]
        assert (await admin.post(f"/api/v1/admin/pharmacists/{pharmacist_id}/approve", headers={"X-CSRF-Token": csrf})).status_code == 200
        assert (await admin.post(
            f"/api/v1/admin/users/{pharmacist_id}/status",
            headers={"X-CSRF-Token": csrf},
            json={"account_status": "locked"},
        )).status_code == 200
    with factory() as db:
        pharmacist = db.get(User, pharmacist_id)
        assert pharmacist.account_status == "locked"
        assert pharmacist.lock_source == "admin"


@pytest.mark.asyncio
async def test_forgot_password_reports_registered_and_unknown_email(auth_env):
    client, factory, _ = auth_env
    email = "forgot@example.com"
    with factory() as db:
        db.add(User(
            ho_ten="Forgot User",
            email=email,
            email_normalized=email,
            email_verified_at=datetime.utcnow(),
            mat_khau_hash=hash_password("existing-password-123"),
            vai_tro="patient",
            account_status="active",
        ))
        db.commit()

    sent = await client.post("/api/v1/auth/forgot-password", json={"email": email})
    assert sent.status_code == 200
    assert sent.json()["message"] == (
        "Email đã được gửi.\nVui lòng kiểm tra Hộp thư đến (Inbox) và Thư rác (Spam)."
    )
    assert sent.json()["code"] == "PASSWORD_RESET_EMAIL_SENT"
    with factory() as db:
        user = db.query(User).filter_by(email_normalized=email).one()
        assert db.query(AuthActionToken).filter_by(user_id=user.id, purpose="reset_password").count() == 1

    missing = await client.post("/api/v1/auth/forgot-password", json={"email": "missing@example.com"})
    assert missing.status_code == 200
    assert missing.json()["message"] == (
        "Email chưa được đăng ký.\nVui lòng đăng ký tài khoản hoặc kiểm tra lại địa chỉ email."
    )
    assert missing.json()["code"] == "EMAIL_NOT_REGISTERED"
    with factory() as db:
        assert db.query(AuthActionToken).filter_by(purpose="reset_password").count() == 1


@pytest.mark.asyncio
async def test_register_and_reset_password_require_eight_characters(auth_env):
    client, factory, _ = auth_env
    short_registration = await client.post("/api/v1/auth/register", json={
        "ho_ten": "Short Password",
        "email": "short-password@example.com",
        "mat_khau": "1234567",
        "vai_tro": "patient",
    })
    assert short_registration.status_code == 422

    valid_registration = await client.post("/api/v1/auth/register", json={
        "ho_ten": "Eight Characters",
        "email": "eight-characters@example.com",
        "mat_khau": "12345678",
        "vai_tro": "patient",
    })
    assert valid_registration.status_code == 202

    with factory() as db:
        user = db.query(User).filter_by(email_normalized="eight-characters@example.com").one()
        reset_token = issue_action_token(db, user.id, "reset_password", 30)

    short_reset = await client.post("/api/v1/auth/reset-password", json={"token": reset_token, "mat_khau_moi": "7654321"})
    assert short_reset.status_code == 422

    reset = await client.post("/api/v1/auth/reset-password", json={"token": reset_token, "mat_khau_moi": "87654321"})
    assert reset.status_code == 200
    assert reset.json()["email"] == "eight-characters@example.com"
