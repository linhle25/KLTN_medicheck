import hashlib
from datetime import datetime, timedelta
from time import monotonic

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from src.api.deps import get_current_user, require_role
from src.config import get_settings
from src.db.models import (
    AuthEvent,
    AuthIdentity,
    DiseaseInteraction,
    FeedbackReport,
    FoodInteraction,
    Interaction,
    Medication,
    Product,
    RefreshSession,
    User,
)
from src.db.session import get_db, get_db_facts
from src.models.schemas import (
    AdminAccountStatusRequest,
    AdminDrugDataResponse,
    AdminDrugItem,
    AdminOverview,
    AdminUserInfo,
    AdminUsersResponse,
    AuthResponse,
    EmailRequest,
    FeedbackInfo,
    FeedbackUpdateRequest,
    GoogleCredentialRequest,
    GoogleLinkRequest,
    GoogleRegistrationRequest,
    LoginRequest,
    MessageResponse,
    PendingPharmacistInfo,
    RegisterRequest,
    RejectPharmacistRequest,
    ResetPasswordRequest,
    TokenRequest,
)
from src.services.auth import (
    consume_action_token,
    create_token,
    hash_password,
    issue_action_token,
    issue_refresh_session,
    new_csrf_token,
    normalize_email,
    password_needs_rehash,
    revoke_refresh_session,
    rotate_refresh_session,
    verify_google_credential,
    verify_password,
)
from src.services.email import (
    send_password_reset_email,
    send_pharmacist_decision_email,
    send_verification_email,
)

router = APIRouter(prefix="/auth", tags=["auth"])
admin_router = APIRouter(prefix="/admin", tags=["admin"])

ACCESS_COOKIE = "medguard_access"
REFRESH_COOKIE = "medguard_refresh"
CSRF_COOKIE = "medguard_csrf"
ADMIN_OVERVIEW_CACHE_TTL_SECONDS = 30
PASSWORD_RECOVERY_SENT_MESSAGE = (
    "Email đã được gửi.\n"
    "Vui lòng kiểm tra Hộp thư đến (Inbox) và Thư rác (Spam)."
)
PASSWORD_RECOVERY_UNKNOWN_EMAIL_MESSAGE = (
    "Email chưa được đăng ký.\n"
    "Vui lòng đăng ký tài khoản hoặc kiểm tra lại địa chỉ email."
)
VERIFICATION_EMAIL_SENT_MESSAGE = (
    "Email xác minh đã được gửi.\n"
    "Vui lòng kiểm tra Hộp thư đến (Inbox) và Thư rác (Spam)."
)
_admin_overview_cache: tuple[float, AdminOverview] | None = None


def _invalidate_admin_overview_cache() -> None:
    global _admin_overview_cache
    _admin_overview_cache = None


def _cookie_options() -> dict:
    settings = get_settings()
    return {
        "secure": settings.cookie_secure,
        "samesite": settings.cookie_samesite,
        "domain": settings.cookie_domain,
        "path": "/",
    }


def _auth_result(user: User, access_token: str | None = None) -> AuthResponse:
    return AuthResponse(
        access_token=access_token if get_settings().app_env != "production" else None,
        vai_tro=user.vai_tro,
        user_id=user.id,
        ho_ten=user.ho_ten,
        email=user.email,
        account_status=user.account_status,
    )


def _set_session_cookies(response: Response, db: Session, user: User, refresh_raw: str | None = None) -> str:
    settings = get_settings()
    access = create_token(user.id, user.vai_tro)
    if refresh_raw is None:
        refresh_raw, _ = issue_refresh_session(db, user.id)
    options = _cookie_options()
    response.set_cookie(ACCESS_COOKIE, access, httponly=True, max_age=settings.access_token_expire_minutes * 60, **options)
    response.set_cookie(REFRESH_COOKIE, refresh_raw, httponly=True, max_age=settings.refresh_token_expire_days * 86400, **options)
    return access


def _clear_session_cookies(response: Response) -> None:
    options = _cookie_options()
    for name in (ACCESS_COOKIE, REFRESH_COOKIE):
        response.delete_cookie(name, domain=options["domain"], path="/", samesite=options["samesite"], secure=options["secure"])


def _rate_key(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _enforce_rate_limit(db: Session, action: str, key: str, limit: int, minutes: int) -> None:
    cutoff = datetime.utcnow() - timedelta(minutes=minutes)
    count = db.query(AuthEvent).filter(AuthEvent.action == action, AuthEvent.key_hash == _rate_key(key), AuthEvent.ngay_tao >= cutoff).count()
    if count >= limit:
        raise HTTPException(status_code=429, detail="Bạn đã thử quá nhiều lần, vui lòng thử lại sau")


def _record_event(db: Session, action: str, key: str, succeeded: bool = False) -> None:
    db.query(AuthEvent).filter(AuthEvent.ngay_tao < datetime.utcnow() - timedelta(days=7)).delete(synchronize_session=False)
    db.add(AuthEvent(action=action, key_hash=_rate_key(key), succeeded=succeeded))
    db.commit()


def _validate_pharmacist_fields(role: str, license_number: str | None, workplace: str | None) -> None:
    if role == "pharmacist" and (not (license_number or "").strip() or not (workplace or "").strip()):
        raise HTTPException(status_code=422, detail="Dược sĩ phải cung cấp số CCHN và nơi công tác")


def _status_response(user: User) -> JSONResponse:
    if user.account_status == "pending_email":
        return JSONResponse(status_code=202, content={
            "code": "EMAIL_VERIFICATION_REQUIRED",
            "account_status": user.account_status,
            "message": "Email chưa được xác minh.\nVui lòng xác minh email trước khi đăng nhập.",
        })
    if user.account_status == "pending_pharmacist":
        return JSONResponse(status_code=202, content={"code": "PHARMACIST_APPROVAL_PENDING", "account_status": user.account_status, "message": "Hồ sơ dược sĩ đang chờ duyệt"})
    if user.account_status == "locked":
        return JSONResponse(status_code=423, content={"code": "ACCOUNT_LOCKED", "message": "Tài khoản đã bị khóa"})
    return JSONResponse(status_code=403, content={"code": "ACCOUNT_REJECTED", "message": user.ly_do_tu_choi or "Tài khoản chưa được kích hoạt"})


@router.get("/csrf")
async def csrf(response: Response) -> dict[str, str]:
    token = new_csrf_token()
    response.set_cookie(CSRF_COOKIE, token, httponly=False, max_age=86400, **_cookie_options())
    return {"csrf_token": token}


@router.post("/register", response_model=MessageResponse, status_code=202)
async def register(payload: RegisterRequest, background: BackgroundTasks, request: Request, db: Session = Depends(get_db)) -> MessageResponse:
    email = normalize_email(payload.email)
    rate_key = request.client.host if request.client else "unknown"
    _enforce_rate_limit(db, "register", rate_key, 10, 60)
    _validate_pharmacist_fields(payload.vai_tro, payload.so_chung_chi_hanh_nghe, payload.noi_cong_tac)
    if db.query(User).filter_by(email_normalized=email).first() is not None:
        raise HTTPException(
            status_code=409,
            detail="Email đã được đăng ký.\nVui lòng đăng nhập hoặc chọn Quên mật khẩu.",
        )
    user = User(
        ho_ten=payload.ho_ten.strip(), email=email, email_normalized=email,
        mat_khau_hash=hash_password(payload.mat_khau), vai_tro=payload.vai_tro,
        account_status="pending_email", so_chung_chi_hanh_nghe=payload.so_chung_chi_hanh_nghe,
        noi_cong_tac=payload.noi_cong_tac,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = issue_action_token(db, user.id, "verify_email", 24 * 60)
    _record_event(db, "register", rate_key, True)
    background.add_task(send_verification_email, user.email, token)
    return MessageResponse(
        message=VERIFICATION_EMAIL_SENT_MESSAGE,
        code="VERIFICATION_EMAIL_SENT",
        account_status=user.account_status,
    )


@router.post("/verify-email", response_model=MessageResponse)
async def verify_email(payload: TokenRequest, db: Session = Depends(get_db)) -> MessageResponse:
    user = consume_action_token(db, payload.token, "verify_email")
    if user is None:
        raise HTTPException(status_code=400, detail="Liên kết xác minh không hợp lệ hoặc đã hết hạn")
    user.email_verified_at = datetime.utcnow()
    user.account_status = "pending_pharmacist" if user.vai_tro == "pharmacist" else "active"
    db.commit()
    return MessageResponse(message="Email đã được xác minh", account_status=user.account_status)


@router.post("/resend-verification", response_model=MessageResponse)
async def resend_verification(payload: EmailRequest, background: BackgroundTasks, db: Session = Depends(get_db)) -> MessageResponse:
    email = normalize_email(payload.email)
    _enforce_rate_limit(db, "resend", email, 3, 60)
    user = db.query(User).filter_by(email_normalized=email).first()
    if user is None:
        _record_event(db, "resend", email)
        return MessageResponse(
            message=PASSWORD_RECOVERY_UNKNOWN_EMAIL_MESSAGE,
            code="EMAIL_NOT_REGISTERED",
        )
    if user.account_status != "pending_email":
        _record_event(db, "resend", email)
        return MessageResponse(
            message="Email đã được xác minh. Bạn có thể đăng nhập vào MediCheck.",
            code="EMAIL_ALREADY_VERIFIED",
        )
    token = issue_action_token(db, user.id, "verify_email", 24 * 60)
    background.add_task(send_verification_email, user.email, token)
    _record_event(db, "resend", email)
    return MessageResponse(
        message=VERIFICATION_EMAIL_SENT_MESSAGE,
        code="VERIFICATION_EMAIL_SENT",
    )


@router.post("/login", response_model=AuthResponse, responses={202: {"model": MessageResponse}})
async def login(payload: LoginRequest, response: Response, request: Request, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    key = f"{request.client.host if request.client else 'unknown'}:{email}"
    _enforce_rate_limit(db, "login_failed", key, 5, 15)
    user = db.query(User).filter_by(email_normalized=email).first()
    if user is None or not verify_password(payload.mat_khau, user.mat_khau_hash):
        _record_event(db, "login_failed", key)
        raise HTTPException(status_code=401, detail="Email hoặc mật khẩu không đúng")
    if email in {"demo-patient@medguard.local", "demo-pharmacist@medguard.local"} and not get_settings().enable_demo_accounts:
        raise HTTPException(status_code=403, detail="Tài khoản demo không được bật trong môi trường này")
    if password_needs_rehash(user.mat_khau_hash):
        user.mat_khau_hash = hash_password(payload.mat_khau)
        db.commit()
    if user.account_status != "active":
        return _status_response(user)
    access = _set_session_cookies(response, db, user)
    return _auth_result(user, access)


async def _verified_google(credential: str) -> dict:
    try:
        return await verify_google_credential(credential)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@router.post("/google")
async def google_login(payload: GoogleCredentialRequest, response: Response, db: Session = Depends(get_db)):
    claims = await _verified_google(payload.credential)
    identity = db.query(AuthIdentity).filter_by(provider="google", subject=claims["sub"]).first()
    if identity:
        user = db.get(User, identity.user_id)
        if user is None:
            raise HTTPException(status_code=401, detail="Danh tính Google không còn tài khoản")
        if user.account_status != "active":
            return _status_response(user)
        access = _set_session_cookies(response, db, user)
        return _auth_result(user, access)
    email = normalize_email(claims["email"])
    if db.query(User).filter_by(email_normalized=email).first():
        return JSONResponse(status_code=409, content={"code": "ACCOUNT_LINK_REQUIRED", "message": "Nhập mật khẩu hiện tại để liên kết Google"})
    return JSONResponse(status_code=202, content={"code": "REGISTRATION_REQUIRED", "email": email, "ho_ten": claims.get("name") or email.split("@", 1)[0]})


@router.post("/google/complete-registration")
async def google_complete_registration(payload: GoogleRegistrationRequest, response: Response, db: Session = Depends(get_db)):
    claims = await _verified_google(payload.credential)
    _validate_pharmacist_fields(payload.vai_tro, payload.so_chung_chi_hanh_nghe, payload.noi_cong_tac)
    email = normalize_email(claims["email"])
    if db.query(AuthIdentity).filter_by(provider="google", subject=claims["sub"]).first():
        raise HTTPException(
            status_code=409,
            detail="Tài khoản Google này đã được đăng ký.\nVui lòng đăng nhập.",
        )
    if db.query(User).filter_by(email_normalized=email).first():
        raise HTTPException(
            status_code=409,
            detail="Email Google này đã được đăng ký bằng mật khẩu.\nVui lòng đăng nhập để liên kết Google.",
        )
    user = User(
        ho_ten=(claims.get("name") or email.split("@", 1)[0])[:255], email=email,
        email_normalized=email, email_verified_at=datetime.utcnow(), mat_khau_hash=None,
        vai_tro=payload.vai_tro,
        account_status="pending_pharmacist" if payload.vai_tro == "pharmacist" else "active",
        so_chung_chi_hanh_nghe=payload.so_chung_chi_hanh_nghe, noi_cong_tac=payload.noi_cong_tac,
    )
    db.add(user)
    db.flush()
    db.add(AuthIdentity(user_id=user.id, provider="google", subject=claims["sub"]))
    db.commit()
    db.refresh(user)
    if user.account_status != "active":
        return _status_response(user)
    access = _set_session_cookies(response, db, user)
    return _auth_result(user, access)


@router.post("/google/link")
async def google_link(payload: GoogleLinkRequest, response: Response, request: Request, db: Session = Depends(get_db)):
    claims = await _verified_google(payload.credential)
    email = normalize_email(claims["email"])
    key = f"{request.client.host if request.client else 'unknown'}:{email}"
    _enforce_rate_limit(db, "google_link_failed", key, 5, 15)
    if db.query(AuthIdentity).filter_by(provider="google", subject=claims["sub"]).first():
        raise HTTPException(status_code=409, detail="Tài khoản Google này đã được liên kết.")
    user = db.query(User).filter_by(email_normalized=email).first()
    if user is None or not verify_password(payload.mat_khau, user.mat_khau_hash):
        _record_event(db, "google_link_failed", key)
        raise HTTPException(status_code=401, detail="Mật khẩu hiện tại không đúng")
    if user.account_status == "locked" and user.lock_source != "legacy_migration":
        return _status_response(user)
    if password_needs_rehash(user.mat_khau_hash):
        user.mat_khau_hash = hash_password(payload.mat_khau)
    db.add(AuthIdentity(user_id=user.id, provider="google", subject=claims["sub"]))
    user.email_verified_at = user.email_verified_at or datetime.utcnow()
    if user.account_status in {"locked", "pending_email"}:
        user.account_status = "pending_pharmacist" if user.vai_tro == "pharmacist" else "active"
        user.lock_source = None
    db.commit()
    if user.account_status != "active":
        return _status_response(user)
    access = _set_session_cookies(response, db, user)
    return _auth_result(user, access)


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(payload: EmailRequest, background: BackgroundTasks, db: Session = Depends(get_db)) -> MessageResponse:
    email = normalize_email(payload.email)
    _enforce_rate_limit(db, "forgot", email, 3, 60)
    user = db.query(User).filter_by(email_normalized=email).first()
    if user is None:
        _record_event(db, "forgot", email)
        return MessageResponse(
            message=PASSWORD_RECOVERY_UNKNOWN_EMAIL_MESSAGE,
            code="EMAIL_NOT_REGISTERED",
        )
    token = issue_action_token(db, user.id, "reset_password", 30)
    background.add_task(send_password_reset_email, user.email, token)
    _record_event(db, "forgot", email)
    return MessageResponse(message=PASSWORD_RECOVERY_SENT_MESSAGE, code="PASSWORD_RESET_EMAIL_SENT")


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)) -> MessageResponse:
    user = consume_action_token(db, payload.token, "reset_password")
    if user is None:
        raise HTTPException(status_code=400, detail="Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn")
    user.mat_khau_hash = hash_password(payload.mat_khau_moi)
    db.query(RefreshSession).filter(RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None)).update({"revoked_at": datetime.utcnow()})
    db.commit()
    return MessageResponse(message="Mật khẩu đã được cập nhật", email=user.email)


@router.get("/me", response_model=AuthResponse)
async def me(current_user: User = Depends(get_current_user)) -> AuthResponse:
    return _auth_result(current_user)


@router.post("/refresh", response_model=AuthResponse)
async def refresh(request: Request, response: Response, db: Session = Depends(get_db)) -> AuthResponse:
    raw = request.cookies.get(REFRESH_COOKIE)
    rotated = rotate_refresh_session(db, raw or "")
    if rotated is None:
        _clear_session_cookies(response)
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn")
    new_raw, session = rotated
    user = db.get(User, session.user_id)
    if user is None or user.account_status != "active":
        revoke_refresh_session(db, new_raw)
        _clear_session_cookies(response)
        raise HTTPException(status_code=403, detail="Tài khoản chưa được kích hoạt")
    access = _set_session_cookies(response, db, user, new_raw)
    return _auth_result(user, access)


@router.post("/logout", status_code=204)
async def logout(request: Request, response: Response, db: Session = Depends(get_db)) -> Response:
    revoke_refresh_session(db, request.cookies.get(REFRESH_COOKIE))
    _clear_session_cookies(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@admin_router.get("/pharmacists/pending", response_model=list[PendingPharmacistInfo])
async def pending_pharmacists(_: User = Depends(require_role("admin")), db: Session = Depends(get_db)) -> list[PendingPharmacistInfo]:
    users = db.query(User).filter_by(vai_tro="pharmacist", account_status="pending_pharmacist").order_by(User.ngay_tao).all()
    return [PendingPharmacistInfo(user_id=u.id, ho_ten=u.ho_ten, email=u.email, so_chung_chi_hanh_nghe=u.so_chung_chi_hanh_nghe or "", noi_cong_tac=u.noi_cong_tac or "", ngay_tao=u.ngay_tao) for u in users]


@admin_router.post("/pharmacists/{user_id}/approve", response_model=MessageResponse)
async def approve_pharmacist(user_id: str, background: BackgroundTasks, _: User = Depends(require_role("admin")), db: Session = Depends(get_db)) -> MessageResponse:
    user = db.get(User, user_id)
    if user is None or user.vai_tro != "pharmacist" or user.account_status != "pending_pharmacist":
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ dược sĩ đang chờ")
    user.account_status = "active"
    user.ly_do_tu_choi = None
    db.commit()
    _invalidate_admin_overview_cache()
    background.add_task(send_pharmacist_decision_email, user.email, True)
    return MessageResponse(message="Đã duyệt tài khoản dược sĩ", account_status="active")


@admin_router.post("/pharmacists/{user_id}/reject", response_model=MessageResponse)
async def reject_pharmacist(user_id: str, payload: RejectPharmacistRequest, background: BackgroundTasks, _: User = Depends(require_role("admin")), db: Session = Depends(get_db)) -> MessageResponse:
    user = db.get(User, user_id)
    if user is None or user.vai_tro != "pharmacist" or user.account_status != "pending_pharmacist":
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ dược sĩ đang chờ")
    user.vai_tro = "patient"
    user.account_status = "active"
    user.ly_do_tu_choi = payload.ly_do.strip()
    db.commit()
    _invalidate_admin_overview_cache()
    background.add_task(send_pharmacist_decision_email, user.email, False, user.ly_do_tu_choi)
    return MessageResponse(message="Đã từ chối vai trò dược sĩ; tài khoản chuyển thành người dùng", account_status="active")


@admin_router.get("/overview", response_model=AdminOverview)
async def admin_overview(
    _: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
    db_facts: Session = Depends(get_db_facts),
) -> AdminOverview:
    global _admin_overview_cache
    now = monotonic()
    if _admin_overview_cache and now - _admin_overview_cache[0] < ADMIN_OVERVIEW_CACHE_TTL_SECONDS:
        return _admin_overview_cache[1]

    statement = select(
        func.count(User.id).label("total_users"),
        func.coalesce(func.sum(case((User.vai_tro == "patient", 1), else_=0)), 0).label("patients"),
        func.coalesce(func.sum(case((User.vai_tro == "pharmacist", 1), else_=0)), 0).label("pharmacists"),
        func.coalesce(func.sum(case((User.account_status == "locked", 1), else_=0)), 0).label("locked_users"),
        func.coalesce(
            func.sum(case((User.account_status == "pending_pharmacist", 1), else_=0)),
            0,
        ).label("pending_pharmacists"),
        select(func.count(Medication.id)).scalar_subquery().label("medications"),
        select(func.count(Product.id)).scalar_subquery().label("products"),
        select(func.count(FeedbackReport.id))
        .where(FeedbackReport.status != "resolved")
        .scalar_subquery()
        .label("open_feedback"),
    )
    stats = db.execute(statement).mappings().one()

    # interactions/food_interactions/disease_interactions nam tren CockroachDB (facts
    # DB) - khac engine voi cac bang tren, khong the gop chung 1 statement/subquery
    # nhu truoc (xem docs/database-split.md).
    facts_statement = select(
        select(func.count(Interaction.id)).scalar_subquery().label("drug_interactions"),
        select(func.count(FoodInteraction.id)).scalar_subquery().label("food_interactions"),
        select(func.count(DiseaseInteraction.id)).scalar_subquery().label("disease_interactions"),
    )
    facts_stats = db_facts.execute(facts_statement).mappings().one()

    overview = AdminOverview(
        total_users=stats["total_users"] or 0,
        patients=stats["patients"] or 0,
        pharmacists=stats["pharmacists"] or 0,
        locked_users=stats["locked_users"] or 0,
        pending_pharmacists=stats["pending_pharmacists"] or 0,
        medications=stats["medications"] or 0,
        products=stats["products"] or 0,
        drug_interactions=facts_stats["drug_interactions"] or 0,
        food_interactions=facts_stats["food_interactions"] or 0,
        disease_interactions=facts_stats["disease_interactions"] or 0,
        open_feedback=stats["open_feedback"] or 0,
    )
    _admin_overview_cache = (now, overview)
    return overview


@admin_router.get("/users", response_model=AdminUsersResponse)
async def admin_users(
    q: str = Query(default="", max_length=255),
    role: str | None = Query(default=None),
    account_status: str | None = Query(default=None),
    _: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> AdminUsersResponse:
    query = db.query(User).filter(User.vai_tro.in_(("patient", "pharmacist")))
    if q.strip():
        pattern = f"%{q.strip()}%"
        query = query.filter(or_(User.ho_ten.ilike(pattern), User.email.ilike(pattern)))
    if role in {"patient", "pharmacist"}:
        query = query.filter(User.vai_tro == role)
    if account_status:
        query = query.filter(User.account_status == account_status)
    total = query.count()
    users = query.order_by(User.ngay_tao.desc()).limit(200).all()
    return AdminUsersResponse(
        total=total,
        items=[
            AdminUserInfo(
                user_id=user.id,
                ho_ten=user.ho_ten,
                email=user.email,
                vai_tro=user.vai_tro,
                account_status=user.account_status,
                email_verified=user.email_verified_at is not None,
                ngay_tao=user.ngay_tao,
            )
            for user in users
        ],
    )


@admin_router.post("/users/{user_id}/status", response_model=MessageResponse)
async def update_user_status(
    user_id: str,
    payload: AdminAccountStatusRequest,
    admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    user = db.get(User, user_id)
    if user is None or user.vai_tro == "admin":
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản có thể quản lý")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Không thể thay đổi trạng thái tài khoản đang đăng nhập")
    if user.account_status not in {"active", "locked"}:
        raise HTTPException(status_code=409, detail="Tài khoản đang trong quy trình xác minh hoặc xét duyệt")
    user.account_status = payload.account_status
    if payload.account_status == "locked":
        user.lock_source = "admin"
        db.query(RefreshSession).filter(
            RefreshSession.user_id == user.id,
            RefreshSession.revoked_at.is_(None),
        ).update({RefreshSession.revoked_at: func.now()}, synchronize_session=False)
    else:
        user.lock_source = None
    db.commit()
    _invalidate_admin_overview_cache()
    action = "khóa" if payload.account_status == "locked" else "mở khóa"
    return MessageResponse(message=f"Đã {action} tài khoản", account_status=payload.account_status)


@admin_router.get("/drug-data", response_model=AdminDrugDataResponse)
async def admin_drug_data(
    q: str = Query(default="", max_length=255),
    kind: str = Query(default="medication"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=24, ge=1, le=100),
    _: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> AdminDrugDataResponse:
    pattern = f"%{q.strip()}%"
    if kind == "product":
        query = db.query(Product)
        if q.strip():
            query = query.filter(Product.ten_thuoc.ilike(pattern))
        total = query.count()
        rows = query.order_by(Product.ten_thuoc).offset((page - 1) * page_size).limit(page_size).all()
        items = [AdminDrugItem(id=row.id, name=row.ten_thuoc, detail=row.loai, source=row.nguon_du_lieu) for row in rows]
    else:
        query = db.query(Medication)
        if q.strip():
            query = query.filter(or_(Medication.ten_chuan_hoa.ilike(pattern), Medication.hoat_chat.ilike(pattern)))
        total = query.count()
        rows = query.order_by(Medication.ten_chuan_hoa).offset((page - 1) * page_size).limit(page_size).all()
        items = [AdminDrugItem(id=row.id, name=row.ten_chuan_hoa, detail=row.hoat_chat, source=row.nguon_du_lieu) for row in rows]
    return AdminDrugDataResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


@admin_router.get("/feedback", response_model=list[FeedbackInfo])
async def admin_feedback(
    feedback_status: str | None = Query(default=None, alias="status"),
    _: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> list[FeedbackInfo]:
    query = db.query(FeedbackReport, User).join(User, User.id == FeedbackReport.user_id)
    if feedback_status:
        query = query.filter(FeedbackReport.status == feedback_status)
    rows = query.order_by(FeedbackReport.ngay_tao.desc()).limit(200).all()
    return [
        FeedbackInfo(
            id=feedback.id,
            user_id=user.id,
            user_name=user.ho_ten,
            user_email=user.email,
            category=feedback.category,
            title=feedback.title,
            description=feedback.description,
            status=feedback.status,
            resolution_note=feedback.resolution_note,
            ngay_tao=feedback.ngay_tao,
            ngay_cap_nhat=feedback.ngay_cap_nhat,
        )
        for feedback, user in rows
    ]


@admin_router.patch("/feedback/{feedback_id}", response_model=FeedbackInfo)
async def update_feedback(
    feedback_id: str,
    payload: FeedbackUpdateRequest,
    _: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> FeedbackInfo:
    feedback = db.get(FeedbackReport, feedback_id)
    if feedback is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy phản hồi")
    user = db.get(User, feedback.user_id)
    user_name = user.ho_ten if user else "Người dùng"
    user_email = user.email if user else ""
    feedback.status = payload.status
    feedback.resolution_note = payload.resolution_note.strip() if payload.resolution_note else None
    feedback.ngay_cap_nhat = datetime.utcnow()
    db.commit()
    _invalidate_admin_overview_cache()
    return FeedbackInfo(
        id=feedback.id,
        user_id=feedback.user_id,
        user_name=user_name,
        user_email=user_email,
        category=feedback.category,
        title=feedback.title,
        description=feedback.description,
        status=feedback.status,
        resolution_note=feedback.resolution_note,
        ngay_tao=feedback.ngay_tao,
        ngay_cap_nhat=feedback.ngay_cap_nhat,
    )
