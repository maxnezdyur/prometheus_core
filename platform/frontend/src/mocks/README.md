# UI preview mock layer

This directory serves the `/api` paths from a fixed, connected dataset through MSW (Mock Service
Worker). With it, you can run and capture the frontend with no backend. The layer starts only
when `VITE_UI_PREVIEW` is `true`. `src/main.tsx` then imports `browser.ts` before the app
renders. The production build holds none of this code.

| File | Purpose |
|---|---|
| `browser.ts` | Pins the clock, reads `?mock=`, and starts the service worker. |
| `handlers.ts` | One handler per `/api` path, then a 501 catch-all for each other `/api` path. |
| `state.ts` | Parses `?mock=` and gives the state of each resource. |
| `fixtures/` | The dataset. `fixtures/index.ts` exports it as `dataset`. |

## Run the preview

1. Go to `platform/frontend`.
2. Run `npm run dev:mock`. Vite serves the app at `http://localhost:5180/`, with no backend.
3. To get a static preview build, run `npm run build:mock`. The output goes to `dist-mock/`.
4. To prove that the production build has no mock code, run `npm run build`.
5. Then run `npm run check:mock-free`. The script reads `dist/` and exits 1 when it finds MSW
   code, the worker file or a fixture value.

## Call the API from a page

Import `api` from `@/lib/api/client` and call its functions, for example `api.listAgents()` or
`api.getStorage()`. Do not call `fetch` directly, and do not import from `src/mocks`. In mock
mode the worker answers the request. With a backend, the same call goes to the backend.

- `src/lib/api/types.ts` has the types of the paths that the backend serves.
- `src/lib/api/contract.ts` has the proposed types of the paths that no backend route serves
  yet. Each type has its path in its doc comment. When a backend serves a path, its type moves
  to `types.ts`.
- `src/lib/api/derive.ts` has the counters that a page computes from the records:
  `checkpointCounts`, `storagePercent`, `memberCountByRole`, `graphCounts` and `totalRuns`.

## Select a state with `?mock=`

The worker reads the `mock` query parameter one time, at page load. The grammar is
`<resource>:<state>[,<resource>:<state>...]`, for example
`http://localhost:5180/?mock=agents:empty,jobs:loading`.

| State | Answer |
|---|---|
| `populated` (default) | 200 with the fixture. |
| `empty` | 200 with `[]` for a list. A single record comes back emptied (see below). |
| `loading` | No answer. The request stays pending. |
| `error` | 502 with the gateway error body. |

- Use `*` as the resource to set the state of all resources, for example `?mock=*:error`.
  An entry for one resource has priority over `*`.
- Use `session:signed-out` to make `GET /api/auth/me` answer 401. The Login page then shows.
  The login form accepts any name and password.
- The parser ignores an unknown state. An unknown id on a detail path answers 404 in all states.
- The empty forms: `conversations` gives `{available: true, conversations: []}`, `graph` has no
  nodes and no edges, `storage` has `used_bytes: 0`, and `activity` has no tool traces.
- Writes (login, logout, chat messages, uploads, rename, delete, admin writes) answer with a
  valid response and change nothing. A chat message gets the text
  "Mock mode: no agent is connected."
- The boot paths take no state: `/api/setup/status`, `/api/config`, `POST /api/sessions` and
  the `/api/events` stream.

The resource names, from `handlers.ts`:

| Resource | Paths |
|---|---|
| `session` | `/api/auth/me`, `/api/auth/providers` |
| `conversations` | `/api/conversations/recent` |
| `conversation` | `GET /api/conversations/{id}` |
| `activity` | `/api/conversations/{id}/activity` |
| `workspace` | `/api/workspace` |
| `suggestions` | `/api/home/suggestions` |
| `jobs` | `/api/jobs` |
| `artifacts` | `/api/artifacts` |
| `viewer-model` | `/api/artifacts/{id}/model` |
| `agents` | `/api/agents`, `/api/agents/{id}` |
| `agent-categories` | `/api/agent-categories` |
| `skills` | `/api/skills` |
| `workflows` | `/api/workflows`, `/api/workflows/{id}` |
| `workflow-versions` | `/api/workflows/{id}/versions` |
| `graph` | `/api/graphs/{id}` |
| `plan` | `/api/plans/{id}` |
| `checkpoints` | `/api/checkpoints`, `/api/checkpoints/{id}` |
| `data-sources` | `/api/data-sources` |
| `storage` | `/api/storage` |
| `members` | `/api/members` |
| `roles` | `/api/roles` |
| `settings-options` | `/api/settings/options` |
| `admin-users` | `GET /api/admin/users` |
| `signing-keys` | `GET /api/admin/signing-keys` |
| `oidc-providers` | `GET /api/admin/oidc-providers` |

## The fixed now

All fixture times are before `MOCK_NOW` (`2025-10-26T12:00:00Z`, in `fixtures/time.ts`). Write a
fixture time as `ago({ days, hours, minutes })`, never as a literal date. In mock mode,
`browser.ts` calls `fixClock(MOCK_NOW)`. Then `now()` in `src/lib/clock.ts` returns `MOCK_NOW`,
and the labels of `relativeTime()` ("14m ago", "2d ago") are the same on each run. In a page,
get the current time from `now()`, not from `new Date()`.

## Add an entity

1. Add its type to `src/lib/api/contract.ts`, with its path in the doc comment.
2. Add an `api.*` function to `src/lib/api/client.ts` that calls `request<T>()` for that path.
3. Add the records to a fixture file in `fixtures/`.
4. Add the collection to `dataset` in `fixtures/index.ts`.
5. Use the ids of other records for references.
6. Use `ago(...)` for times.
7. Add a handler to `handlers.ts`, before the catch-all.
8. Use `list("<resource>", ...)` for a list and `record("<resource>", ...)` for one record.
9. Extend `fixtures/dataset.test.ts` so that each new reference field resolves.
10. Extend `handlers.test.ts` for the new path.
11. Run the tests from `platform/frontend`:
    `node --test --experimental-strip-types $(find src -name '*.test.ts')`.

## Switching a page store to the API

A page store calls the `api.*` functions in its `load()`. It sets `loading` first, then the
mapped records, or `error` when a call fails. A store that uses the API imports
`@/lib/api/client`. The store test must then stub that module in its loader hook.
`src/lib/store/chat.test.ts` shows how.
