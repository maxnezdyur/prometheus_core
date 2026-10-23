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

"""Admin API: read the SMTP configurations loaded from the platform settings file,
and send a test message through one of them.

The settings are read-only: the file (app/email_settings.py) is the only source,
loaded once at startup. No password value is ever returned -- a configuration reports only
``has_password`` and the name of its ``password_env`` variable.
"""

from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

from app.email_settings import EmailSettings, get_email_settings
from app.security import require_admin
from app.services.email import (
    EmailConfigurationError,
    EmailNotConfiguredError,
    EmailSendError,
    EmailStage,
    send_email,
)

router = APIRouter(prefix="/api/admin/email-settings", tags=["admin"], dependencies=[Depends(require_admin)])


class EmailConfigurationOut(BaseModel):
    name: str
    is_default: bool
    valid: bool
    error: Optional[str]
    # Connection fields are null for an invalid configuration.
    host: Optional[str]
    port: Optional[int]
    security: Optional[Literal["none", "starttls", "ssl"]]
    verify_tls: Optional[bool]
    ca_bundle: Optional[str]
    username: Optional[str]
    from_address: Optional[str]
    from_name: Optional[str]
    has_password: bool
    password_env: Optional[str]
    # password intentionally omitted -- never read back.


class EmailSettingsOut(BaseModel):
    configured: bool
    settings_file: str
    file_present: bool
    default: Optional[str]
    error: Optional[str]
    configurations: list[EmailConfigurationOut]


class EmailTestRequest(BaseModel):
    to: EmailStr
    # None sends through the default configuration.
    configuration: Optional[str] = None


class EmailTestResult(BaseModel):
    ok: bool
    configuration: str
    to: str
    # Both null on success; on an SMTP failure, the stage that failed and its reason.
    stage: Optional[EmailStage]
    error: Optional[str]


def _configuration_out(state: EmailSettings, name: str) -> EmailConfigurationOut:
    loaded = state.configurations.get(name)
    if loaded is None:
        error, password_env = state.invalid[name]
        return EmailConfigurationOut(
            name=name,
            is_default=name == state.default,
            valid=False,
            error=error,
            host=None,
            port=None,
            security=None,
            verify_tls=None,
            ca_bundle=None,
            username=None,
            from_address=None,
            from_name=None,
            has_password=False,
            password_env=password_env,
        )
    config = loaded.config
    return EmailConfigurationOut(
        name=name,
        is_default=name == state.default,
        valid=True,
        error=None,
        host=config.host,
        port=config.port,
        security=config.security,
        verify_tls=config.verify_tls,
        ca_bundle=config.ca_bundle,
        username=config.username,
        from_address=config.from_address,
        from_name=config.from_name,
        has_password=loaded.password is not None,
        password_env=loaded.password_env,
    )


@router.get("", response_model=EmailSettingsOut)
async def get_settings(state: EmailSettings = Depends(get_email_settings)) -> EmailSettingsOut:
    names = sorted({*state.configurations, *state.invalid})
    return EmailSettingsOut(
        configured=state.configured,
        settings_file=state.settings_file,
        file_present=state.file_present,
        default=state.default,
        error=state.error,
        configurations=[_configuration_out(state, name) for name in names],
    )


@router.post("/test", response_model=EmailTestResult)
async def send_test_email(
    body: EmailTestRequest, state: EmailSettings = Depends(get_email_settings)
) -> EmailTestResult:
    """Send one test message. Every SMTP outcome is a 200; ``ok`` tells success from failure."""
    # Resolve the name here, so the result names the configuration the message went through.
    default = state.default_configuration()
    name = body.configuration if body.configuration is not None else (default.name if default is not None else None)
    if name is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(EmailNotConfiguredError()))
    try:
        await send_email(
            body.to,
            "Prometheus test email",
            f"This is a test email from Prometheus, sent through the email configuration '{name}'.",
            configuration=name,
        )
    except EmailConfigurationError as exc:
        code = status.HTTP_404_NOT_FOUND if exc.unknown else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=code, detail=str(exc)) from exc
    except EmailSendError as exc:
        return EmailTestResult(ok=False, configuration=name, to=body.to, stage=exc.stage, error=exc.reason)
    return EmailTestResult(ok=True, configuration=name, to=body.to, stage=None, error=None)
