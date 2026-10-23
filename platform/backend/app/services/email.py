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

"""Send email through the SMTP configurations of ``app/email_settings.py``.

``send_email()`` raises only :class:`EmailError` subclasses (which the router maps to
HTTP) and ``ValueError`` for a bad recipient or subject. A missing, unknown or invalid
configuration raises before any network call; an SMTP failure raises
:class:`EmailSendError` with the stage that failed.
"""

from __future__ import annotations

import logging
import ssl
from collections.abc import Sequence
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid
from typing import Literal

import aiosmtplib
from pydantic import EmailStr, TypeAdapter, ValidationError

from app.config import settings
from app.email_settings import LoadedSmtpConfiguration, get_email_settings

# A child of uvicorn.error, as app/main.py does: the backend sets up no logging of its own.
logger = logging.getLogger("uvicorn.error").getChild("email")

EmailStage = Literal["connect", "tls", "auth", "send"]

_EMAIL_ADAPTER: TypeAdapter[str] = TypeAdapter(EmailStr)


class EmailError(Exception):
    """Base exception for email errors."""


class EmailNotConfiguredError(EmailError):
    """Raised when no configuration is named and there is no valid default (→ 409)."""

    def __init__(self) -> None:
        super().__init__("Email is not configured")


class EmailConfigurationError(EmailError):
    """Raised when a named configuration is unknown (→ 404) or invalid (→ 409)."""

    def __init__(self, name: str, reason: str, unknown: bool) -> None:
        self.name = name
        self.reason = reason
        self.unknown = unknown
        if unknown:
            super().__init__(f"Email configuration '{name}' does not exist")
        else:
            super().__init__(f"Email configuration '{name}' is invalid: {reason}")


class EmailSendError(EmailError):
    """Raised when the SMTP exchange fails at ``stage``."""

    def __init__(self, stage: EmailStage, reason: str) -> None:
        self.stage = stage
        self.reason = reason
        super().__init__(f"{stage}: {reason}")


def _resolve_configuration(name: str | None) -> LoadedSmtpConfiguration:
    email_settings = get_email_settings()
    if name is None:
        default = email_settings.default_configuration()
        if default is None:
            raise EmailNotConfiguredError()
        return default
    loaded = email_settings.configurations.get(name)
    if loaded is not None:
        return loaded
    if name in email_settings.invalid:
        raise EmailConfigurationError(name, email_settings.invalid[name][0], unknown=False)
    raise EmailConfigurationError(name, "unknown configuration", unknown=True)


def _recipients(to: str | Sequence[str]) -> list[str]:
    recipients = [to] if isinstance(to, str) else list(to)
    if not recipients:
        raise ValueError("to: at least one recipient is required")
    for address in recipients:
        try:
            _EMAIL_ADAPTER.validate_python(address)
        except ValidationError:
            raise ValueError("to: not a valid email address") from None
    return recipients


def _build_message(
    loaded: LoadedSmtpConfiguration, recipients: list[str], subject: str, text: str, html: str | None
) -> EmailMessage:
    config = loaded.config
    message = EmailMessage()
    message["From"] = formataddr((config.from_name, config.from_address))
    message["To"] = ", ".join(recipients)
    message["Subject"] = subject
    message["Date"] = formatdate(usegmt=True)
    message["Message-ID"] = make_msgid(domain=config.from_address.rpartition("@")[2])
    message.set_content(text)
    if html is not None:
        message.add_alternative(html, subtype="html")
    return message


def _tls_context(loaded: LoadedSmtpConfiguration) -> ssl.SSLContext | None:
    config = loaded.config
    if config.security == "none":
        return None
    # Load the system trust store, then add ca_bundle to it: passing cafile to
    # create_default_context would replace the system CAs instead.
    context = ssl.create_default_context()
    if config.ca_bundle:
        context.load_verify_locations(cafile=config.ca_bundle)
    if not config.verify_tls:
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
    return context


def _stage(exc: Exception) -> EmailStage:
    if isinstance(exc, ssl.SSLError) or isinstance(exc.__cause__, ssl.SSLError):
        return "tls"
    if isinstance(exc, aiosmtplib.SMTPAuthenticationError):
        return "auth"
    if isinstance(exc, aiosmtplib.SMTPConnectError):
        return "connect"
    if isinstance(exc, aiosmtplib.SMTPException):
        if isinstance(exc, (aiosmtplib.SMTPResponseException, aiosmtplib.SMTPRecipientsRefused)):
            return "send"
        # aiosmtplib raises a bare SMTPException (or a timeout or disconnect) for a missing
        # STARTTLS or AUTH extension and for a failed TLS upgrade; only its text names the step.
        text = str(exc)
        if "STARTTLS" in text or "upgrading transport" in text:
            return "tls"
        if "AUTH" in text:
            return "auth"
        return "send"
    return "connect"


def _reason(exc: Exception, loaded: LoadedSmtpConfiguration) -> str:
    if isinstance(exc, aiosmtplib.SMTPRecipientsRefused):
        detail = "; ".join(f"{refused.code} {refused.message}" for refused in exc.recipients)
    elif isinstance(exc, aiosmtplib.SMTPResponseException):
        # The server reply only: a sender or recipient refusal also carries the address.
        detail = f"{exc.code} {exc.message}"
    else:
        detail = str(exc)
    reason = " ".join(f"{loaded.config.host}:{loaded.config.port}: {type(exc).__name__}: {detail}".split())
    if loaded.password is not None:
        reason = reason.replace(loaded.password.get_secret_value(), "***")
    return reason


async def send_email(
    to: str | Sequence[str],
    subject: str,
    text: str,
    html: str | None = None,
    *,
    configuration: str | None = None,
) -> None:
    """Send one message through ``configuration`` (or the default configuration)."""
    loaded = _resolve_configuration(configuration)
    if "\r" in subject or "\n" in subject:
        raise ValueError("subject: must not contain a line break")
    recipients = _recipients(to)
    message = _build_message(loaded, recipients, subject, text, html)
    config = loaded.config
    username: str | None = None
    password: str | None = None
    if config.username and loaded.password is not None:
        username = config.username
        password = loaded.password.get_secret_value()
    try:
        await aiosmtplib.send(
            message,
            hostname=config.host,
            port=config.port,
            start_tls=config.security == "starttls",
            use_tls=config.security == "ssl",
            tls_context=_tls_context(loaded),
            username=username,
            password=password,
            timeout=settings.smtp_timeout_seconds,
        )
    except (aiosmtplib.SMTPException, OSError) as exc:
        stage = _stage(exc)
        reason = _reason(exc, loaded)
        logger.warning("email via configuration %s failed at %s: %s", loaded.name, stage, reason)
        raise EmailSendError(stage, reason) from exc
    logger.info("email sent via configuration %s to %d recipient(s)", loaded.name, len(recipients))
