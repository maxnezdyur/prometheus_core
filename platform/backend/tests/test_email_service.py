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

"""``send_email()`` on top of the SMTP configurations of ``app/email_settings.py``."""

import logging
import ssl

import aiosmtplib
import pytest
import yaml

from app.config import settings
from app.email_settings import load_email_settings
from app.services import email as email_service
from app.services.email import EmailConfigurationError, EmailNotConfiguredError, EmailSendError, send_email


def _relay(**overrides):
    config = {"host": "mailrelay.example.org", "from_address": "prometheus@example.org"}
    config.update(overrides)
    return config


def _write(tmp_path, smtp):
    path = tmp_path / "platform-settings.yml"
    path.write_text(yaml.safe_dump({"smtp": smtp}))
    return str(path)


@pytest.fixture
def smtp_calls(monkeypatch):
    """A fake ``aiosmtplib.send`` that records each call and opens no connection."""
    calls = []

    async def fake_send(message, **kwargs):
        calls.append((message, kwargs))

    monkeypatch.setattr(aiosmtplib, "send", fake_send)
    return calls


def _use_settings(monkeypatch, state):
    monkeypatch.setattr(email_service, "get_email_settings", lambda: state)


# --------------------------------------------------------------------------- #
# Not configured: no connection is opened
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize("state_kind", ["no-file", "invalid-default"])
async def test_send_email_not_configured_raises_before_any_connection(monkeypatch, tmp_path, smtp_calls, state_kind):
    """``send_email()`` MUST raise ``EmailNotConfiguredError`` without opening a connection when no
    configuration name is given and the settings have no valid default."""
    if state_kind == "no-file":
        state = load_email_settings(str(tmp_path / "missing.yml"), env={})
        assert state.file_present is False
    else:
        path = _write(
            tmp_path,
            {"default": "relay", "configurations": {"relay": _relay(password="os.environ/SMTP_PASSWORD")}},
        )
        state = load_email_settings(path, env={})
        assert state.default == "relay"
        assert "relay" in state.invalid
    _use_settings(monkeypatch, state)

    with pytest.raises(EmailNotConfiguredError):
        await send_email("user@example.org", "Subject", "Body")

    assert smtp_calls == []


async def test_send_email_unknown_configuration_name_raises_unknown_configuration_error(
    monkeypatch, tmp_path, smtp_calls
):
    """A configuration name that the settings do not define raises ``EmailConfigurationError``
    with ``unknown=True`` and opens no connection."""
    path = _write(tmp_path, {"default": "relay", "configurations": {"relay": _relay()}})
    state = load_email_settings(path, env={})
    assert state.configured is True
    _use_settings(monkeypatch, state)

    with pytest.raises(EmailConfigurationError) as excinfo:
        await send_email("user@example.org", "Subject", "Body", configuration="nope")

    assert excinfo.value.unknown is True
    assert excinfo.value.name == "nope"
    assert smtp_calls == []


# --------------------------------------------------------------------------- #
# TLS modes, SSL context and message
# --------------------------------------------------------------------------- #


def _self_signed_ca_pem():
    import datetime

    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import NameOID

    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Prometheus Test CA")])
    now = datetime.datetime.now(datetime.timezone.utc)
    certificate = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=1))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )
    return certificate.public_bytes(serialization.Encoding.PEM)


def _use_relay(monkeypatch, tmp_path, env=None, **overrides):
    path = _write(tmp_path, {"default": "relay", "configurations": {"relay": _relay(**overrides)}})
    state = load_email_settings(path, env=env or {})
    assert state.configured is True, state.invalid
    _use_settings(monkeypatch, state)
    return state.configurations["relay"]


@pytest.mark.parametrize(
    ("security", "port", "start_tls", "use_tls"),
    [
        pytest.param("none", 25, False, False, id="none-plain"),
        pytest.param("starttls", 587, True, False, id="starttls"),
        pytest.param("ssl", 465, False, True, id="ssl-implicit"),
    ],
)
async def test_send_email_tls_modes_select_plain_starttls_or_implicit_tls(
    monkeypatch, tmp_path, smtp_calls, security, port, start_tls, use_tls
):
    """``send_email()`` MUST send in plain text for ``security: none``, with ``STARTTLS`` for
    ``starttls`` and with implicit TLS for ``ssl``."""
    _use_relay(monkeypatch, tmp_path, security=security, port=port)

    await send_email("user@example.org", "Subject", "Body")

    assert len(smtp_calls) == 1
    _message, kwargs = smtp_calls[0]
    assert kwargs["hostname"] == "mailrelay.example.org"
    assert kwargs["port"] == port
    assert kwargs["start_tls"] is start_tls
    assert kwargs["use_tls"] is use_tls
    if security == "none":
        assert kwargs["tls_context"] is None
    else:
        assert isinstance(kwargs["tls_context"], ssl.SSLContext)
        assert kwargs["tls_context"].verify_mode == ssl.CERT_REQUIRED
        assert kwargs["tls_context"].check_hostname is True


async def test_send_email_tls_context_loads_the_ca_bundle(monkeypatch, tmp_path, smtp_calls):
    """``send_email()`` MUST build its SSL context from ``ca_bundle``: the context trusts that CA."""
    ca_pem = tmp_path / "ca.pem"
    ca_pem.write_bytes(_self_signed_ca_pem())
    _use_relay(monkeypatch, tmp_path, ca_bundle=str(ca_pem))

    await send_email("user@example.org", "Subject", "Body")

    _message, kwargs = smtp_calls[0]
    subjects = [cert["subject"] for cert in kwargs["tls_context"].get_ca_certs()]
    assert ((("commonName", "Prometheus Test CA"),),) in subjects


async def test_send_email_tls_context_keeps_the_system_trust_store_with_a_ca_bundle(monkeypatch, tmp_path, smtp_calls):
    """``ca_bundle`` adds to the system trust store: the context trusts every default CA plus the
    bundle CA, so a relay with a public certificate still verifies."""
    default_cas = ssl.create_default_context().cert_store_stats()["x509_ca"]
    if default_cas == 0:
        pytest.skip("the default SSL context loads no CA certificates on this machine")
    ca_pem = tmp_path / "ca.pem"
    ca_pem.write_bytes(_self_signed_ca_pem())
    _use_relay(monkeypatch, tmp_path, ca_bundle=str(ca_pem))

    await send_email("user@example.org", "Subject", "Body")

    _message, kwargs = smtp_calls[0]
    assert kwargs["tls_context"].cert_store_stats()["x509_ca"] == default_cas + 1


async def test_send_email_tls_context_without_verification_when_verify_tls_is_false(
    monkeypatch, tmp_path, smtp_calls
):
    """``send_email()`` MUST build its SSL context from ``verify_tls``: ``false`` turns off
    certificate and host name checks."""
    _use_relay(monkeypatch, tmp_path, verify_tls=False)

    await send_email("user@example.org", "Subject", "Body")

    _message, kwargs = smtp_calls[0]
    context = kwargs["tls_context"]
    assert context.verify_mode == ssl.CERT_NONE
    assert context.check_hostname is False


@pytest.mark.parametrize("html", [None, "<p>Body</p>"], ids=["text-only", "text-and-html"])
async def test_send_email_message_has_headers_text_and_optional_html(monkeypatch, tmp_path, smtp_calls, html):
    """The message carries ``From`` with the configured name, ``To``, ``Subject`` and a text part,
    and an HTML part only when ``html`` is given."""
    _use_relay(monkeypatch, tmp_path, from_name="Prometheus")

    await send_email(["a@example.org", "b@example.org"], "Weekly report", "Body", html=html)

    message, _kwargs = smtp_calls[0]
    assert message["From"] == "Prometheus <prometheus@example.org>"
    assert message["To"] == "a@example.org, b@example.org"
    assert message["Subject"] == "Weekly report"
    content_types = [part.get_content_type() for part in message.walk() if not part.is_multipart()]
    if html is None:
        assert content_types == ["text/plain"]
    else:
        assert content_types == ["text/plain", "text/html"]
        assert message.get_body(("html",)).get_content().strip() == html
    assert message.get_body(("plain",)).get_content().strip() == "Body"


async def test_send_email_passes_the_password_only_as_its_secret_value(monkeypatch, tmp_path, smtp_calls):
    """The password reaches ``aiosmtplib.send`` as the resolved secret value, never as the
    ``SecretStr`` or the ``os.environ/`` reference, and never in the message."""
    loaded = _use_relay(
        monkeypatch,
        tmp_path,
        env={"SMTP_PASSWORD": "test-only-password"},
        username="mailer",
        password="os.environ/SMTP_PASSWORD",
    )
    assert str(loaded.password) != "test-only-password"

    await send_email("user@example.org", "Subject", "Body")

    message, kwargs = smtp_calls[0]
    assert kwargs["username"] == "mailer"
    assert type(kwargs["password"]) is str
    assert kwargs["password"] == loaded.password.get_secret_value()
    assert "test-only-password" not in message.as_string()


# --------------------------------------------------------------------------- #
# Failure stages and password masking
# --------------------------------------------------------------------------- #

_PASSWORD = "test-only-password"


@pytest.mark.parametrize(
    ("error", "stage"),
    [
        pytest.param(aiosmtplib.SMTPConnectError(f"refused {_PASSWORD}"), "connect", id="connect"),
        pytest.param(ssl.SSLError(1, f"certificate verify failed {_PASSWORD}"), "tls", id="tls"),
        pytest.param(aiosmtplib.SMTPAuthenticationError(535, f"bad credentials {_PASSWORD}"), "auth", id="auth"),
        pytest.param(
            aiosmtplib.SMTPException(f"SMTP STARTTLS extension not supported by server. {_PASSWORD}"),
            "tls",
            id="bare-starttls-text",
        ),
        pytest.param(
            aiosmtplib.SMTPException(f"Error upgrading transport: {_PASSWORD}"), "tls", id="bare-upgrading-transport"
        ),
        pytest.param(
            aiosmtplib.SMTPException(f"SMTP AUTH extension not supported by server. {_PASSWORD}"),
            "auth",
            id="bare-auth-text",
        ),
        pytest.param(
            aiosmtplib.SMTPRecipientsRefused(
                [aiosmtplib.SMTPRecipientRefused(550, f"no such user {_PASSWORD}", "user@example.org")]
            ),
            "send",
            id="send",
        ),
    ],
)
async def test_send_email_failure_stages_name_the_stage_and_mask_the_password(
    monkeypatch, tmp_path, caplog, error, stage
):
    """``send_email()`` MUST raise ``EmailSendError`` with the stage ``connect``, ``tls``, ``auth``
    or ``send`` that failed, and a reason that holds no password."""
    _use_relay(
        monkeypatch,
        tmp_path,
        env={"SMTP_PASSWORD": _PASSWORD},
        username="mailer",
        password="os.environ/SMTP_PASSWORD",
    )

    async def failing_send(message, **kwargs):
        assert kwargs["password"] == _PASSWORD
        raise error

    monkeypatch.setattr(aiosmtplib, "send", failing_send)
    caplog.set_level(logging.DEBUG, logger="uvicorn.error.email")

    with pytest.raises(EmailSendError) as excinfo:
        await send_email("user@example.org", "Subject", "Body")

    assert excinfo.value.stage == stage
    assert "mailrelay.example.org:587" in excinfo.value.reason
    assert _PASSWORD not in excinfo.value.reason
    assert _PASSWORD not in str(excinfo.value)
    records = [record for record in caplog.records if record.name == "uvicorn.error.email"]
    assert records, "send_email() logged no failure on uvicorn.error.email"
    for record in records:
        assert _PASSWORD not in record.getMessage()


@pytest.mark.parametrize("subject", ["Hello\rBcc: x@example.org", "Hello\nBcc: x@example.org"], ids=["cr", "lf"])
async def test_send_email_subject_with_line_break_raises_before_any_call(monkeypatch, tmp_path, smtp_calls, subject):
    """A CR or LF in ``subject`` raises ``ValueError`` before any SMTP call."""
    _use_relay(monkeypatch, tmp_path)

    with pytest.raises(ValueError, match="subject"):
        await send_email("user@example.org", subject, "Body")

    assert smtp_calls == []


async def test_send_email_passes_the_configured_smtp_timeout(monkeypatch, tmp_path, smtp_calls):
    """``send_email()`` bounds the SMTP exchange with ``settings.smtp_timeout_seconds``."""
    monkeypatch.setattr(settings, "smtp_timeout_seconds", 37)
    _use_relay(monkeypatch, tmp_path)

    await send_email("user@example.org", "Subject", "Body")

    _message, kwargs = smtp_calls[0]
    assert kwargs["timeout"] == 37
