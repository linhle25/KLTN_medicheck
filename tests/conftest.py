import uuid
from contextlib import contextmanager
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine, delete, or_, select, text

from src.config import get_settings
from src.db.models import (
    AuthActionToken,
    AuthIdentity,
    Interaction,
    InteractionCheck,
    Medication,
    MedicationAlias,
    Notification,
    PatientCondition,
    PatientMedication,
    PatientPrescription,
    PatientProfile,
    PharmacistReview,
    Product,
    RefreshSession,
    User,
)
from src.db.session import SessionLocal, SessionLocalFacts, init_db
from src.main import app


@contextmanager
def isolated_postgres_engine():
    """Tạo 1 schema Postgres riêng (tên random), cách ly hoàn toàn cho 1 test - thay
    cho SQLite in-memory (StaticPool) trước đây, vì app giờ chỉ chạy Postgres, không
    còn nhánh SQLite nào ở src/db/session.py. Vẫn dùng chung 1 server Postgres với
    DATABASE_URL nhưng mỗi test có schema riêng (schema_translate_map) nên không
    đụng dữ liệu thật/dữ liệu của test khác, và tự dọn (DROP SCHEMA ... CASCADE) khi
    test xong - dùng cho các test cần 1 DB trắng hoàn toàn (không qua init_db())."""
    schema = f"test_{uuid.uuid4().hex[:12]}"
    base_engine = create_engine(get_settings().database_url)
    with base_engine.connect() as conn:
        conn.execute(text(f'CREATE SCHEMA "{schema}"'))
        conn.commit()
    engine = base_engine.execution_options(schema_translate_map={None: schema})
    try:
        yield engine
    finally:
        with base_engine.connect() as conn:
            conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
            conn.commit()
        base_engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def _ensure_test_db_schema():
    """Tao bang truoc khi chay test - can cho DB Postgres test moi tinh (CI: service
    rieng, xem ci.yml/cd.yml).

    client fixture dung ASGITransport, KHONG tu chay lifespan cua FastAPI (noi
    goi init_db() luc app khoi dong that), nen tren 1 DB hoan toan moi (chua tung co
    bang nao) moi test se loi "relation does not exist". Doi voi DB da co san bang
    (Supabase that, hoac DB dev da seed), create_all() la no-op an toan (chi tao
    bang thieu, khong dong den bang co san)."""
    init_db()


def _get_or_create_medication(db, ten_chuan_hoa: str) -> Medication:
    med = db.query(Medication).filter(Medication.ten_chuan_hoa == ten_chuan_hoa).first()
    if med is None:
        med = Medication(ten_chuan_hoa=ten_chuan_hoa, nguon_du_lieu="test-fixture")
        db.add(med)
        db.flush()
    return med


def _get_or_create_alias(db, alias: str, medication_id: str) -> None:
    if db.query(MedicationAlias).filter(MedicationAlias.alias == alias).first() is None:
        db.add(MedicationAlias(alias=alias, medication_id=medication_id))


def _get_or_create_product(db, ten_thuoc: str) -> Product:
    product = db.query(Product).filter(Product.ten_thuoc == ten_thuoc).first()
    if product is None:
        product = Product(ten_thuoc=ten_thuoc, nguon_du_lieu="test-fixture")
        db.add(product)
        db.flush()
    return product


def _get_or_create_severe_interaction(db_facts, medication_a_id: str, medication_b_id: str) -> None:
    # Quy uoc medication_a_id < medication_b_id (so sanh chuoi) - xem Interaction
    # model trong src/db/models.py.
    a_id, b_id = sorted([medication_a_id, medication_b_id])
    existing = (
        db_facts.query(Interaction)
        .filter(Interaction.medication_a_id == a_id, Interaction.medication_b_id == b_id)
        .first()
    )
    if existing is None:
        db_facts.add(
            Interaction(
                medication_a_id=a_id,
                medication_b_id=b_id,
                muc_do="nang",
                mo_ta="Fixture test: tang nguy co chay mau khi dung chung.",
                xu_tri="Fixture test: tranh phoi hop, theo doi INR neu bat buoc dung chung.",
                nguon_trich_dan="test-fixture",
            )
        )


@pytest.fixture(scope="session", autouse=True)
def _seed_fixture_medications(_ensure_test_db_schema):
    """Seed toi thieu du lieu ma vai test API can (ten thuoc that, 1 canh bao
    "nang") - tren Postgres test moi tinh (CI: service rieng, xem ci.yml/cd.yml)
    khong co gi de tra cuu.

    Chi chay khi APP_ENV=test - day la tin hieu duy nhat (khong con phan biet duoc
    theo dialect URL vi ca test lan production deu la Postgres) de biet dang chay
    tren 1 DB test co the ghi tuy y. TUYET DOI KHONG set APP_ENV=test khi
    DATABASE_URL dang tro vao DB that dung chung cua team - seed nay se ghi them
    Warfarin/Acetylsalicylic acid/Ibuprofen/Paracetamol + 1 canh bao "nang" fixture
    vao do."""
    settings = get_settings()
    if settings.app_env != "test":
        return

    with SessionLocal() as db:
        warfarin = _get_or_create_medication(db, "Warfarin")
        aspirin = _get_or_create_medication(db, "Acetylsalicylic acid")
        db.flush()
        _get_or_create_alias(db, "asp", aspirin.id)
        _get_or_create_alias(db, "aspirin", aspirin.id)
        _get_or_create_product(db, "Ibuprofen")
        _get_or_create_product(db, "Paracetamol")
        db.commit()
        warfarin_id, aspirin_id = warfarin.id, aspirin.id

    with SessionLocalFacts() as db_facts:
        _get_or_create_severe_interaction(db_facts, warfarin_id, aspirin_id)
        db_facts.commit()


@pytest.fixture(autouse=True)
def disable_transactional_email(monkeypatch):
    """Keep API tests deterministic and prevent delivery to real recipients."""
    monkeypatch.setattr("src.api.auth_routes.send_verification_email", lambda *args: None)
    monkeypatch.setattr("src.api.auth_routes.send_password_reset_email", lambda *args: None)
    monkeypatch.setattr("src.api.auth_routes.send_pharmacist_decision_email", lambda *args: None)


@pytest.fixture(autouse=True)
def cleanup_generated_users():
    """Remove synthetic @test.local rows from the configured integration DB."""
    yield
    with SessionLocal() as db:
        user_ids = select(User.id).where(User.email_normalized.like("%@test.local"))
        profile_ids = select(PatientProfile.id).where(PatientProfile.user_id.in_(user_ids))
        check_ids = select(InteractionCheck.id).where(InteractionCheck.patient_id.in_(user_ids))
        review_ids = select(PharmacistReview.id).where(
            or_(
                PharmacistReview.pharmacist_id.in_(user_ids),
                PharmacistReview.interaction_check_id.in_(check_ids),
            )
        )
        db.execute(
            delete(Notification).where(
                or_(Notification.patient_id.in_(user_ids), Notification.pharmacist_review_id.in_(review_ids))
            )
        )
        db.execute(delete(PharmacistReview).where(PharmacistReview.id.in_(review_ids)))
        db.execute(delete(PatientCondition).where(PatientCondition.patient_profile_id.in_(profile_ids)))
        db.execute(delete(PatientMedication).where(PatientMedication.patient_id.in_(user_ids)))
        db.execute(delete(PatientPrescription).where(PatientPrescription.patient_id.in_(user_ids)))
        db.execute(delete(InteractionCheck).where(InteractionCheck.id.in_(check_ids)))
        db.execute(delete(PatientProfile).where(PatientProfile.id.in_(profile_ids)))
        db.execute(delete(AuthIdentity).where(AuthIdentity.user_id.in_(user_ids)))
        db.execute(delete(AuthActionToken).where(AuthActionToken.user_id.in_(user_ids)))
        db.execute(delete(RefreshSession).where(RefreshSession.user_id.in_(user_ids)))
        db.execute(delete(User).where(User.id.in_(user_ids)))
        db.commit()


@pytest_asyncio.fixture
async def client():
    """Async HTTP client for testing API endpoints."""
    # Give every test its own source address so persisted production-style
    # rate-limit events cannot leak between tests or separate pytest runs.
    transport = ASGITransport(app=app, client=(f"pytest-{uuid.uuid4().hex}", 123))
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def mock_llm():
    """Mock LLM to avoid calling OpenAI during tests.

    Usage in test:
        def test_something(mock_llm):
            # LLM calls will return mock response instead of hitting OpenAI
            ...
    """
    mock = AsyncMock()
    mock.ainvoke.return_value = AsyncMock(content="Mocked LLM response")
    return mock
