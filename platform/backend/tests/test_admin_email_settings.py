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

"""Admin email-settings API: GET /api/admin/email-settings.

Behind require_admin like admin_oidc.py. The settings dependency is overridden
with a fixed EmailSettings, so no test reads the host's settings file.
"""

from __future__ import annotations

import asyncio
import logging

import pytest
import yaml
from fastapi.testclient import TestClient

from app.email_settings import EmailSettings, get_email_settings, load_email_settings


def _client_as(monkeypatch, *, role: str, sid: str) -> TestClient:
    from app import security
    from app.main import app

    monkeypatch.setattr(security.settings, "jwt_secret", "test-secret", raising=False)
    token = security.issue_token(security.User(identifier=f"{role}-{sid}", role=role), sid=sid)
    client = TestClient(app)
    client.cookies.set("prometheus_session", token)
    return client


@pytest.fixture
def no_email_settings():
    from app.main import app

    state = EmailSettings(
        settings_file="/nonexistent/platform-settings.yml",
        file_present=False,
        default=None,
        error=None,
        configurations={},
        invalid={},
    )
    app.dependency_overrides[get_email_settings] = lambda: state
    try:
        yield state
    finally:
        app.dependency_overrides.pop(get_email_settings, None)


# --------------------------------------------------------------------------- #
# require_admin gate
# --------------------------------------------------------------------------- #


def test_admin_email_settings_requires_admin_unauthenticated_gets_401(wire_db_session, no_email_settings):
    """GET /api/admin/email-settings MUST return 401 without a session."""
    from app.main import app

    assert TestClient(app).get("/api/admin/email-settings").status_code == 401


def test_admin_email_settings_requires_admin_non_admin_gets_403(monkeypatch, wire_db_session, no_email_settings):
    """GET /api/admin/email-settings MUST return 403 for a non-admin session."""
    client = _client_as(monkeypatch, role="user", sid="s-email-nonadmin")
    assert client.get("/api/admin/email-settings").status_code == 403


def test_admin_email_settings_requires_admin_admin_gets_200(monkeypatch, wire_db_session, no_email_settings):
    """An admin session passes the require_admin gate and reads the loaded settings."""
    client = _client_as(monkeypatch, role="admin", sid="s-email-admin")
    resp = client.get("/api/admin/email-settings")
    assert resp.status_code == 200
    body = resp.json()
    assert body["configured"] is False
    assert body["file_present"] is False
    assert body["settings_file"] == no_email_settings.settings_file
    assert body["configurations"] == []


# --------------------------------------------------------------------------- #
# redaction and response shape
# --------------------------------------------------------------------------- #

_CONFIGURATION_KEYS = {
    "name",
    "is_default",
    "valid",
    "error",
    "host",
    "port",
    "security",
    "verify_tls",
    "ca_bundle",
    "username",
    "from_address",
    "from_name",
    "has_password",
    "password_env",
}


@pytest.fixture
def override_email_settings():
    from app.main import app

    def _override(state: EmailSettings) -> None:
        app.dependency_overrides[get_email_settings] = lambda: state

    try:
        yield _override
    finally:
        app.dependency_overrides.pop(get_email_settings, None)


def _keys_at_any_depth(value) -> set[str]:
    if isinstance(value, dict):
        return set(value).union(*(_keys_at_any_depth(v) for v in value.values()))
    if isinstance(value, list):
        return set().union(*(_keys_at_any_depth(v) for v in value))
    return set()


def test_admin_email_settings_redacts_passwords_and_lists_every_configuration(
    monkeypatch, tmp_path, wire_db_session, override_email_settings
):
    """GET /api/admin/email-settings MUST return every loaded and invalid configuration with
    has_password and password_env, and MUST NOT return any password value."""
    path = tmp_path / "platform-settings.yml"
    path.write_text(
        yaml.safe_dump(
            {
                "smtp": {
                    "default": "relay",
                    "configurations": {
                        "relay": {
                            "host": "mailrelay.example.com",
                            "port": 587,
                            "security": "starttls",
                            "from_address": "prometheus@example.com",
                            "from_name": "Prometheus",
                            "username": "prometheus",
                            "password": "os.environ/SMTP_RELAY_PASSWORD",
                        },
                        "other": {
                            "host": "smtp.example.com",
                            "from_address": "other@example.com",
                            "password": "os.environ/SMTP_OTHER_PASSWORD",
                        },
                    },
                }
            }
        )
    )
    override_email_settings(load_email_settings(str(path), env={"SMTP_RELAY_PASSWORD": "s3cret-smtp"}))

    client = _client_as(monkeypatch, role="admin", sid="s-email-redacts")
    resp = client.get("/api/admin/email-settings")

    assert resp.status_code == 200
    assert "s3cret-smtp" not in resp.text
    body = resp.json()
    assert "password" not in _keys_at_any_depth(body)
    assert set(body) == {"configured", "settings_file", "file_present", "default", "error", "configurations"}
    assert body["configured"] is True
    assert body["settings_file"] == str(path)
    assert body["file_present"] is True
    assert body["default"] == "relay"
    assert body["error"] is None
    assert [c["name"] for c in body["configurations"]] == ["other", "relay"]
    for configuration in body["configurations"]:
        assert set(configuration) == _CONFIGURATION_KEYS
    other, relay = body["configurations"]
    assert relay == {
        "name": "relay",
        "is_default": True,
        "valid": True,
        "error": None,
        "host": "mailrelay.example.com",
        "port": 587,
        "security": "starttls",
        "verify_tls": True,
        "ca_bundle": None,
        "username": "prometheus",
        "from_address": "prometheus@example.com",
        "from_name": "Prometheus",
        "has_password": True,
        "password_env": "SMTP_RELAY_PASSWORD",
    }
    assert other == {
        "name": "other",
        "is_default": False,
        "valid": False,
        "error": "SMTP_OTHER_PASSWORD is not set",
        "host": None,
        "port": None,
        "security": None,
        "verify_tls": None,
        "ca_bundle": None,
        "username": None,
        "from_address": None,
        "from_name": None,
        "has_password": False,
        "password_env": "SMTP_OTHER_PASSWORD",
    }


def test_admin_email_settings_redacts_with_no_file_returns_no_configurations(
    monkeypatch, tmp_path, wire_db_session, override_email_settings
):
    """With no settings file, the route returns 200 with configured false and no configurations."""
    path = tmp_path / "absent.yml"
    override_email_settings(load_email_settings(str(path), env={}))

    client = _client_as(monkeypatch, role="admin", sid="s-email-nofile")
    resp = client.get("/api/admin/email-settings")

    assert resp.status_code == 200
    assert resp.json() == {
        "configured": False,
        "settings_file": str(path),
        "file_present": False,
        "default": None,
        "error": None,
        "configurations": [],
    }


# --------------------------------------------------------------------------- #
# startup summary log
# --------------------------------------------------------------------------- #


def test_startup_logs_email_summary_at_info_on_a_uvicorn_logger(monkeypatch, tmp_path, caplog):
    """At backend startup the lifespan MUST log one INFO summary line `email: <n> configurations,
    default <name>, <k> invalid` on a logger that uvicorn's default log config shows at INFO, plus
    one WARNING per invalid configuration, and MUST NOT log a password value."""
    from uvicorn.config import LOGGING_CONFIG

    from app import main as app_main
    from app.config import settings

    path = tmp_path / "platform-settings.yml"
    path.write_text(
        yaml.safe_dump(
            {
                "smtp": {
                    "default": "relay",
                    "configurations": {
                        "relay": {
                            "host": "mailrelay.example.com",
                            "from_address": "prometheus@example.com",
                            "password": "os.environ/SMTP_PASSWORD",
                        },
                        "other": {
                            "host": "smtp.example.com",
                            "from_address": "other@example.com",
                            "password": "os.environ/SMTP_OTHER_PASSWORD",
                        },
                    },
                }
            }
        )
    )
    state = load_email_settings(str(path), env={"SMTP_PASSWORD": "s3cret-smtp"})
    monkeypatch.setattr(app_main, "get_email_settings", lambda: state)
    monkeypatch.setattr(settings, "jwt_secret", "x" * 32, raising=False)

    async def run() -> None:
        async with app_main.lifespan(app_main.app):
            pass

    with caplog.at_level(logging.INFO):
        asyncio.run(run())

    summaries = [
        r
        for r in caplog.records
        if r.levelno == logging.INFO and r.getMessage() == "email: 1 configurations, default relay, 1 invalid"
    ]
    assert len(summaries) == 1
    name = summaries[0].name
    assert name == "uvicorn.error" or name.startswith("uvicorn.error."), name
    # uvicorn's default config shows uvicorn.error at INFO.
    assert LOGGING_CONFIG["loggers"]["uvicorn.error"]["level"] == "INFO"
    assert any(
        r.levelno == logging.WARNING and "configuration other is invalid" in r.getMessage() for r in caplog.records
    )
    assert not any("s3cret-smtp" in r.getMessage() for r in caplog.records)


# --------------------------------------------------------------------------- #
# POST /api/admin/email-settings/test outcomes
# --------------------------------------------------------------------------- #


@pytest.fixture
def relay_email_settings(tmp_path, override_email_settings) -> EmailSettings:
    """Two valid configurations; the default is `primary`, so a request for `relay` proves
    that the body's configuration reaches send_email."""
    path = tmp_path / "platform-settings.yml"
    path.write_text(
        yaml.safe_dump(
            {
                "smtp": {
                    "default": "primary",
                    "configurations": {
                        "primary": {"host": "smtp.example.com", "from_address": "primary@example.com"},
                        "relay": {"host": "mailrelay.example.com", "from_address": "prometheus@example.com"},
                    },
                }
            }
        )
    )
    state = load_email_settings(str(path), env={})
    assert set(state.configurations) == {"primary", "relay"}
    override_email_settings(state)
    return state


def _patch_send_email(monkeypatch, error: Exception | None = None) -> list[dict]:
    from app.routers import admin_email_settings

    calls: list[dict] = []

    async def fake_send_email(to, subject, text, *, configuration=None, **kwargs):
        calls.append({"to": to, "configuration": configuration})
        if error is not None:
            raise error

    monkeypatch.setattr(admin_email_settings, "send_email", fake_send_email)
    return calls


def test_email_test_route_outcomes_success_returns_ok_true(monkeypatch, wire_db_session, relay_email_settings):
    """POST /api/admin/email-settings/test MUST return 200 with `ok: true` after a successful send."""
    calls = _patch_send_email(monkeypatch)
    client = _client_as(monkeypatch, role="admin", sid="s-email-test-ok")

    resp = client.post("/api/admin/email-settings/test", json={"to": "admin@example.com", "configuration": "relay"})

    assert resp.status_code == 200
    assert resp.json() == {
        "ok": True,
        "configuration": "relay",
        "to": "admin@example.com",
        "stage": None,
        "error": None,
    }
    assert calls == [{"to": "admin@example.com", "configuration": "relay"}]


def test_email_test_route_outcomes_without_configuration_sends_through_default(
    monkeypatch, wire_db_session, relay_email_settings
):
    """POST /api/admin/email-settings/test without a `configuration` MUST send through the default
    configuration and name it in the 200 `ok: true` result."""
    calls = _patch_send_email(monkeypatch)
    client = _client_as(monkeypatch, role="admin", sid="s-email-test-default")

    resp = client.post("/api/admin/email-settings/test", json={"to": "admin@example.com"})

    assert resp.status_code == 200
    assert resp.json() == {
        "ok": True,
        "configuration": "primary",
        "to": "admin@example.com",
        "stage": None,
        "error": None,
    }
    assert calls == [{"to": "admin@example.com", "configuration": "primary"}]


def test_email_test_route_outcomes_smtp_failure_returns_ok_false_with_stage(
    monkeypatch, wire_db_session, relay_email_settings
):
    """POST /api/admin/email-settings/test MUST return 200 with `ok: false`, the failed `stage` and the
    `error` after an SMTP failure."""
    from app.services.email import EmailSendError

    calls = _patch_send_email(monkeypatch, EmailSendError("auth", "535 authentication failed"))
    client = _client_as(monkeypatch, role="admin", sid="s-email-test-fail")

    resp = client.post("/api/admin/email-settings/test", json={"to": "admin@example.com", "configuration": "relay"})

    assert resp.status_code == 200
    assert resp.json() == {
        "ok": False,
        "configuration": "relay",
        "to": "admin@example.com",
        "stage": "auth",
        "error": "535 authentication failed",
    }
    assert calls == [{"to": "admin@example.com", "configuration": "relay"}]


# --------------------------------------------------------------------------- #
# POST /api/admin/email-settings/test errors
# --------------------------------------------------------------------------- #


@pytest.fixture
def smtp_send_calls(monkeypatch) -> list[dict]:
    """A recording fake for ``aiosmtplib.send`` under the real send_email; it opens no connection."""
    import aiosmtplib

    calls: list[dict] = []

    async def fake_send(message, **kwargs):
        calls.append(kwargs)

    monkeypatch.setattr(aiosmtplib, "send", fake_send)
    return calls


def _use_email_state(monkeypatch, override_email_settings, tmp_path, smtp: dict | None) -> None:
    """Load a real settings state and give it to both the route dependency and send_email."""
    from app.services import email as email_service

    path = tmp_path / "platform-settings.yml"
    if smtp is not None:
        path.write_text(yaml.safe_dump({"smtp": smtp}))
    state = load_email_settings(str(path), env={})
    override_email_settings(state)
    monkeypatch.setattr(email_service, "get_email_settings", lambda: state)


_TEST_ROUTE_SMTP = {
    "default": "relay",
    "configurations": {
        "relay": {"host": "mailrelay.example.com", "from_address": "prometheus@example.com"},
        "other": {
            "host": "smtp.example.com",
            "from_address": "other@example.com",
            "password": "os.environ/SMTP_OTHER_PASSWORD",
        },
    },
}


@pytest.mark.parametrize(
    ("role", "smtp", "body", "expected_status", "expected_detail"),
    [
        pytest.param(None, _TEST_ROUTE_SMTP, {"to": "admin@example.com"}, 401, None, id="unauthenticated-401"),
        pytest.param("user", _TEST_ROUTE_SMTP, {"to": "admin@example.com"}, 403, None, id="non-admin-403"),
        pytest.param("admin", None, {"to": "admin@example.com"}, 409, "Email is not configured", id="no-file-409"),
        pytest.param(
            "admin",
            {**_TEST_ROUTE_SMTP, "default": "other"},
            {"to": "admin@example.com"},
            409,
            "Email is not configured",
            id="invalid-default-409",
        ),
        pytest.param(
            "admin",
            _TEST_ROUTE_SMTP,
            {"to": "admin@example.com", "configuration": "other"},
            409,
            "Email configuration 'other' is invalid: SMTP_OTHER_PASSWORD is not set",
            id="invalid-configuration-409",
        ),
        pytest.param(
            "admin",
            _TEST_ROUTE_SMTP,
            {"to": "admin@example.com", "configuration": "missing"},
            404,
            "Email configuration 'missing' does not exist",
            id="unknown-configuration-404",
        ),
        pytest.param("admin", _TEST_ROUTE_SMTP, {"to": "not-an-address"}, 422, None, id="invalid-to-422"),
    ],
)
def test_email_test_route_errors(
    monkeypatch,
    tmp_path,
    wire_db_session,
    override_email_settings,
    smtp_send_calls,
    role,
    smtp,
    body,
    expected_status,
    expected_detail,
):
    """The test route MUST answer 401 without a session, 403 for a non-admin, 409 when email is not
    configured or the named configuration is invalid, 404 for an unknown configuration, and 422 for an
    invalid `to`; no case sends a message."""
    from app.main import app

    _use_email_state(monkeypatch, override_email_settings, tmp_path, smtp)
    client = TestClient(app) if role is None else _client_as(monkeypatch, role=role, sid=f"s-email-test-{role}")

    resp = client.post("/api/admin/email-settings/test", json=body)

    assert resp.status_code == expected_status, resp.text
    if expected_detail is not None:
        assert resp.json()["detail"] == expected_detail
    assert smtp_send_calls == []
