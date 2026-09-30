import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.orm import sessionmaker

from src.db.models import Base, Disease, User
from src.db.session import get_db
from src.main import app
from tests.conftest import isolated_postgres_engine


@pytest_asyncio.fixture
async def conditions_client():
    """API client dùng 1 schema Postgres biệt lập, không đọc/ghi DATABASE_URL
    ngoài phạm vi schema đó."""
    with isolated_postgres_engine() as engine:
        testing_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        Base.metadata.create_all(bind=engine)

        with testing_session() as db:
            db.add_all(
                [
                    Disease(id=1, ten_benh="Hypertension", ten_benh_vi="Tăng huyết áp"),
                    Disease(id=2, ten_benh="Diabetes mellitus", ten_benh_vi="Đái tháo đường"),
                    Disease(id=3, ten_benh="Asthma", ten_benh_vi="Hen phế quản"),
                ]
            )
            db.commit()

        def override_get_db():
            db = testing_session()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        try:
            async with AsyncClient(
                transport=ASGITransport(app=app, client=(f"pytest-{uuid.uuid4().hex}", 123)),
                base_url="http://test",
            ) as client:
                client.testing_session = testing_session
                yield client
        finally:
            app.dependency_overrides.pop(get_db, None)


async def _register_patient(client: AsyncClient) -> dict:
    unique = uuid.uuid4().hex
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "ho_ten": "Bệnh nhân test",
            "email": f"patient-{unique}@example.com",
            "mat_khau": "secret-password-123",
            "vai_tro": "patient",
        },
    )
    assert response.status_code == 202, response.text
    with client.testing_session() as db:
        user = db.query(User).filter_by(email_normalized=f"patient-{unique}@example.com").one()
        user.email_verified_at = __import__("datetime").datetime.utcnow()
        user.account_status = "active"
        db.commit()
    login = await client.post("/api/v1/auth/login", json={"email": f"patient-{unique}@example.com", "mat_khau": "secret-password-123"})
    assert login.status_code == 200, login.text
    return login.json()


def _headers(auth: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {auth['access_token']}"}


@pytest.mark.asyncio
async def test_search_diseases_requires_auth_and_matches_both_names(conditions_client):
    client = conditions_client
    assert (await client.get("/api/v1/diseases/search?q=hyper")).status_code == 401

    auth = await _register_patient(client)
    headers = _headers(auth)

    english = await client.get("/api/v1/diseases/search?q=hyper", headers=headers)
    assert english.status_code == 200
    assert [item["id"] for item in english.json()] == [1]

    vietnamese = await client.get("/api/v1/diseases/search?q=tháo", headers=headers)
    assert vietnamese.status_code == 200
    assert [item["id"] for item in vietnamese.json()] == [2]

    for query in (
        "đái tháo đường",
        "bệnh đái tháo đường",
        "dai thao duong",
        "benh dai thao duong",
        "tiểu đường",
        "đái tháo đườn",
    ):
        response = await client.get(
            "/api/v1/diseases/search", params={"q": query}, headers=headers
        )
        assert response.status_code == 200, response.text
        assert response.json()[0]["id"] == 2, query

    generic_cases = {
        "bệnh tăng huyết áp": 1,
        "tang huyet ap": 1,
        "cao huyết áp": 1,
        "tăng huyết á": 1,
        "bệnh hen phế quản": 3,
        "hen phe quan": 3,
        "hen suyễn": 3,
        "hen phế quảnh": 3,
    }
    for query, expected_id in generic_cases.items():
        response = await client.get(
            "/api/v1/diseases/search", params={"q": query}, headers=headers
        )
        assert response.status_code == 200, response.text
        assert response.json()[0]["id"] == expected_id, query


@pytest.mark.asyncio
async def test_patient_can_replace_list_deduplicate_and_clear_conditions(conditions_client):
    client = conditions_client
    auth = await _register_patient(client)
    patient_id = auth["user_id"]
    headers = _headers(auth)
    url = f"/api/v1/patients/{patient_id}/conditions"

    empty = await client.get(url, headers=headers)
    assert empty.status_code == 200
    assert empty.json() == []

    updated = await client.put(
        url,
        headers=headers,
        json={"disease_ids": [2, 1, 2]},
    )
    assert updated.status_code == 200, updated.text
    assert [item["id"] for item in updated.json()] == [2, 1]

    persisted = await client.get(url, headers=headers)
    assert persisted.status_code == 200
    assert {item["id"] for item in persisted.json()} == {1, 2}

    cleared = await client.put(url, headers=headers, json={"disease_ids": []})
    assert cleared.status_code == 200
    assert cleared.json() == []
    assert (await client.get(url, headers=headers)).json() == []


@pytest.mark.asyncio
async def test_invalid_disease_id_is_atomic(conditions_client):
    client = conditions_client
    auth = await _register_patient(client)
    patient_id = auth["user_id"]
    headers = _headers(auth)
    url = f"/api/v1/patients/{patient_id}/conditions"

    initial = await client.put(url, headers=headers, json={"disease_ids": [3]})
    assert initial.status_code == 200

    invalid = await client.put(
        url,
        headers=headers,
        json={"disease_ids": [2, 999]},
    )
    assert invalid.status_code == 422
    assert invalid.json()["detail"]["disease_ids"] == [999]

    persisted = await client.get(url, headers=headers)
    assert [item["id"] for item in persisted.json()] == [3]


@pytest.mark.asyncio
async def test_patient_cannot_read_or_update_another_patients_conditions(conditions_client):
    client = conditions_client
    owner = await _register_patient(client)
    other = await _register_patient(client)
    url = f"/api/v1/patients/{owner['user_id']}/conditions"
    other_headers = _headers(other)

    assert (await client.get(url, headers=other_headers)).status_code == 403
    assert (
        await client.put(url, headers=other_headers, json={"disease_ids": [3]})
    ).status_code == 403


@pytest.mark.asyncio
async def test_product_check_uses_conditions_or_general_fallback_and_saves_snapshot(
    conditions_client, monkeypatch
):
    client = conditions_client
    calls: list[dict] = []

    async def fake_run_product_check(prescriptions, db, **kwargs):
        calls.append(kwargs)
        return (
            {
                "ranked_results": [],
                "explanations": [],
                "has_severe": False,
                "has_severe_disease_interaction": True,
                "has_unclassified": False,
                "disease_interactions": [],
                "disease_interaction_scope": kwargs["disease_interaction_scope"],
                "patient_conditions_snapshot": kwargs["patient_conditions_snapshot"],
            },
            [],
            [],
        )

    monkeypatch.setattr("src.api.routes._run_product_check", fake_run_product_check)
    auth = await _register_patient(client)
    patient_id = auth["user_id"]
    headers = _headers(auth)
    conditions_url = f"/api/v1/patients/{patient_id}/conditions"
    check_payload = {
        "prescriptions": [{"label": "Đơn 1", "products": ["Thuốc test"]}],
        "personalized": True,
    }

    fallback = await client.post("/api/v1/products/check", headers=headers, json=check_payload)
    assert fallback.status_code == 200, fallback.text
    assert calls[-1]["disease_ids"] is None
    assert fallback.json()["has_severe"] is False
    assert fallback.json()["has_severe_disease_interaction"] is True
    assert fallback.json()["is_personalized"] is True
    assert fallback.json()["disease_interaction_scope"] == "general_fallback"
    assert fallback.json()["patient_conditions_snapshot"] == []

    updated = await client.put(
        conditions_url,
        headers=headers,
        json={"disease_ids": [1]},
    )
    assert updated.status_code == 200

    personalized = await client.post("/api/v1/products/check", headers=headers, json=check_payload)
    assert personalized.status_code == 200, personalized.text
    personalized_data = personalized.json()
    assert calls[-1]["disease_ids"] == [1]
    assert personalized_data["disease_interaction_scope"] == "personalized"
    assert personalized_data["has_severe"] is False
    assert personalized_data["has_severe_disease_interaction"] is True
    assert [item["id"] for item in personalized_data["patient_conditions_snapshot"]] == [
        1
    ]

    # Luồng Tra cứu tương tác/tra cứu hộ không lấy bệnh nền của tài khoản đang đăng nhập.
    general_payload = {
        "prescriptions": [{"label": "Đơn tra cứu hộ", "products": ["Thuốc test"]}],
        "personalized": False,
    }
    general = await client.post("/api/v1/products/check", headers=headers, json=general_payload)
    assert general.status_code == 200, general.text
    assert calls[-1]["disease_ids"] is None
    assert general.json()["is_personalized"] is False
    assert general.json()["disease_interaction_scope"] == "general"
    assert general.json()["patient_conditions_snapshot"] == []

    # Lịch sử giữ snapshot tại thời điểm kiểm tra dù profile được sửa sau đó.
    await client.put(conditions_url, headers=headers, json={"disease_ids": []})
    check_id = personalized_data["interaction_check_id"]
    history = await client.get(
        f"/api/v1/patients/{patient_id}/checks/{check_id}", headers=headers
    )
    assert history.status_code == 200, history.text
    assert history.json()["is_personalized"] is True
    assert history.json()["disease_interaction_scope"] == "personalized"
    assert [item["id"] for item in history.json()["patient_conditions_snapshot"]] == [
        1
    ]

    # Cờ lịch sử/phân luồng dược sĩ phản ánh cả cảnh báo nặng thuốc-bệnh, trong khi
    # has_severe vẫn giữ nguyên nghĩa tương tác thuốc-thuốc để tương thích ngược.
    checks = await client.get(f"/api/v1/patients/{patient_id}/checks", headers=headers)
    assert checks.status_code == 200, checks.text
    saved_check = next(item for item in checks.json() if item["id"] == check_id)
    assert saved_check["co_canh_bao_nang"] is True
