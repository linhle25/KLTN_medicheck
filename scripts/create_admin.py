"""Create the first admin without exposing public admin registration."""
import argparse
import getpass
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.db.models import User
from src.db.session import SessionLocal, init_db
from src.services.auth import hash_password, normalize_email


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    args = parser.parse_args()
    password = getpass.getpass("Admin password (minimum 12 characters): ")
    if len(password) < 12:
        raise SystemExit("Password must contain at least 12 characters")
    init_db()
    db = SessionLocal()
    try:
        email = normalize_email(args.email)
        if db.query(User).filter_by(email_normalized=email).first():
            raise SystemExit("An account with this email already exists")
        db.add(User(ho_ten=args.name.strip(), email=email, email_normalized=email, email_verified_at=datetime.utcnow(), mat_khau_hash=hash_password(password), vai_tro="admin", account_status="active"))
        db.commit()
        print(f"Created admin {email}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
