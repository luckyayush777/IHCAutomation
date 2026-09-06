"""Run the standalone schedule prototype: python doctor_scheduler/server.py."""

import argparse
import csv
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent


class ScheduleHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if urlsplit(self.path).path != "/api/schedule":
            return super().do_GET()
        try:
            with (ROOT / "data" / "schedule.csv").open(encoding="utf-8-sig", newline="") as source:
                shifts = list(csv.DictReader(source))
            profiles = json.loads((ROOT / "data" / "profiles.json").read_text(encoding="utf-8"))
            modified = max(path.stat().st_mtime for path in (ROOT / "data").iterdir() if path.is_file())
            payload = json.dumps({**profiles, "shifts": shifts,
                                  "updated_at": datetime.fromtimestamp(modified, timezone.utc).isoformat()}).encode()
        except (OSError, ValueError):
            self.send_error(500, "Schedule data could not be read")
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    handler = partial(ScheduleHandler, directory=str(ROOT))
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"IHC schedule: http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
