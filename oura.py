"""
Pull the last 30 days of Oura sleep and readiness scores.

First run: opens your browser so you can log in to Oura and approve access.
After that: reuses the saved login (tokens.json) and refreshes it when needed.
"""
import json
import os
import secrets
import time
import webbrowser
from datetime import date, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlencode, urlparse

import requests
from dotenv import load_dotenv

load_dotenv()  # reads OURA_CLIENT_ID and OURA_CLIENT_SECRET from .env
CLIENT_ID = os.environ["OURA_CLIENT_ID"]
CLIENT_SECRET = os.environ["OURA_CLIENT_SECRET"]

REDIRECT_URI = "http://localhost:8080/callback"  # must match your Oura app exactly
SCOPES = "daily heartrate workout"
TOKEN_FILE = "tokens.json"
AUTH_URL = "https://cloud.ouraring.com/oauth/authorize"
TOKEN_URL = "https://api.ouraring.com/oauth/token"
API_BASE = "https://api.ouraring.com/v2/usercollection"


def save_tokens(tokens):
    # Remember when the access token expires (with a 60-second safety margin)
    tokens["expires_at"] = time.time() + tokens.get("expires_in", 0) - 60
    with open(TOKEN_FILE, "w") as f:
        json.dump(tokens, f)
    return tokens


def login():
    """Open the browser, let you approve access, and catch Oura's redirect."""
    state = secrets.token_urlsafe(16)
    result = {}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            parsed = urlparse(self.path)
            if parsed.path == "/callback":
                result.update({k: v[0] for k, v in parse_qs(parsed.query).items()})
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h2>Connected to Oura. You can close this tab.</h2>")

        def log_message(self, *args):
            pass  # keep the terminal quiet

    query = urlencode({
        "response_type": "code",
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "scope": SCOPES,
        "state": state,
    })
    print("Opening your browser to log in to Oura...")
    webbrowser.open(f"{AUTH_URL}?{query}")

    server = HTTPServer(("localhost", 8080), Handler)
    while "code" not in result and "error" not in result:
        server.handle_request()
    server.server_close()

    if "error" in result:
        raise SystemExit(f"Login failed: {result['error']}")
    if result.get("state") != state:
        raise SystemExit("Login failed: state mismatch")

    resp = requests.post(TOKEN_URL, data={
        "grant_type": "authorization_code",
        "code": result["code"],
        "redirect_uri": REDIRECT_URI,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    })
    resp.raise_for_status()
    return save_tokens(resp.json())


def drop_saved_login():
    if os.path.exists(TOKEN_FILE):
        os.remove(TOKEN_FILE)


def refresh_or_login(tokens):
    """One refresh. invalid_grant deletes the saved login. A 403 is not a revoke."""
    resp = requests.post(TOKEN_URL, data={
        "grant_type": "refresh_token",
        "refresh_token": tokens["refresh_token"],
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    })
    if "invalid_grant" in resp.text:
        drop_saved_login()
        print("Oura access was revoked. Saved login removed.")
        return login()["access_token"]
    if resp.status_code != 200:
        print("Saved login no longer valid, logging in again...")
        return login()["access_token"]
    new_tokens = resp.json()
    new_tokens.setdefault("refresh_token", tokens["refresh_token"])
    return save_tokens(new_tokens)["access_token"]


def get_access_token():
    """Use the saved token, refresh it if expired, or log in if there's none."""
    if not os.path.exists(TOKEN_FILE):
        return login()["access_token"]

    with open(TOKEN_FILE) as f:
        tokens = json.load(f)
    if time.time() < tokens["expires_at"]:
        return tokens["access_token"]
    return refresh_or_login(tokens)


def fetch(endpoint, token, days=30):
    params = {
        "start_date": (date.today() - timedelta(days=days)).isoformat(),
        "end_date": date.today().isoformat(),
    }
    resp = requests.get(
        f"{API_BASE}/{endpoint}",
        headers={"Authorization": f"Bearer {token}"},
        params=params,
    )
    if resp.status_code == 403:
        raise SystemExit("Oura membership inactive. Saved login was kept.")
    if resp.status_code == 401 and os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE) as f:
            tokens = json.load(f)
        token = refresh_or_login(tokens)
        resp = requests.get(
            f"{API_BASE}/{endpoint}",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
        )
        if resp.status_code == 401:
            drop_saved_login()
            raise SystemExit("Oura access was revoked. Saved login removed.")
        if resp.status_code == 403:
            raise SystemExit("Oura membership inactive. Saved login was kept.")
    resp.raise_for_status()
    return resp.json()["data"]


if __name__ == "__main__":
    token = get_access_token()
    sleep = {d["day"]: d.get("score") for d in fetch("daily_sleep", token)}
    readiness = {d["day"]: d.get("score") for d in fetch("daily_readiness", token)}

    print(f"\n{'Date':<12}{'Sleep':>7}{'Readiness':>11}")
    for day in sorted(set(sleep) | set(readiness)):
        print(f"{day:<12}{str(sleep.get(day) or '-'):>7}{str(readiness.get(day) or '-'):>11}")
