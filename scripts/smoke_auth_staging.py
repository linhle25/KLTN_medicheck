"""Smoke-test a deployed MediCheck auth API without printing credentials.

Required environment variables:
  STAGING_API_URL, STAGING_FRONTEND_URL,
  SMOKE_AUTH_EMAIL, SMOKE_AUTH_PASSWORD

Set SMOKE_CROSS_SITE=true when frontend and API are on different sites.
"""
import os
import sys

import httpx


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Thieu bien moi truong {name}")
    return value


def _assert(response: httpx.Response, expected: int, step: str) -> None:
    if response.status_code != expected:
        raise RuntimeError(f"{step}: HTTP {response.status_code} (mong doi {expected})")


def main() -> int:
    api_url = _required("STAGING_API_URL").rstrip("/")
    frontend_url = _required("STAGING_FRONTEND_URL").rstrip("/")
    email = _required("SMOKE_AUTH_EMAIL")
    password = _required("SMOKE_AUTH_PASSWORD")
    cross_site = os.getenv("SMOKE_CROSS_SITE", "false").lower() == "true"

    with httpx.Client(
        base_url=api_url,
        headers={"Origin": frontend_url},
        follow_redirects=False,
        timeout=20,
    ) as client:
        health = client.get("/health")
        _assert(health, 200, "health")

        csrf_response = client.get("/api/v1/auth/csrf")
        _assert(csrf_response, 200, "csrf")
        if csrf_response.headers.get("access-control-allow-origin") != frontend_url:
            raise RuntimeError("CORS khong cho phep STAGING_FRONTEND_URL")
        csrf = csrf_response.json()["csrf_token"]

        login = client.post(
            "/api/v1/auth/login",
            headers={"X-CSRF-Token": csrf},
            json={"email": email, "mat_khau": password},
        )
        _assert(login, 200, "login")
        set_cookies = login.headers.get_list("set-cookie")
        session_cookies = [value.lower() for value in set_cookies if "medguard_access=" in value.lower() or "medguard_refresh=" in value.lower()]
        if len(session_cookies) != 2 or any("httponly" not in value or "secure" not in value for value in session_cookies):
            raise RuntimeError("Access/refresh cookie staging phai co HttpOnly va Secure")
        if cross_site and any("samesite=none" not in value for value in session_cookies):
            raise RuntimeError("Cookie cross-site phai dung SameSite=None")

        _assert(client.get("/api/v1/auth/me"), 200, "me")
        old_refresh = client.cookies.get("medguard_refresh")
        refresh = client.post("/api/v1/auth/refresh", headers={"X-CSRF-Token": csrf})
        _assert(refresh, 200, "refresh")
        if not old_refresh or client.cookies.get("medguard_refresh") == old_refresh:
            raise RuntimeError("Refresh token khong duoc xoay")

        with httpx.Client(base_url=api_url, headers={"Origin": frontend_url}, timeout=20) as replay:
            replay_response = replay.post(
                "/api/v1/auth/refresh",
                headers={
                    "Cookie": f"medguard_refresh={old_refresh}; medguard_csrf={csrf}",
                    "X-CSRF-Token": csrf,
                },
            )
            _assert(replay_response, 401, "old refresh replay")

        _assert(client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf}), 204, "logout")
        _assert(client.get("/api/v1/auth/me"), 401, "me after logout")

    print("Staging auth smoke test passed")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, httpx.HTTPError) as exc:
        print(f"Staging auth smoke test failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
