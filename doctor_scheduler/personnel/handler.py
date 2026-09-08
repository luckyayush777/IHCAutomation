"""One CGI request: render a form, or verify credentials and save a POST."""

from datetime import datetime
from http import HTTPStatus
import logging
import os
import sys
from urllib.parse import parse_qsl, urlsplit

from personnel.store import UpdateError, IST, initialize, read_day, save
from build_health_centre import build, read_cache, template_environment
from settings import load_settings

MAX_BODY = 65536


def parse_form(raw, names):
    try:
        pairs = parse_qsl(raw.decode("utf-8"), keep_blank_values=True, strict_parsing=True,
                          encoding="utf-8", errors="strict", max_num_fields=len(names) + 3)
    except (ValueError, UnicodeError):
        raise UpdateError(400, "Malformed status form.") from None
    values = dict(pairs)
    if len(values) != len(pairs) or not {"date", "username", "password"} <= values.keys():
        raise UpdateError(400, "Missing or duplicate form fields.")
    updates = {}
    for key, value in values.items():
        if key in {"date", "username", "password"}:
            continue
        if not key.startswith("person:") or key[7:] not in names:
            raise UpdateError(400, "Unknown status field.")
        if value:
            if value not in {"in", "out"}:
                raise UpdateError(400, "Choose In or Out.")
            updates[key[7:]] = {"in": "present", "out": "absent"}[value]
    return values, updates


def handle(settings, environ, stream, now=None, *, local_preview=False):
    now = now or datetime.now(IST)
    day = now.astimezone(IST).date().isoformat()
    status, message, doctors, records = 200, "", [], {}
    try:
        origin = urlsplit(settings.origin)
        local_http = (local_preview and origin.scheme == "http" and origin.hostname == "127.0.0.1"
                      and environ.get("REMOTE_ADDR") == "127.0.0.1")
        if (origin.scheme != "https" and not local_http) or not origin.netloc or origin.path:
            raise UpdateError(503, "Status needs its HTTPS origin configured by the administrator.")
        method = environ.get("REQUEST_METHOD", "GET")
        if method not in {"GET", "POST"}:
            raise UpdateError(405, "Use GET for the form or POST to save personnel.")
        if environ.get("QUERY_STRING"):
            raise UpdateError(400, "Use the form without query parameters.")
        saved = read_cache(settings)
        doctors = saved["data"].get("personnel") or [
            {"name": person["name"], "user_id": "", "category": "Doctor"}
            for person in saved["data"]["doctors"]]
        initialize(settings.database)
        records = read_day(settings.database, day)
        if method == "POST":
            if environ.get("HTTP_ORIGIN") != settings.origin:
                raise UpdateError(403, "Form origin could not be verified. Open the form from the institute website.")
            if environ.get("CONTENT_TYPE", "").split(";")[0].strip().lower() != "application/x-www-form-urlencoded":
                raise UpdateError(415, "Submit the status form as form data.")
            try:
                length = int(environ.get("CONTENT_LENGTH", ""))
            except ValueError:
                raise UpdateError(400, "Invalid request length.") from None
            if not 0 < length <= MAX_BODY:
                raise UpdateError(413, "Form is too large or empty.")
            raw = stream.read(length)
            if len(raw) != length:
                raise UpdateError(400, "Incomplete form submission.")
            names = {doctor["name"] for doctor in doctors}
            values, updates = parse_form(raw, names)
            save(settings.database, values["username"], values["password"], environ.get("REMOTE_ADDR", "unknown"),
                 values["date"], updates, names, now)
            try:
                build(settings, cached=True, now=now)
                message = "Data updated."
            except Exception as error:
                logging.error("Status saved but publication failed (%s)", type(error).__name__)
                message = "Status saved. Public page regeneration failed; the next successful scheduled build will publish it."
        records = read_day(settings.database, day)
    except UpdateError as error:
        status, message = error.status, str(error)
    except Exception as error:
        logging.error("Status request failed (%s)", type(error).__name__)
        status, message = 503, "Status is temporarily unavailable. Contact the health centre administrator."
    html = template_environment().get_template("personnel/form.html").render(
        day=day, doctors=doctors, records=records, message=message, action=settings.update_url,
        labels={"present": "In", "absent": "Out", "unconfirmed": "In/Out"})
    return status, html


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        # Explicit config path; no reliance on Apache's working directory.
        settings = load_settings(os.environ.get("IHC_CONFIG", "/etc/ihc/config.json"))
        status, html = handle(settings, os.environ, sys.stdin.buffer)
    except Exception as error:
        logging.error("CGI configuration failed (%s)", type(error).__name__)
        status, html = 503, "<!doctype html><html lang='en'><title>Status unavailable</title><p>Status is temporarily unavailable.</p></html>"
    headers = [f"Status: {status} {HTTPStatus(status).phrase}", "Content-Type: text/html; charset=utf-8",
               "Cache-Control: no-store", "X-Content-Type-Options: nosniff", "Referrer-Policy: same-origin",
               "Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"]
    if status == 429:
        headers.append("Retry-After: 300")
    sys.stdout.buffer.write(("\r\n".join(headers) + "\r\n\r\n" + html).encode("utf-8"))


if __name__ == "__main__":
    main()
