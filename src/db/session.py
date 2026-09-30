"""DB session — dùng lại get_settings() có sẵn trong src/config.py."""
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from src.config import get_settings
from src.db.models import Base

settings = get_settings()

# pool_pre_ping: kiểm tra connection còn sống trước khi dùng - bắt buộc với Neon vì
# nó tự ngắt connection khi idle (auto-suspend), nếu không sẽ lấy phải connection
# chết từ pool và phải đợi timeout mới phát hiện ra.
# pool_recycle: chủ động bỏ connection cũ trước khi hạ tầng Neon tự cắt ngầm.
engine = create_engine(settings.database_url, pool_pre_ping=True, pool_recycle=300)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# DB "facts" (interactions/food_interactions/disease_interactions) - tuỳ chọn tách
# sang 1 DB Postgres-compatible riêng khi deploy, xem docs/database-split.md. Khi
# database_url_facts để trống (mặc định, kể cả dev/test lẫn 1 Postgres local duy
# nhất), dùng lại engine chính thay vì mở thêm 1 connection pool trỏ tới cùng 1 DB.
FACTS_TABLE_NAMES = {"interactions", "food_interactions", "disease_interactions"}
if settings.database_url_facts:
    engine_facts = create_engine(settings.database_url_facts, pool_pre_ping=True, pool_recycle=300)
    SessionLocalFacts = sessionmaker(autocommit=False, autoflush=False, bind=engine_facts)
else:
    engine_facts = engine
    SessionLocalFacts = SessionLocal


def _ensure_column_any_dialect(table: str, column: str, ddl_type: str, *, engine=engine) -> None:
    """create_all() KHÔNG BAO GIỜ ALTER bảng đã tồn tại sẵn - cần tự thêm cột mới 1
    lần, idempotent, cho bảng cũ đã có data từ trước (như Neon hiện tại) khi model
    có thêm cột sau khi bảng đó đã được tạo. Postgres hỗ trợ sẵn ADD COLUMN IF NOT
    EXISTS nên không cần tự kiểm tra tồn tại trước."""
    with engine.connect() as conn:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {ddl_type}"))
        conn.commit()


def _ensure_index(table: str, column: str, index_name: str, *, engine=engine) -> None:
    """Giống _ensure_column_any_dialect nhưng cho index - create_all() KHÔNG
    retroactively thêm index vào bảng đã tồn tại sẵn, nên phải tự chạy CREATE INDEX
    IF NOT EXISTS 1 lần cho bảng cũ. Thiếu các index này từng khiến các query lọc
    theo patient_id/user_id chạy chậm hẳn trên Neon (seq scan)."""
    with engine.connect() as conn:
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table} ({column})"))
        conn.commit()


def _purge_stale_food_disease_cache(*, engine=engine) -> None:
    """Xoá các bản ghi food_disease_explanation_cache đã lưu TRƯỚC KHI cột
    nguon_trich_dan_chi_tiet tồn tại (nên cột đó đang NULL) - cache không có cơ chế
    tự làm mới, nếu không xoá thì các cạnh đã tra cứu trước đây sẽ mãi mãi không có
    references thật dù backend đã hỗ trợ. Idempotent + tự giới hạn: sau lần dọn đầu
    tiên, gần như mọi bản ghi mới đều có nguon_trich_dan_chi_tiet (dữ liệu DDInter
    hiếm khi thiếu nguon_trich_dan gốc) nên lệnh này rơi về no-op ở các lần khởi
    động sau. Chỉ xoá cache (không phải dữ liệu DDInter gốc) - lần tra cứu kế tiếp
    tự tính lại (gọi LLM lại 1 lần cho các cạnh đã xoá)."""
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM food_disease_explanation_cache WHERE nguon_trich_dan_chi_tiet IS NULL"))
        conn.commit()


def init_db() -> None:
    """Tạo bảng nếu chưa tồn tại — gọi 1 lần khi setup (Sprint 0).

    interactions/food_interactions/disease_interactions tạo trên engine_facts - cùng
    engine chính (mặc định) trừ khi database_url_facts trỏ sang 1 DB riêng. Xem
    docs/database-split.md."""
    main_tables = [t for name, t in Base.metadata.tables.items() if name not in FACTS_TABLE_NAMES]
    facts_tables = [Base.metadata.tables[name] for name in FACTS_TABLE_NAMES]
    Base.metadata.create_all(bind=engine, tables=main_tables)
    Base.metadata.create_all(bind=engine_facts, tables=facts_tables)

    _ensure_column_any_dialect("interaction_checks", "thuoc_da_kiem_tra", "JSON")
    _ensure_column_any_dialect("food_disease_explanation_cache", "nguon_trich_dan_chi_tiet", "TEXT")
    _purge_stale_food_disease_cache()

    _ensure_index("patient_profiles", "user_id", "idx_patient_profiles_user_id")
    _ensure_index("patient_prescriptions", "patient_id", "idx_patient_prescriptions_patient_id")
    _ensure_index("patient_medications", "patient_id", "idx_patient_medications_patient_id")
    _ensure_index("interaction_checks", "patient_id", "idx_interaction_checks_patient_id")
    _ensure_index("pharmacist_lookups", "pharmacist_id", "idx_pharmacist_lookups_pharmacist_id")
    _ensure_index("pharmacist_reviews", "interaction_check_id", "idx_pharmacist_reviews_check_id")
    _ensure_index("pharmacist_reviews", "pharmacist_id", "idx_pharmacist_reviews_pharmacist_id")
    _ensure_index("notifications", "patient_id", "idx_notifications_patient_id")
    _ensure_index("refresh_sessions", "user_id", "idx_refresh_sessions_user_id")
    _ensure_index("product_ingredients", "product_id", "idx_product_ingredients_product_id")
    _ensure_index("patient_medications", "prescription_id", "idx_patient_medications_prescription_id")


def assert_auth_schema_ready() -> None:
    """Fail with an actionable message instead of serving partially migrated auth."""
    columns = {column["name"]: column for column in inspect(engine).get_columns("users")}
    required = {"email_normalized", "email_verified_at", "account_status", "lock_source", "so_chung_chi_hanh_nghe", "ly_do_tu_choi"}
    if missing := required - columns.keys():
        raise RuntimeError(f"Auth schema chua migrate ({sorted(missing)}); chay python scripts/migrate_auth.py")
    if not columns["mat_khau_hash"]["nullable"]:
        raise RuntimeError("Auth schema cu van bat buoc mat_khau_hash; chay python scripts/migrate_auth.py")
    with engine.connect() as conn:
        unclassified_locks = conn.execute(text(
            "SELECT count(*) FROM users WHERE account_status = 'locked' AND lock_source IS NULL"
        )).scalar_one()
    if unclassified_locks:
        raise RuntimeError(
            f"Co {unclassified_locks} tai khoan khoa chua co nguon khoa; "
            "chay python scripts/migrate_auth.py"
        )


def get_db() -> Session:
    """Dependency cho FastAPI route: `db: Session = Depends(get_db)`."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_db_facts() -> Session:
    """Dependency cho FastAPI route: `db_facts: Session = Depends(get_db_facts)`.

    Trỏ tới DB facts (interactions/food_interactions/disease_interactions) - cùng
    engine chính khi database_url_facts trống. Xem docs/database-split.md."""
    db = SessionLocalFacts()
    try:
        yield db
    finally:
        db.close()
