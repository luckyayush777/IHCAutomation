"""Server-only, read-only Google Sheets access. Never send credentials to the browser."""

import json
import os
from pathlib import Path
import sqlite3
import time

from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account

ROOT = Path(__file__).resolve().parent
SPREADSHEET_ID = os.environ.get(
    "IHC_SPREADSHEET_ID", "1ly7oTO9hWSTxfOr1di7H7LMHRgZutOsmfdxJQQhj-KA"
)
REFRESH_SECONDS = 120


class ReadCooldown(Exception):
    def __init__(self, retry_at):
        super().__init__("Google Sheets read is cached until the next two-minute interval")
        self.retry_at = retry_at


class ReadLimiter:
    """Reserve attempts atomically across threads, processes, and local restarts."""

    def __init__(self, path):
        self.path = path
        path.parent.mkdir(exist_ok=True)
        with sqlite3.connect(path) as connection:
            connection.execute("CREATE TABLE IF NOT EXISTS reads (sheet TEXT PRIMARY KEY, next_at REAL NOT NULL)")
            # Honour a previously saved roster when upgrading/restarting this server.
            snapshot = path.parent / "roster.json"
            if snapshot.exists():
                try:
                    from datetime import datetime
                    saved = json.loads(snapshot.read_text(encoding="utf-8"))
                    if saved["spreadsheet_id"] == SPREADSHEET_ID:
                        next_at = datetime.fromisoformat(saved["updated_at"]).timestamp() + REFRESH_SECONDS
                        connection.execute("INSERT OR IGNORE INTO reads VALUES (?, ?)", (SPREADSHEET_ID, next_at))
                except (ValueError, KeyError, OSError):
                    pass

    def reserve(self):
        with sqlite3.connect(self.path, timeout=5) as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute("SELECT next_at FROM reads WHERE sheet = ?", (SPREADSHEET_ID,)).fetchone()
            now = time.time()
            if row and now < row[0]:
                raise ReadCooldown(row[0])
            connection.execute("INSERT OR REPLACE INTO reads VALUES (?, ?)", (SPREADSHEET_ID, now + REFRESH_SECONDS))


class SheetsClient:
    def __init__(self):
        credential_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if not credential_path:
            candidates = sorted((ROOT / "keys").glob("*.json"))
            if len(candidates) != 1:
                raise ValueError("Set GOOGLE_APPLICATION_CREDENTIALS to the service-account JSON file.")
            credential_path = str(candidates[0])
        credentials = service_account.Credentials.from_service_account_file(
            credential_path, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
        )
        self.session = AuthorizedSession(credentials, refresh_timeout=20, max_refresh_attempts=0)
        self.base_url = f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}"
        self.limiter = ReadLimiter(ROOT / ".cache" / "sheets-reads.sqlite")

    def read_workbook(self):
        # A single request contains both tab names and populated cell values. No
        # separate metadata lookup, per-tab calls, or automatic Sheets retries.
        self.limiter.reserve()
        response = self.session.get(self.base_url, params={
            "includeGridData": "true",
            "fields": "sheets(properties(title),data(rowData(values(formattedValue))))",
        }, timeout=20, allow_redirects=False)
        if not response.ok:
            # Do not log response/request details that could contain credentials or cell data.
            raise RuntimeError(f"Google Sheets returned HTTP {response.status_code}. Check sheet sharing and Sheets API access.")
        return response.json()

if __name__ == "__main__":
    print("Start server.py to read the shared roster cache. Direct inspection reads are disabled.")
