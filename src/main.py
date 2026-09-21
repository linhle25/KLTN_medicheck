import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.api.auth_routes import admin_router
from src.api.auth_routes import router as auth_router
from src.api.routes import router
from src.config import get_settings, validate_production_auth_settings
from src.db.session import assert_auth_schema_ready, init_db

# log_level trong Settings trước đây khai báo nhưng chưa từng gọi basicConfig để áp
# dụng thật - logger.info() ở bất kỳ đâu trong app đều bị nuốt im lặng (root logger
# mặc định chỉ in từ WARNING trở lên khi chưa cấu hình). Gọi ở đây, TRƯỚC khi import
# các module khác log gì, để bật đúng log_level cho toàn app (bao gồm log đo thời
# gian ở agents/graph.py và api/routes.py).
logging.basicConfig(level=get_settings().log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    validate_production_auth_settings(settings)
    print(f"Starting {settings.app_name} in {settings.app_env} mode")
    init_db()
    assert_auth_schema_ready()
    yield
    print("Shutting down...")


app = FastAPI(
    title="MediCheck API",
    description="API kiểm tra tương tác thuốc",
    version="1.0.0",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def cookie_csrf_and_origin_guard(request: Request, call_next):
    """Protect cookie-authenticated mutations without breaking legacy Bearer clients."""
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        allowed = {origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()}
        origin = request.headers.get("origin")
        if origin and origin not in allowed:
            return JSONResponse(status_code=403, content={"detail": "Origin khong duoc phep"})
        uses_bearer = request.headers.get("authorization", "").startswith("Bearer ")
        auth_bootstrap_path = request.url.path in {
            "/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/google",
            "/api/v1/auth/google/complete-registration", "/api/v1/auth/google/link",
            "/api/v1/auth/verify-email", "/api/v1/auth/resend-verification",
            "/api/v1/auth/forgot-password", "/api/v1/auth/reset-password",
        }
        uses_auth_cookie = not uses_bearer and not auth_bootstrap_path and bool(
            request.cookies.get("medguard_access") or request.cookies.get("medguard_refresh")
        )
        if uses_auth_cookie:
            csrf_cookie = request.cookies.get("medguard_csrf")
            csrf_header = request.headers.get("x-csrf-token")
            if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
                return JSONResponse(status_code=403, content={"detail": "CSRF token khong hop le"})
    return await call_next(request)

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Đảm bảo lỗi 500 vẫn có CORS header (mặc định Starlette xử lý exception chưa bắt
    # ở ServerErrorMiddleware, nằm ngoài CORSMiddleware, nên trình duyệt thấy network error
    # thay vì lỗi 500 thật - khiến frontend luôn hiện thông báo lỗi chung chung).
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})


app.include_router(auth_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "env": settings.app_env}
