#!/usr/bin/env python3
"""Seed 2 tai khoan demo (benh nhan + duoc si) de dang nhap nhanh khi demo san pham.

Tao san: gan duoc si phu trach benh nhan, benh nhan co san 2 thuoc that
(Warfarin + Acetylsalicylic acid, cap tuong tac muc "nang") de bam
"Kiem tra tuong tac" la co ket qua ngay, khong phai go tay tung buoc.

Idempotent - chay lai nhieu lan khong tao trung, chi bo sung phan con thieu.

Usage:
  python scripts/seed_demo_users.py
"""
import sys
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.db.models import Medication, PatientMedication, User
from src.db.session import SessionLocal, init_db
from src.services.auth import hash_password

DEMO_PATIENT_EMAIL = "demo-patient@medguard.local"
DEMO_PHARMACIST_EMAIL = "demo-pharmacist@medguard.local"
DEMO_PASSWORD = "demo1234"

# Da xac minh that trong DDInter 2.0 (xem GD6 muc 7.0/7.1): Warfarin x Acetylsalicylic
# acid (alias "aspirin") = muc "nang".
WARFARIN_ID = "DDInter1951"
ACETYLSALICYLIC_ACID_ID = "DDInter20"


def _get_or_create_user(db, email: str, ho_ten: str, vai_tro: str) -> User:
    user = db.query(User).filter_by(email=email).first()
    if user is not None:
        user.email_normalized = email.lower()
        user.email_verified_at = user.email_verified_at or datetime.utcnow()
        user.account_status = "active"
        db.commit()
        return user
    user = User(
        ho_ten=ho_ten,
        email=email,
        email_normalized=email.lower(),
        email_verified_at=datetime.utcnow(),
        mat_khau_hash=hash_password(DEMO_PASSWORD),
        vai_tro=vai_tro,
        account_status="active",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        patient = _get_or_create_user(db, DEMO_PATIENT_EMAIL, "Bệnh Nhân Demo", "patient")
        _get_or_create_user(db, DEMO_PHARMACIST_EMAIL, "Dược Sĩ Demo", "pharmacist")



        for medication_id in (WARFARIN_ID, ACETYLSALICYLIC_ACID_ID):
            if db.get(Medication, medication_id) is None:
                print(
                    f"  [canh bao] khong tim thay {medication_id} trong medications - "
                    "hay chay scripts/import_ddinter.py truoc."
                )
                continue
            existing = (
                db.query(PatientMedication)
                .filter_by(patient_id=patient.id, medication_id=medication_id)
                .first()
            )
            if existing is None:
                db.add(
                    PatientMedication(
                        patient_id=patient.id,
                        medication_id=medication_id,
                        ngay_bat_dau=date.today(),
                    )
                )
        db.commit()

        print("Da seed tai khoan demo:")
        print(f"  Benh nhan : {DEMO_PATIENT_EMAIL} / {DEMO_PASSWORD}")
        print(f"  Duoc si   : {DEMO_PHARMACIST_EMAIL} / {DEMO_PASSWORD}")
        print("  -> benh nhan da co san 2 thuoc de kiem tra ngay.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
