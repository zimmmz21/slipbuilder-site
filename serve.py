#!/usr/bin/env python3
"""Local SlipBuilder demo server. Reads the real agent ledger; no odds APIs."""

import json
import os
from datetime import date
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "8765"))
HOST = os.environ.get("HOST", "0.0.0.0")

LEDGER_PATH = os.environ.get(
    "SLIPBUILDER_LEDGER",
    os.path.join(ROOT, "data", "slip-ledger.json"),
)
DATA_DIR = os.path.join(ROOT, "data")


def _pick_grade(pick):
    raw = pick.get("grade")
    if raw is None or raw == "":
        raw = pick.get("status") or ""
    return str(raw).strip().upper()


def _slim_pick(pick):
    out = {
        "player": pick.get("player"),
        "stat": pick.get("stat"),
        "line": pick.get("line"),
        "side": pick.get("side"),
        "category": pick.get("category"),
        "grade": _pick_grade(pick) or None,
    }
    if pick.get("conf") is not None:
        out["conf"] = pick.get("conf")
    return out


def _slim_slip(slip):
    return {
        "date": slip.get("date"),
        "header": slip.get("header"),
        "games": list(slip.get("games") or []),
        "mode": slip.get("mode"),
        "picks": [_slim_pick(p) for p in (slip.get("picks") or [])],
    }


def _slip_grades(slip):
    return [_pick_grade(p) for p in (slip.get("picks") or [])]


def _is_pending_slip(slip):
    grades = _slip_grades(slip)
    if not grades:
        return False
    return all(g == "PENDING" or g == "" for g in grades)


def _is_graded_slip(slip):
    grades = _slip_grades(slip)
    return any(g in ("HIT", "MISS", "VOID") for g in grades)


def build_from_ledger(ledger_path):
    with open(ledger_path, "r", encoding="utf-8") as fh:
        ledger = json.load(fh)

    hits = misses = voids = pending = 0
    for slip in ledger.get("slips") or []:
        for pick in slip.get("picks") or []:
            grade = _pick_grade(pick)
            if grade == "HIT":
                hits += 1
            elif grade == "MISS":
                misses += 1
            elif grade == "VOID":
                voids += 1
            else:
                pending += 1

    graded = hits + misses  # non-VOID graded picks
    hit_rate = (hits / graded) if graded else None

    latest_pending = None
    latest_graded = None
    for slip in ledger.get("slips") or []:
        if _is_pending_slip(slip):
            latest_pending = slip
        if _is_graded_slip(slip):
            latest_graded = slip

    summary = {
        "hits": hits,
        "misses": misses,
        "voids": voids,
        "pending": pending,
        "graded": graded,
        "hit_rate": round(hit_rate, 4) if hit_rate is not None else None,
        "as_of": date.today().isoformat(),
        "source": "slip-ledger.json",
    }
    return summary, _slim_slip(latest_pending) if latest_pending else None, _slim_slip(latest_graded) if latest_graded else None



def _load_existing():
    def read(name):
        path = os.path.join(DATA_DIR, name)
        if not os.path.exists(path):
            return None
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)

    summary = read("summary.json") or {
        "hits": 0,
        "misses": 0,
        "voids": 0,
        "pending": 0,
        "graded": 0,
        "hit_rate": None,
        "as_of": date.today().isoformat(),
    }
    return summary


def refresh_data_files():
    os.makedirs(DATA_DIR, exist_ok=True)
    summary_path = os.path.join(DATA_DIR, "summary.json")
    pending_path = os.path.join(DATA_DIR, "latest-pending.json")
    graded_path = os.path.join(DATA_DIR, "latest-graded.json")

    try:
        summary, pending, graded = build_from_ledger(LEDGER_PATH)
    except Exception as exc:
        print("Ledger refresh failed, keeping bundled data: %s" % exc)
        return _load_existing()

    with open(summary_path, "w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=2)
        fh.write("\n")
    with open(pending_path, "w", encoding="utf-8") as fh:
        json.dump(pending, fh, indent=2)
        fh.write("\n")
    with open(graded_path, "w", encoding="utf-8") as fh:
        json.dump(graded, fh, indent=2)
        fh.write("\n")

    return summary


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        # Refresh ledger-derived JSON on each request so the panel stays current.
        refresh_data_files()
        return super().do_GET()

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))


def main():
    summary = refresh_data_files()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print("SlipBuilder  http://%s:%s" % (HOST, PORT))
    print("Ledger: %s" % LEDGER_PATH)
    print(
        "Hit rate: %s hits / %s misses / %s pending (voids %s) → %s"
        % (
            summary.get("hits"),
            summary.get("misses"),
            summary.get("pending"),
            summary.get("voids"),
            summary.get("hit_rate"),
        )
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
