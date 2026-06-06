#!/usr/bin/env python3
"""
Provision a remote Supabase project for Altis Cashflow:
  1. Create project (Management API)
  2. Wait until healthy
  3. Push SQL migrations
  4. Create Storage bucket
  5. Write credentials to .env
  6. Import CSV data + run forecast

Requires in .env (or environment):
  SUPABASE_ACCESS_TOKEN  — https://supabase.com/dashboard/account/tokens
  SUPABASE_ORG_ID        — optional; uses first org if omitted
  SUPABASE_DB_PASSWORD   — optional; generated if omitted
"""

from __future__ import annotations

import json
import os
import secrets
import string
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / ".env"
MIGRATIONS = ROOT / "supabase" / "migrations"
PROJECT_NAME = os.environ.get("SUPABASE_PROJECT_NAME", "altis-cashflow")
REGION = os.environ.get("SUPABASE_REGION", "eu-west-1")
BUCKET = os.environ.get("SUPABASE_STORAGE_BUCKET", "uploads")
API = "https://api.supabase.com/v1"


def load_dotenv() -> None:
    if not ENV_PATH.exists():
        return
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip()
        if key and key not in os.environ:
            os.environ[key] = val


def api(method: str, path: str, body: dict | None = None) -> dict | list:
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    if not token:
        raise SystemExit(
            "Missing SUPABASE_ACCESS_TOKEN.\n"
            "Create one at https://supabase.com/dashboard/account/tokens\n"
            "Add to .env: SUPABASE_ACCESS_TOKEN=sbp_..."
        )
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        raise SystemExit(f"Supabase API {method} {path} failed ({e.code}): {err}") from e


def gen_password(length: int = 24) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def upsert_env(updates: dict[str, str]) -> None:
    lines: list[str] = []
    seen: set[str] = set()
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            key = line.split("=", 1)[0].strip() if "=" in line else ""
            if key in updates:
                lines.append(f"{key}={updates[key]}")
                seen.add(key)
            else:
                lines.append(line)
    for key, val in updates.items():
        if key not in seen:
            lines.append(f"{key}={val}")
    ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    for key, val in updates.items():
        os.environ[key] = val


def wait_for_project(ref: str, timeout: int = 600) -> None:
    print(f"Waiting for project {ref} to become ACTIVE_HEALTHY…")
    start = time.time()
    while time.time() - start < timeout:
        projects = api("GET", "/projects")
        for p in projects:
            if p.get("id") == ref or p.get("ref") == ref:
                status = p.get("status", "")
                print(f"  status: {status}")
                if status == "ACTIVE_HEALTHY":
                    return
        time.sleep(15)
    raise SystemExit("Timed out waiting for Supabase project to become healthy")


def run_sql_via_cli(ref: str, db_password: str) -> None:
    """Apply migrations using Supabase CLI linked to remote project."""
    env = {**os.environ, "SUPABASE_DB_PASSWORD": db_password}
    link = [
        "npx", "supabase@latest", "link",
        "--project-ref", ref,
        "--password", db_password,
        "--yes",
    ]
    print("Linking project…")
    subprocess.run(link, cwd=ROOT, env=env, check=True)

    print("Pushing migrations…")
    subprocess.run(
        ["npx", "supabase@latest", "db", "push", "--yes"],
        cwd=ROOT,
        env=env,
        check=True,
    )


def apply_migrations_direct(ref: str, db_password: str) -> None:
    """Fallback: run migration SQL files via psql connection string from API."""
    # Get pooler connection info
    project = None
    for p in api("GET", "/projects"):
        if p.get("id") == ref or p.get("ref") == ref:
            project = p
            break
    if not project:
        raise SystemExit(f"Project {ref} not found")

    host = f"db.{ref}.supabase.co"
    conn = f"postgresql://postgres.{ref}:{db_password}@{host}:5432/postgres"
    for sql_file in sorted(MIGRATIONS.glob("*.sql")):
        print(f"Applying {sql_file.name}…")
        subprocess.run(
            ["psql", conn, "-v", "ON_ERROR_STOP=1", "-f", str(sql_file)],
            cwd=ROOT,
            check=True,
        )


def create_storage_bucket(service_key: str, project_url: str) -> None:
    """Create uploads bucket via Storage API."""
    url = f"{project_url.rstrip('/')}/storage/v1/bucket"
    body = json.dumps({"id": BUCKET, "name": BUCKET, "public": False}).encode()
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {service_key}",
            "apikey": service_key,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            print(f"Storage bucket '{BUCKET}' created.")
            return
    except urllib.error.HTTPError as e:
        if e.code == 409:
            print(f"Storage bucket '{BUCKET}' already exists.")
            return
        err = e.read().decode()
        print(f"Warning: could not create bucket ({e.code}): {err}")


def main() -> int:
    load_dotenv()

    org_id = os.environ.get("SUPABASE_ORG_ID", "").strip()
    if not org_id:
        orgs = api("GET", "/organizations")
        if not orgs:
            raise SystemExit("No Supabase organizations found for this token.")
        org_id = orgs[0]["id"]
        print(f"Using org: {orgs[0].get('name', org_id)}")

    db_password = os.environ.get("SUPABASE_DB_PASSWORD", "").strip() or gen_password()

    # Reuse existing project if ref already in .env
    existing_ref = os.environ.get("SUPABASE_PROJECT_REF", "").strip()
    if existing_ref:
        ref = existing_ref
        print(f"Using existing project ref: {ref}")
    else:
        print(f"Creating project '{PROJECT_NAME}' in {REGION}…")
        created = api("POST", "/projects", {
            "organization_id": org_id,
            "name": PROJECT_NAME,
            "region": REGION,
            "db_pass": db_password,
        })
        ref = created.get("id") or created.get("ref")
        if not ref:
            raise SystemExit(f"Unexpected create response: {created}")
        print(f"Created project ref: {ref}")
        wait_for_project(ref)

    project_url = f"https://{ref}.supabase.co"

    # Fetch API keys
    keys = api("GET", f"/projects/{ref}/api-keys")
    service_key = ""
    anon_key = ""
    for k in keys:
        name = k.get("name", "")
        if name == "service_role":
            service_key = k.get("api_key", "")
        elif name == "anon":
            anon_key = k.get("api_key", "")

    if not service_key:
        raise SystemExit("Could not retrieve service_role API key")

    upsert_env({
        "SUPABASE_PROJECT_REF": ref,
        "SUPABASE_URL": project_url,
        "SUPABASE_SERVICE_ROLE_KEY": service_key,
        "SUPABASE_ANON_KEY": anon_key,
        "SUPABASE_STORAGE_BUCKET": BUCKET,
        "SUPABASE_DB_PASSWORD": db_password,
    })

    # Push schema
    try:
        run_sql_via_cli(ref, db_password)
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"CLI push failed ({e}), trying direct SQL…")
        try:
            apply_migrations_direct(ref, db_password)
        except (subprocess.CalledProcessError, FileNotFoundError):
            print(
                "Could not auto-apply migrations.\n"
                f"Run manually in SQL Editor: {project_url}/project/default/sql/new\n"
                f"Files: {MIGRATIONS}"
            )

    create_storage_bucket(service_key, project_url)

    # Import data
    print("Importing unified CSV → Supabase…")
    subprocess.run(
        [str(ROOT / ".venv/bin/python"), str(ROOT / "scripts/migrate_csv_to_supabase.py")],
        cwd=ROOT,
        env=os.environ,
        check=False,
    )

    print("Running forecast pipeline…")
    subprocess.run(
        [str(ROOT / ".venv/bin/python"), str(ROOT / "scripts/forecast.py")],
        cwd=ROOT,
        env=os.environ,
        check=False,
    )

    print("\n✓ Supabase provisioned")
    print(f"  Dashboard: https://supabase.com/dashboard/project/{ref}")
    print(f"  API URL:   {project_url}")
    print(f"  Credentials written to {ENV_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
