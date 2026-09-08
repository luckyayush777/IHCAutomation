"""Server-only, read-only Google Sheets access. Never send credentials to the browser."""

import os
from pathlib import Path

from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account

ROOT = Path(__file__).resolve().parent
SPREADSHEET_ID = os.environ.get(
    "IHC_SPREADSHEET_ID", "1ly7oTO9hWSTxfOr1di7H7LMHRgZutOsmfdxJQQhj-KA"
)


class SheetsClient:
    def __init__(self, credential_path="", spreadsheet_id=SPREADSHEET_ID):
        credential_path = credential_path or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if not credential_path:
            candidates = sorted((ROOT / "keys").glob("*.json"))
            if len(candidates) != 1:
                raise ValueError("Set GOOGLE_APPLICATION_CREDENTIALS to the service-account JSON file.")
            credential_path = str(candidates[0])
        credentials = service_account.Credentials.from_service_account_file(
            credential_path, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
        )
        self.session = AuthorizedSession(credentials, refresh_timeout=20, max_refresh_attempts=0)
        self.base_url = f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}"

    def read_workbook(self):
        # A single request contains both tab names and populated cell values. No
        # separate metadata lookup, per-tab calls, or automatic Sheets retries.
        response = self.session.get(self.base_url, params={
            "includeGridData": "true",
            "fields": "sheets(properties(title),data(rowData(values(formattedValue))))",
        }, timeout=20, allow_redirects=False)
        if not response.ok:
            # Do not log response/request details that could contain credentials or cell data.
            raise RuntimeError(f"Google Sheets returned HTTP {response.status_code}. Check sheet sharing and Sheets API access.")
        return response.json()
