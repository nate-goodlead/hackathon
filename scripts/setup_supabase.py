#!/usr/bin/env python3
"""
Configure an EXISTING Supabase project (no Management API token required).

Required in .env:
  SUPABASE_URL=https://<ref>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=eyJ...
  SUPABASE_DB_PASSWORD=...   (Settings → Database → password)

Optional:
  SUPABASE_STORAGE_BUCKET=uploads (default)
  DATABASE_URL=postgresql://...  (overrides URL + password)
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / ".env"
MIGRATIONS = ROOT / "supabase" / "migrations"


def load_dotenv() -> None:
    if not ENV_PATH.exists():
        return
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        if key.strip() and key.strip() not in os.environ:
            os.environ[key.strip()] = val.strip()


def project_ref(url: str) -> str:
    m = re.search(r"https://([a-z0-9]+)\.supabase\.co", url)
    if not m:
        raise SystemExit(f"Cannot parse project ref from SUPABASE_URL: {url}")
    return m.group(1)


def db_connect_params() -> dict:
    if os.environ.get("DATABASE_URL"):
        return {"dsn": os.environ["DATABASE_URL"]}
    ref = project_ref(os.environ["SUPABASE_URL"])
    password = os.environ.get("SUPABASE_DB_PASSWORD", "")
    if not password:
        raise SystemExit(
            "Missing SUPABASE_DB_PASSWORD (or DATABASE_URL).\n"
            "Find it in Supabase Dashboard → Project Settings → Database."
        )
    region = os.environ.get("SUPABASE_POOLER_REGION", "eu-west-1")
    pooler_host = f"aws-0-{region}.pooler.supabase.com"
    # Direct db.*.supabase.co is often IPv6-only; pooler has IPv4 and works from most networks.
    return {
        "host": pooler_host,
        "port": 5432,
        "user": f"postgres.{ref}",
        "password": password,
        "dbname": "postgres",
        "connect_timeout": 30,
        "sslmode": "require",
    }


def apply_migrations(params: dict) -> None:
    try:
        import psycopg2
    except ImportError:
        subprocess.run(
            [str(ROOT / ".venv/bin/pip"), "install", "-q", "psycopg2-binary"],
            check=True,
        )
        import psycopg2

    with psycopg2.connect(**params) as pg:
        pg.autocommit = True
        with pg.cursor() as cur:
            for sql_file in sorted(MIGRATIONS.glob("*.sql")):
                print(f"Applying {sql_file.name}…")
                cur.execute(sql_file.read_text(encoding="utf-8"))


def create_bucket(url: str, service_key: str, bucket: str) -> None:
    body = json.dumps({"id": bucket, "name": bucket, "public": False}).encode()
    req = urllib.request.Request(
        f"{url.rstrip('/')}/storage/v1/bucket",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {service_key}",
            "apikey": service_key,
            "Content-Type": "application/json",
        },
    )
    try:
        urllib.request.urlopen(req, timeout=30)
        print(f"Storage bucket '{bucket}' ready.")
    except urllib.error.HTTPError as e:
        if e.code == 409:
            print(f"Storage bucket '{bucket}' already exists.")
        else:
            print(f"Bucket warning ({e.code}): {e.read().decode()}")


def main() -> int:
    load_dotenv()
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    bucket = os.environ.get("SUPABASE_STORAGE_BUCKET", "uploads").strip()

    if not url or not key:
        raise SystemExit(
            "Add to .env:\n"
            "  SUPABASE_URL=https://<ref>.supabase.co\n"
            "  SUPABASE_SERVICE_ROLE_KEY=eyJ...\n"
            "  SUPABASE_DB_PASSWORD=..."
        )

    ref = project_ref(url)
    os.environ.setdefault("SUPABASE_PROJECT_REF", ref)
    os.environ.setdefault("SUPABASE_STORAGE_BUCKET", bucket)
    print(f"Project ref: {ref}")

    params = db_connect_params()
    try:
        apply_migrations(params)
    except Exception as e:
        print(f"Migration failed: {e}")
        print("Fallback: run these files in Supabase SQL Editor:")
        for f in sorted(MIGRATIONS.glob("*.sql")):
            print(f"  - {f}")
        return 1

    create_bucket(url, key, bucket)

    print("Importing CSV data…")
    subprocess.run(
        [str(ROOT / ".venv/bin/python"), str(ROOT / "scripts/migrate_csv_to_supabase.py")],
        cwd=ROOT,
        env=os.environ,
    )

    print("Running forecast…")
    subprocess.run(
        [str(ROOT / ".venv/bin/python"), str(ROOT / "scripts/forecast.py")],
        cwd=ROOT,
        env=os.environ,
    )

    print(f"\n✓ Setup complete — dashboard: https://supabase.com/dashboard/project/{ref}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
