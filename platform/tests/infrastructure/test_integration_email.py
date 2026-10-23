# This file is part of Prometheus
# https://inl.gov/super-intelligence/prometheus/
#
# Copyright 2026 Battelle Energy Alliance, LLC
# All rights reserved, see NOTICE.txt for full restrictions
# https://github.com/idaholab/prometheus_core/blob/main/NOTICE.txt
#
# Licensed under the MIT License, please see LICENSE for details
# https://github.com/idaholab/prometheus_core/blob/main/LICENSE
#
# SPDX-License-Identifier: MIT

"""Stack test: send_email() in the running backend delivers a message to Mailpit.

Talks to the already-running dev-profile Compose stack: it runs one script in
the ``backend`` container with ``docker exec`` and reads Mailpit's REST API on
its published host port (``MAILPIT_UI_PORT``, default 8025). It never starts,
stops or reconfigures a container, so it does not use the
``docker_compose_up`` fixture.
"""

import os
import subprocess
import time
import uuid
from pathlib import Path

import httpx
import pytest
import yaml


pytestmark = pytest.mark.integration

# A fixed number of searches with a fixed pause between them bounds the wait at
# about 20 x 0.5 s, with no wall-clock deadline.
_SEARCH_ATTEMPTS = 20
_SEARCH_INTERVAL_SECONDS = 0.5

_SEND_SCRIPT = """
import asyncio
import sys

from app.services.email import send_email

asyncio.run(send_email(sys.argv[1], sys.argv[2], "body", configuration="mailpit"))
"""


def _mailpit_port(project_root: Path) -> str:
    """Return MAILPIT_UI_PORT from the process environment, then platform/.env, else 8025."""
    port = (os.getenv("MAILPIT_UI_PORT") or "").strip()
    if port:
        return port
    env_path = project_root / ".env"
    if env_path.is_file():
        for line in env_path.read_text().splitlines():
            key, sep, value = line.partition("=")
            if sep and key.strip() == "MAILPIT_UI_PORT" and value.strip():
                return value.strip()
    return "8025"


def _backend_port(project_root: Path) -> str:
    """Return BACKEND_PORT from the process environment, then platform/.env, else 8600."""
    port = (os.getenv("BACKEND_PORT") or "").strip()
    if port:
        return port
    env_path = project_root / ".env"
    if env_path.is_file():
        for line in env_path.read_text().splitlines():
            key, sep, value = line.partition("=")
            if sep and key.strip() == "BACKEND_PORT" and value.strip():
                return value.strip()
    return "8600"


def _mailpit_from_address(project_root: Path) -> str:
    """Return the ``mailpit`` configuration's from_address from the settings file the backend mounts."""
    settings_dir = project_root / "settings"
    settings_path = settings_dir / "platform-settings.yml"
    if not settings_path.is_file():
        settings_path = settings_dir / "platform-settings.example.yml"
    data = yaml.safe_load(settings_path.read_text())
    return data["smtp"]["configurations"]["mailpit"]["from_address"]


@pytest.fixture
def stack_backend_url(project_root: Path) -> str:
    """Return the running stack's backend URL, or skip when the backend does not answer."""
    url = f"http://localhost:{_backend_port(project_root)}"
    try:
        httpx.get(f"{url}/healthz", timeout=5, follow_redirects=True)
    except httpx.HTTPError as exc:
        pytest.skip(f"Backend stack is not reachable at {url}: {type(exc).__name__}")
    return url


@pytest.fixture
def stack_mailpit_url(project_root: Path) -> str:
    """Return the running stack's Mailpit API URL, or skip when Mailpit does not answer."""
    url = f"http://localhost:{_mailpit_port(project_root)}"
    try:
        httpx.get(f"{url}/api/v1/info", timeout=5)
    except httpx.HTTPError as exc:
        pytest.skip(f"Mailpit is not reachable at {url}: {type(exc).__name__}")
    return url


def _search(mailpit_url: str, token: str) -> list[dict]:
    resp = httpx.get(f"{mailpit_url}/api/v1/search", params={"query": f'subject:"{token}"'}, timeout=5)
    assert resp.status_code == 200, f"Mailpit search returned {resp.status_code}: {resp.text}"
    return resp.json().get("messages") or []


def test_email_reaches_mailpit(stack_backend_url, stack_mailpit_url, project_root):
    """On the dev stack, send_email() in the running backend container MUST deliver a message
    to Mailpit with the configured sender, the recipient and the subject."""
    token = str(uuid.uuid4())
    recipient = f"qa-{token}@example.com"
    subject = f"{token} stack test"
    expected_from = _mailpit_from_address(project_root)

    messages: list[dict] = []
    try:
        result = subprocess.run(
            ["docker", "exec", "backend", "python", "-c", _SEND_SCRIPT, recipient, subject],
            capture_output=True,
            text=True,
            timeout=60,
        )
        assert result.returncode == 0, f"send_email() in the backend exited {result.returncode}: {result.stderr}"

        for attempt in range(_SEARCH_ATTEMPTS):
            messages = _search(stack_mailpit_url, token)
            if messages:
                break
            if attempt < _SEARCH_ATTEMPTS - 1:
                time.sleep(_SEARCH_INTERVAL_SECONDS)

        assert len(messages) == 1, f"Mailpit holds {len(messages)} messages with subject {subject!r}: {messages}"
        message = messages[0]
        assert message["From"]["Address"] == expected_from, f"From is {message['From']}"
        assert recipient in [to["Address"] for to in message["To"]], f"To is {message['To']}"
        assert message["Subject"] == subject
    finally:
        ids = [m["ID"] for m in messages] or [m["ID"] for m in _search(stack_mailpit_url, token)]
        if ids:
            httpx.request("DELETE", f"{stack_mailpit_url}/api/v1/messages", json={"IDs": ids}, timeout=5)
