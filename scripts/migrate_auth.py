"""Idempotent auth schema/data migration for PostgreSQL.

The migration never deletes user rows. Existing non-demo accounts are locked;
the two known demo accounts remain active for explicitly enabled demo setups.
Run against a Neon branch/backup before production.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

from src.db.models import Base
from src.db.session import engine

DEMO_EMAILS = ("demo-patient@medguard.local", "demo-pharmacist@medguard.local")


def migrate() -> None:
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
    print("Auth migration completed; no user rows were deleted")


if __name__ == "__main__":
    migrate()
