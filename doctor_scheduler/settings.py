"""Shared file configuration; paths never depend on cron's working directory."""

from dataclasses import dataclass
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent


@dataclass
class Settings:
    data_dir: Path = ROOT / "storage"
    public_dir: Path = ROOT / "public"
    credentials: str = ""
    spreadsheet_id: str = os.environ.get("IHC_SPREADSHEET_ID", "1ly7oTO9hWSTxfOr1di7H7LMHRgZutOsmfdxJQQhj-KA")
    update_url: str = "/ihc/personnel.cgi"
    origin: str = ""

    @property
    def database(self):
        return self.data_dir / "attendance.sqlite"


def load_settings(path=None):
    path = path or os.environ.get("IHC_CONFIG")
    values = json.loads(Path(path).read_text(encoding="utf-8")) if path else {}
    for key in ("data_dir", "public_dir"):
        if key in values:
            values[key] = Path(values[key])
            if not values[key].is_absolute():
                raise ValueError(f"{key} must be an absolute path")
    settings = Settings(**values)
    if settings.data_dir.resolve().is_relative_to(settings.public_dir.resolve()):
        raise ValueError("Private data must be outside the public directory")
    if settings.credentials and (not Path(settings.credentials).is_absolute() or
                                 Path(settings.credentials).resolve().is_relative_to(settings.public_dir.resolve())):
        raise ValueError("Credentials require an absolute path outside the public directory")
    if not settings.update_url.startswith("/") or settings.update_url.startswith("//"):
        raise ValueError("Update URL must be a local absolute path")
    return settings
