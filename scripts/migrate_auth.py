"""Idempotent auth schema/data migration for SQLite and PostgreSQL.

The migration never deletes user rows. Existing non-demo accounts are locked;
the two known demo accounts remain active for explicitly enabled demo setups.
Run against a Neon branch/backup before production.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import inspect, text

from src.db.models import Base
from src.db.session import engine

DEMO_EMAILS = ("demo-patient@medguard.local", "demo-pharmacist@medguard.local")


def _postgres() -> None:
    statements = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_normalized VARCHAR(255)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(30) DEFAULT 'locked'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS lock_source VARCHAR(30)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS so_chung_chi_hanh_nghe VARCHAR(100)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS ly_do_tu_choi TEXT",
        "ALTER TABLE users ALTER COLUMN mat_khau_hash DROP NOT NULL",
        "UPDATE users SET email_normalized = lower(trim(email)) WHERE email_normalized IS NULL",
        "UPDATE users SET account_status = CASE WHEN lower(email) IN ('demo-patient@medguard.local','demo-pharmacist@medguard.local') THEN 'active' ELSE 'locked' END WHERE account_status IS NULL OR account_status = 'locked'",
        "UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE lower(email) IN ('demo-patient@medguard.local','demo-pharmacist@medguard.local') AND email_verified_at IS NULL",
        "UPDATE users SET lock_source = CASE WHEN email_verified_at IS NULL THEN 'legacy_migration' ELSE 'admin' END WHERE account_status = 'locked' AND lock_source IS NULL",
        "UPDATE users SET lock_source = NULL WHERE account_status <> 'locked'",
    ]
    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))
        duplicates = conn.execute(text("SELECT email_normalized FROM users GROUP BY email_normalized HAVING count(*) > 1")).fetchall()
        if duplicates:
            raise RuntimeError(f"Email trung sau khi chuan hoa: {[row[0] for row in duplicates]}")
        conn.execute(text("ALTER TABLE users ALTER COLUMN email_normalized SET NOT NULL"))
        conn.execute(text("ALTER TABLE users ALTER COLUMN account_status SET NOT NULL"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_normalized ON users(email_normalized)"))
    Base.metadata.create_all(bind=engine)


def _sqlite() -> None:
    with engine.connect() as conn:
        columns = {row[1]: row for row in conn.execute(text("PRAGMA table_info(users)"))}
        additions = {
            "email_normalized": "VARCHAR(255)",
            "email_verified_at": "DATETIME",
            "account_status": "VARCHAR(30) DEFAULT 'locked'",
            "lock_source": "VARCHAR(30)",
            "so_chung_chi_hanh_nghe": "VARCHAR(100)",
            "ly_do_tu_choi": "TEXT",
        }
        for name, ddl in additions.items():
            if name not in columns:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {name} {ddl}"))
        conn.execute(text("UPDATE users SET email_normalized = lower(trim(email)) WHERE email_normalized IS NULL"))
        conn.execute(text("UPDATE users SET account_status = CASE WHEN lower(email) IN ('demo-patient@medguard.local','demo-pharmacist@medguard.local') THEN 'active' ELSE 'locked' END WHERE account_status IS NULL OR account_status = 'locked'"))
        conn.execute(text("UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE lower(email) IN ('demo-patient@medguard.local','demo-pharmacist@medguard.local') AND email_verified_at IS NULL"))
        conn.execute(text("UPDATE users SET lock_source = CASE WHEN email_verified_at IS NULL THEN 'legacy_migration' ELSE 'admin' END WHERE account_status = 'locked' AND lock_source IS NULL"))
        conn.execute(text("UPDATE users SET lock_source = NULL WHERE account_status <> 'locked'"))
        duplicates = conn.execute(text("SELECT email_normalized FROM users GROUP BY email_normalized HAVING count(*) > 1")).fetchall()
        if duplicates:
            raise RuntimeError(f"Email trung sau khi chuan hoa: {[row[0] for row in duplicates]}")
        conn.commit()

    # SQLite cannot drop a NOT NULL constraint in place. Rebuild only old users tables.
    not_null_password = next((not row["nullable"] for row in inspect(engine).get_columns("users") if row["name"] == "mat_khau_hash"), False)
    if not_null_password:
        with engine.connect() as conn:
            conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
            try:
                conn.execute(text("""
                    CREATE TABLE users_auth_new (
                        id VARCHAR PRIMARY KEY,
                        ho_ten VARCHAR(255) NOT NULL,
                        email VARCHAR(255) NOT NULL UNIQUE,
                        email_normalized VARCHAR(255) NOT NULL UNIQUE,
                        email_verified_at DATETIME,
                        mat_khau_hash VARCHAR(255),
                        vai_tro VARCHAR(20) NOT NULL,
                        account_status VARCHAR(30) NOT NULL DEFAULT 'locked',
                        lock_source VARCHAR(30),
                        so_chung_chi_hanh_nghe VARCHAR(100),
                        noi_cong_tac VARCHAR(255),
                        mo_ta_ngan TEXT,
                        ly_do_tu_choi TEXT,
                        ngay_tao DATETIME
                    )
                """))
                conn.execute(text("""
                    INSERT INTO users_auth_new (
                        id, ho_ten, email, email_normalized, email_verified_at,
                        mat_khau_hash, vai_tro, account_status,
                        lock_source, so_chung_chi_hanh_nghe, noi_cong_tac, mo_ta_ngan,
                        ly_do_tu_choi, ngay_tao
                    )
                    SELECT id, ho_ten, email, email_normalized, email_verified_at,
                        mat_khau_hash, vai_tro, account_status,
                        lock_source, so_chung_chi_hanh_nghe, noi_cong_tac, mo_ta_ngan,
                        ly_do_tu_choi, ngay_tao
                    FROM users
                """))
                conn.execute(text("DROP TABLE users"))
                conn.execute(text("ALTER TABLE users_auth_new RENAME TO users"))
                conn.commit()
            except Exception:
                conn.rollback()
                raise
            finally:
                conn.exec_driver_sql("PRAGMA foreign_keys=ON")
    with engine.begin() as conn:
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_normalized ON users(email_normalized)"))
    Base.metadata.create_all(bind=engine)


def migrate() -> None:
    if engine.dialect.name == "postgresql":
        _postgres()
    elif engine.dialect.name == "sqlite":
        _sqlite()
    else:
        raise RuntimeError(f"Dialect chua duoc ho tro: {engine.dialect.name}")
    print("Auth migration completed; no user rows were deleted")


if __name__ == "__main__":
    migrate()
