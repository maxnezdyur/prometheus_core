# Platform settings

The platform settings file holds settings that the operator owns. In this release it holds one
section, `smtp`, which defines the SMTP servers the platform can send email through. The file is
optional. With no file, email is off and the platform runs normally.

The backend reads the file one time, at startup. An administrator can read the loaded result,
with no password values, at `GET /api/admin/email-settings`, and send a test message at
`POST /api/admin/email-settings/test`. `platform/backend/CONTRACT.md` ("Admin: email settings")
gives the request and response shapes.

## The file and its path

| Item | Value |
|---|---|
| File in the checkout | `platform/settings/platform-settings.yml` (gitignored) |
| Example in the checkout | `platform/settings/platform-settings.example.yml` (committed) |
| Mount | Compose mounts `./settings` read-only at `/app/settings`, on the `backend` service only |
| File in the container | `/app/settings/platform-settings.yml` |
| Path variable | `PROMETHEUS_SETTINGS_PATH`, default `/app/settings/platform-settings.yml` |

Git ignores every file in `platform/settings/` except the example. Your settings file and a CA
bundle in the same directory are never committed.

## Set up email

Run each command from the `platform/` directory.

1. Copy the example to the settings file:

    ```bash
    cp settings/platform-settings.example.yml settings/platform-settings.yml
    ```

2. Edit `platform/settings/platform-settings.yml` to keep only the configurations that you need.
3. For each configuration with a `password`, set its variable in the backend environment. Refer to
   [Passwords](#passwords).
4. Start the backend again. A new or changed password variable needs a new container:

    ```bash
    docker compose -p prometheus_platform -f docker-compose.yml up -d backend
    ```

    A stack started with extra compose files (`docker-compose.override.yml`, the generated
    `docker-compose.agents.yml`) needs the same `-f` flags.

5. Read the startup log of the backend. Refer to [Startup log](#startup-log).

The backend reads the file only at startup. After you change only the file, restart the backend:

```bash
docker restart backend
```

A change to the file needs no image rebuild. `docker restart` keeps the environment of the
container, so it does not apply a changed password variable. For a changed password variable, run
this command from `platform/`:

```bash
docker compose -p prometheus_platform -f docker-compose.yml up -d backend
```

A stack started with extra compose files (`docker-compose.override.yml`, the generated
`docker-compose.agents.yml`) needs the same `-f` flags. Do not use `make restart` or `make up` for
this change, because they clear the LiteLLM database.

## The `smtp` section

The file is a YAML mapping. The backend reads only its `smtp` key and ignores all other top-level
keys. The `smtp` section has two keys, and no others:

- `configurations`: a map of named SMTP configurations. It must have one or more entries.
- `default`: the name of the configuration that the platform uses. You can omit it only when
  `configurations` has exactly one entry.

This example is the committed example file:

```yaml
smtp:
  default: mailpit          # optional when exactly one configuration exists
  configurations:
    relay:
      host: smtp.example.org
      port: 587                 # default 587
      security: starttls        # none | starttls | ssl; default starttls
      from_address: prometheus@example.org
      from_name: Prometheus     # optional
      verify_tls: true          # default true
      # optional; for starttls or ssl, adds this PEM CA bundle to the system
      # trust store. Checked at load: a missing or invalid file marks this
      # configuration invalid.
      # ca_bundle: /app/settings/relay-ca.pem
      # password: os.environ/SMTP_PASSWORD   # optional; env reference only
    mailpit:
      host: mailpit
      port: 1025
      security: none
      from_address: dev@example.com
```

The default configuration is `mailpit`, the local mail catcher. Refer to
[Local development with Mailpit](#local-development-with-mailpit).

### Configuration fields

The name of a configuration is its map key. A name has 1 to 64 characters of `a`-`z`, `0`-`9`
and `-`. A configuration accepts only the fields below. An unknown field makes the configuration
invalid.

| Field | Required | Rule | Default |
|---|---|---|---|
| `host` | yes | 1 to 255 characters, no whitespace | none |
| `port` | no | an integer from 1 to 65535 | `587` |
| `security` | no | `none`, `starttls` or `ssl` | `starttls` |
| `from_address` | yes | a valid email address | none |
| `from_name` | no | at most 255 characters | none |
| `username` | no | at most 255 characters | none |
| `password` | no | an environment reference only; refer to [Passwords](#passwords) | none |
| `verify_tls` | no | `true` or `false` | `true` |
| `ca_bundle` | no | a path, at most 512 characters | none |

The address check rejects a domain with no dot, such as `dev@localhost`. For a local test
address, use a domain such as `example.com`.

For `starttls` and `ssl`, the backend checks `ca_bundle` at load. Refer to
[TLS and a private CA](#tls-and-a-private-ca).

## TLS and a private CA

The `security` field sets how the backend protects the SMTP connection:

| `security` | Connection | Usual port |
|---|---|---|
| `none` | Plain SMTP, with no TLS | `25`, or `1025` for Mailpit |
| `starttls` | Plain SMTP, then a `STARTTLS` upgrade before the login | `587` |
| `ssl` | TLS from the first byte (implicit TLS) | `465` |

For `starttls` and `ssl`, the backend verifies the certificate of the server against the system
trust store. `verify_tls` and `ca_bundle` change this check:

- `ca_bundle` is the path of a PEM file in the backend container, for example
  `/app/settings/relay-ca.pem`. The backend adds its CA certificates to the system trust store. It
  does not replace the store.
- `verify_tls: false` turns off the check of the certificate and of the host name. Use it only for
  a test server. It removes the protection against a server that is not the real server.

To use a private CA, do these steps:

1. Put the PEM file in `platform/settings/`. Git ignores it.
2. Set `ca_bundle` to its path in the container, `/app/settings/<file>.pem`.
3. Restart the backend.

The backend reads the `ca_bundle` file at load, for `starttls` and `ssl` only. A bad file makes
that configuration invalid, with one of these errors:

| Condition | Error |
|---|---|
| The file does not exist or cannot be read | `ca_bundle: file not found: <path>` |
| The file has no valid PEM CA certificate | `ca_bundle: not a valid PEM CA bundle: <path>` |

For `security: none`, the backend does not use `ca_bundle` and does not check it.

### SMTP timeout

`SMTP_TIMEOUT_SECONDS` sets the time limit, in seconds, for the connection and for each SMTP
command. The default is `10`. The value must be a positive integer. An empty value gives the
default. Compose does not forward this variable to the backend. To change it, add it to the
`backend` service in `platform/docker-compose.override.yml`, as for a password variable in
[Give the backend a password variable](#give-the-backend-a-password-variable).

## Passwords

Never write a password in the settings file. Give a password only as a reference to an
environment variable of the backend:

```yaml
password: os.environ/SMTP_PASSWORD
```

The variable name must be `SMTP_PASSWORD` or `SMTP_<NAME>_PASSWORD`, for example
`SMTP_MAILPIT_PASSWORD`. `<NAME>` uses `A`-`Z` and `0`-`9`, in one or more parts joined by `_`.
These values make the configuration invalid:

- A literal password, for example `password: hunter2`.
- A reference to a variable with a different name, for example
  `password: os.environ/BACKEND_JWT_SECRET`.
- A reference to a variable that is not set, or that is empty.

The backend reads the value at startup and keeps it in memory only. The admin API and the log
never show the value.

### Give the backend a password variable

Compose forwards `SMTP_PASSWORD` to the backend, with an empty default. To set it, add this line
to `platform/.env`:

```bash
SMTP_PASSWORD=<smtp-password>
```

Compose does not forward an `SMTP_<NAME>_PASSWORD` variable. To forward one, add it to the
`backend` service in `platform/docker-compose.override.yml`. Git ignores this file, and Compose
includes it when it exists:

```yaml
services:
  backend:
    environment:
      SMTP_MAILPIT_PASSWORD: ${SMTP_MAILPIT_PASSWORD:-}
```

Then set `SMTP_MAILPIT_PASSWORD=<smtp-password>` in `platform/.env`. Run this command from
`platform/`:

```bash
docker compose -p prometheus_platform -f docker-compose.yml -f docker-compose.override.yml up -d backend
```

A stack started with other extra compose files (the generated `docker-compose.agents.yml`) needs
the same `-f` flags.

In production, the deployment fills these variables from its secrets vault (SR-7, ADR-001
Pattern A). The platform stores no SMTP password. Refer to
[Encryption & Keys](encryption-and-keys.md) for the other secrets of the platform.

## What a bad file does

The backend never fails to start because of the settings file. A problem turns email off, or
skips one configuration.

| Condition | Result |
|---|---|
| The file does not exist | Email is off. No error. |
| The file has no `smtp` section | Email is off. No error. |
| The file is not valid YAML, or is not a mapping | Email is off, with an error. |
| `smtp` is not a mapping, has an unknown key, or has no configurations | Email is off, with an error. |
| `default` is omitted and there are two or more configurations | Email is off, with an error. |
| `default` names no configuration in the file | Email is off, with an error. |
| A configuration breaks a field rule or a password rule | That configuration is invalid and is skipped. The other configurations load. |
| `default` names an invalid configuration | Email is off. The configuration shows its own error. |

Email is on only when `default` names a valid configuration. The admin API shows this as
`configured: true`.

## Startup log

At startup, the backend writes one `WARNING` line for a file error, and one `WARNING` line for
each invalid configuration:

```text
email: /app/settings/platform-settings.yml: smtp.default must name one of smtp.configurations
email: configuration relay is invalid: SMTP_PASSWORD is not set
```

Then it writes one `INFO` summary line:

```text
email: 1 configurations, default mailpit, 1 invalid
```

The second `WARNING` line and the summary line come from the example file with the `password`
line of `relay` uncommented and no `SMTP_PASSWORD` value. The first `WARNING` line comes from a
file whose `default` names no configuration.

With no file, the summary line is `email: 0 configurations, default None, 0 invalid`. No log line
contains a password value.

## Check the loaded settings

An administrator can read the loaded settings. The route returns `401` without a session, and
`403` for a user who is not an administrator. As an administrator, open the platform in the
browser. Then run this code in the browser console:

```javascript
fetch("/api/admin/email-settings").then((r) => r.json())
```

Each configuration shows `valid`, its `error`, `has_password` and `password_env`. The route returns
the state loaded at startup. It does not read the file again.

## Send a test email

An administrator can send one test message through a configuration. The route returns `401`
without a session, and `403` for a user who is not an administrator. As an administrator, open the
platform in the browser. Then run this code in the browser console:

```javascript
fetch("/api/admin/email-settings/test", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ to: "admin@example.com", configuration: "mailpit" }),
}).then((r) => r.json())
```

`to` is required. Omit `configuration` to use the default configuration. The message has the
subject `Prometheus test email`.

The route returns `200` for every SMTP result:

- `ok: true` means the server accepted the message.
- `ok: false` means the send failed. `stage` names the failed step (`connect`, `tls`, `auth` or
  `send`), and `error` gives the host, the port and the cause.

The route returns `404` for a configuration name that is not in the file. It returns `409` when
email is off, or when the configuration is invalid. `detail` then gives the reason. The backend
also writes one `WARNING` line for each failed send, with the configuration, the stage and the
reason. The line never contains the recipients, the body or a password.
`platform/backend/CONTRACT.md` gives all status codes.

## Local development with Mailpit

The `dev` Compose profile starts Mailpit, a mail catcher. Mailpit receives SMTP on `mailpit:1025`
inside the Compose network and keeps each message in container memory. Nothing leaves the stack:
Mailpit sends no message on to a real server. The SMTP port has no host port.

To send email to Mailpit, do these steps from the `platform/` directory:

1. Copy the example to the settings file. Its default configuration is `mailpit`:

    ```bash
    cp settings/platform-settings.example.yml settings/platform-settings.yml
    ```

2. Start the stack with the `dev` profile. `PROFILE=dev` is the default of `make up`:

    ```bash
    make up PROFILE=dev
    ```

3. Send a test message. Refer to [Send a test email](#send-a-test-email).
4. Open the Mailpit web UI at `http://localhost:8025` to read the message.

`MAILPIT_UI_PORT` in `platform/.env` sets the host port of the web UI and of its REST API. The
default is `8025`. Mailpit accepts any SMTP user name and password, so a configuration with a
`username` also works with it. A restart of the `mailpit` container deletes the messages.

## Send email from platform code

Backend code sends email with `send_email()` in `platform/backend/app/services/email.py`:

```python
from app.services.email import EmailError, send_email

await send_email("user@example.com", "Subject", "Text body", html=None, configuration=None)
```

With `configuration=None`, the function uses the default configuration. It raises only these
errors, and `ValueError` for an address that is not valid or a subject with a line break:

| Error | When |
|---|---|
| `EmailNotConfiguredError` | No configuration is named and there is no valid default |
| `EmailConfigurationError` | The named configuration is unknown (`unknown` is `true`) or invalid |
| `EmailSendError` | The SMTP exchange failed; `stage` and `reason` tell where and why |

All three are subclasses of `EmailError`. The first two come before any network call. Catch
`EmailError` where a failed email must not fail the request.
