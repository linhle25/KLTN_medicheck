#!/usr/bin/env python3
"""Lay Gmail OAuth refresh token de backend gui email qua Gmail API (thay SMTP).

Chi chay 1 LAN DUY NHAT, tren may local, dang nhap dung tai khoan Gmail dung
de gui mail (vi du medichecksupport@gmail.com). Xem huong dan day du kem theo
script nay (docs/gmail-api-setup.md) truoc khi chay.

Usage:
  python scripts/gmail_oauth_setup.py --client-id XXX --client-secret YYY
"""
import argparse
import json
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer

REDIRECT_URI = "http://localhost:8080/"
SCOPE = "https://www.googleapis.com/auth/gmail.send"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"

_received_code: str | None = None


class _CallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        global _received_code
        query = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(query)
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        if "code" in params:
            _received_code = params["code"][0]
            self.wfile.write(
                "<h2>Da xac thuc xong. Dong tab nay va quay lai terminal.</h2>".encode()
            )
        else:
            self.wfile.write(
                f"<h2>Loi: {params.get('error', ['khong ro'])[0]}</h2>".encode()
            )

    def log_message(self, format: str, *args) -> None:  # noqa: A002 - im lang server log
        pass


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--client-id", required=True)
    parser.add_argument("--client-secret", required=True)
    args = parser.parse_args()

    auth_url = AUTH_URL + "?" + urllib.parse.urlencode({
        "client_id": args.client_id,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent",
    })

    print("Dang mo trinh duyet de dang nhap Gmail...")
    print("Neu khong tu mo duoc, hay tu copy link nay vao trinh duyet:\n")
    print(auth_url, "\n")
    webbrowser.open(auth_url)

    server = HTTPServer(("localhost", 8080), _CallbackHandler)
    print("Dang cho xac thuc tren trinh duyet (dang nhap dung tai khoan Gmail se dung de gui mail)...")
    server.handle_request()

    if _received_code is None:
        raise SystemExit("Khong nhan duoc authorization code. Thu lai.")

    token_body = urllib.parse.urlencode({
        "code": _received_code,
        "client_id": args.client_id,
        "client_secret": args.client_secret,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code",
    }).encode()

    request = urllib.request.Request(TOKEN_URL, data=token_body, method="POST")
    with urllib.request.urlopen(request) as response:
        token_data = json.loads(response.read())

    refresh_token = token_data.get("refresh_token")
    if not refresh_token:
        print("KHONG co refresh_token trong ket qua:", token_data)
        print(
            "\nNguyen nhan thuong gap: tai khoan nay da tung cap quyen truoc do."
            " Vao https://myaccount.google.com/permissions, go quyen truy cap cua"
            " app OAuth nay, roi chay lai script."
        )
        raise SystemExit(1)

    print("\n=== THANH CONG ===")
    print("GMAIL_OAUTH_REFRESH_TOKEN =", refresh_token)
    print("\nDan gia tri nay vao bien moi truong GMAIL_OAUTH_REFRESH_TOKEN tren Render.")


if __name__ == "__main__":
    main()
