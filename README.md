# API Client Platform — a Postman Clone

A functional clone of the Postman API client: organize requests into collections, build and **send real HTTP requests** through a backend proxy/runner, inspect responses, manage environments and `{{variables}}`, and replay from history — wrapped in a faithful, dark-default Postman-style workspace.

> The backend is a real **proxy/runner**: the browser never calls the target API directly (avoiding CORS). It sends a structured request to FastAPI, which executes the outbound HTTP call with `httpx`, measures timing/size, and returns a structured response. Collections, environments, and history persist in SQLite.

---

## Table of Contents
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Database Schema](#database-schema)
- [API Overview](#api-overview)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Key Design Decisions](#key-design-decisions)
- [Testing](#testing)
- [Deployment](#deployment)
- [Assumptions](#assumptions)

---

## Features

**Core (all implemented & working)**
- **Workspace shell** — left sidebar (Collections / History tabs), center tabbed request builder, top bar with environment selector, resizable panels.
- **Request builder** — methods `GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS`; URL input with a **two-way-synced query-param table**; headers table; bodies: `none`, `raw` (JSON/Text/XML/HTML/JS with Monaco), `form-data` (multipart), `x-www-form-urlencoded`; auth: `None`, `Bearer`, `Basic`.
- **Send & response viewer** — real requests via the backend runner; **Pretty / Raw / Headers** views with JSON syntax highlighting (Monaco); status code, time, size meta line (`200 OK · 123 ms · 1.2 KB`); graceful typed errors (timeout, DNS/connection, invalid URL, TLS, blocked host, too many redirects).
- **Collections CRUD** — create/rename/delete collections, nested **folders**, save/edit/delete requests; everything persists.
- **Environments & variables** — CRUD environments with key/value vars; reference `{{var}}` in URL/params/headers/body/auth; resolved at send time against the active environment.
- **History** — every send is auto-recorded; click to re-open and replay; persisted.
- **Postman experience** — tabs with dirty indicators, resizable panes, key/value editor tables with the signature auto-appending phantom row, modals, search/filter, toasts, settings, keyboard shortcuts, command palette, light/dark themes.

**Bonus implemented**
- **Import / Export** Postman Collection v2.1 JSON.
- **Code snippet generation** (cURL / fetch) — backend `snippets.py`.
- **Dark mode** (default) + light theme with no-flash hydration.
- **Keyboard shortcuts** (⌘↵ send, ⌘S save, ⌘T new tab, ⌘W close, ⌘F search, ⌘K palette) + **command palette**.
- **{{variable}} highlighting** with resolved/unresolved coloring.

**Placeholders ("Coming Soon")** — Team workspaces, Mock servers, API documentation generation, Monitors. Real auth is stubbed (single default workspace / user).

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router) · React 18 · TypeScript (strict) |
| State | Zustand |
| Editor | Monaco (`@monaco-editor/react`, loaded client-only) |
| Layout | `react-resizable-panels` |
| Styling | Plain CSS Modules + CSS variables (no Tailwind — for precise Postman fidelity) |
| Backend | Python · FastAPI · `httpx` (async runner) |
| ORM / DB | SQLModel (SQLAlchemy) · SQLite |
| Validation | Pydantic v2 (camelCase wire contract) |
| Tests | pytest (backend) |

---

## Architecture

```
┌────────────────────────┐     JSON (camelCase)      ┌──────────────────────────────┐
│      Browser (SPA)      │  ───────────────────────► │      FastAPI backend          │
│  Next.js + Zustand      │   POST /api/run            │                               │
│                         │   CRUD /api/collections…   │  ┌────────────────────────┐  │
│  • tabsStore (builder)  │ ◄───────────────────────   │  │ runner (proxy)         │  │
│  • collections/env/hist │   RunResult / DTOs         │  │  safety→build→execute  │──┼──► target API
│  • variableResolver ────┼── resolves {{var}} before  │  │  timing + size + decode│  │   (httpx, real HTTP)
│    send (live preview)  │   send (frontend-first)    │  └────────────────────────┘  │
└────────────────────────┘                            │  ┌────────────────────────┐  │
                                                       │  │ services + routers     │  │
       CORS: browser only ever talks to FastAPI        │  │ collections/folders/   │  │
       (the proxy is the CORS mitigation)              │  │ requests/env/history   │  │
                                                       │  └───────────┬────────────┘  │
                                                       │       SQLModel│ ORM           │
                                                       │         ┌─────▼─────┐         │
                                                       │         │  SQLite   │         │
                                                       │         └───────────┘         │
                                                       └──────────────────────────────┘
```

**Request lifecycle (send):**
1. The builder holds a `RequestDraft` per open tab.
2. On **Send**, the frontend `variableResolver` substitutes `{{var}}` from the active environment into a concrete `RequestSpec` (so the preview matches the wire exactly).
3. `POST /api/run` receives `{ request: RequestSpec, options, environmentId, recordHistory }`.
4. The runner pipeline runs: **SSRF safety check → build httpx request (params merge, body encode, Content-Type ownership, auth applied last) → execute (manual redirects re-validated per hop, timing via `perf_counter`, byte-capped streaming read, charset decode) → map to `RunResult`**.
5. `/api/run` **always returns HTTP 200** with a `RunResult` envelope — upstream failures are `ok:false` + a typed `RunError`, never an HTTP 500. The send is recorded to history.
6. The frontend maps `RunResult` → `ResponseData` and renders it.

**Variable resolution** is frontend-authoritative (for live preview + token highlighting); the backend `resolver.py` is a byte-identical fallback for non-UI callers (used when an `environmentId` is passed with unresolved tokens). A shared fixture set (`tests/test_resolver_parity.py`) guards parity.

---

## Database Schema

SQLite, all PKs are UUID strings, all timestamps ISO-8601 UTC. `PRAGMA foreign_keys=ON` is enabled on every connection so cascades fire.

```
workspace (single default; root container; forward-compatible with multi-workspace)
  id, name, is_default, active_environment_id → environment(id) [SET NULL], created_at, updated_at

collection                     environment
  id, workspace_id [CASCADE]     id, workspace_id [CASCADE]
  name, description, sort_order  name, sort_order, created_at, updated_at
  created_at, updated_at
       │ 1                              │ 1
       │ *                              │ *
  folder (self-nesting)          environment_variable
    id, collection_id [CASCADE]    id, environment_id [CASCADE]
    parent_folder_id → folder(id)  key, value, is_secret, enabled, sort_order
      [CASCADE], name, sort_order  UNIQUE(environment_id, key)
       │
       │ *
  request                                   history_entry (denormalized snapshot)
    id, collection_id [CASCADE]               id, workspace_id [CASCADE]
    folder_id → folder(id) [CASCADE]          request_id → request(id) [SET NULL]
    name, method, url, description            environment_id → environment(id) [SET NULL]
    body_mode (none|raw|form-data|urlencoded) method, url, request_snapshot (JSON RequestSpec)
    body_raw, body_raw_language               status_code, status_text, response_time_ms,
    auth_type (none|bearer|basic)             response_size_bytes, response_headers (JSON),
    auth_config (JSON), sort_order            response_body (≤256KB), response_content_type,
       │                                      is_error, error_message, sent_at
       ├── request_header  (id, key, value, enabled, description, sort_order)
       ├── request_param   (id, key, value, enabled, description, sort_order)
       └── request_form_field (id, key, value, field_kind, enabled, content_type, sort_order)
```

**Design rationale**
- **Normalized child tables** for headers/params/form-fields/env-vars (not JSON blobs) → enables editable grids with per-row `enabled` toggles, ordering, and **duplicate keys** (HTTP allows repeated headers).
- **Opaque config as JSON** — `auth_config` and `body_raw` are variable-shape and never queried, so they stay as columns.
- **History is denormalized** — it stores the resolved `RequestSpec` snapshot + response summary, with **soft FKs** (`SET NULL`) so a history entry survives deletion of its originating request/environment and replays exactly what was sent.
- **`body_mode` uses the short token `urlencoded`** in the DB while the wire/UI uses `x-www-form-urlencoded`; translation happens in exactly one place (`request_service`).

---

## API Overview

All under `/api`. Responses are camelCase JSON. CRUD errors use `{ "error": { "code", "message", "resource?", "id?" } }` with `404`/`409`/`422`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness + version + safe-mode flag |
| GET | `/collections` | List collections, tree-expanded (folders + request summaries) |
| POST | `/collections` | Create collection |
| GET/PATCH/DELETE | `/collections/{id}` | Fetch / rename / delete (cascades) |
| POST | `/collections/{id}/folders` | Create a (optionally nested) folder |
| PATCH/DELETE | `/folders/{id}` | Rename / reparent (cycle-checked → 409) / delete |
| POST | `/collections/{id}/requests` | Save a request |
| GET/PATCH/DELETE | `/requests/{id}` | Load full / update / delete a saved request |
| GET | `/environments` | List environments (with variables) |
| POST | `/environments` | Create |
| GET | `/environments/{id}` | Fetch |
| PUT | `/environments/{id}` | Replace name + full variable set |
| PATCH | `/environments/{id}` | Partial update (primarily activate/`isActive`) |
| DELETE | `/environments/{id}` | Delete |
| **POST** | **`/run`** | **Execute an outbound request (proxy/runner) → `RunResult`** |
| GET | `/history` | List (newest-first, `?limit&offset&q&method`) |
| GET | `/history/{id}` | Fetch one (full snapshot + response preview) |
| POST | `/history` | Explicitly record an entry |
| DELETE | `/history/{id}` · `/history` | Delete one · clear all |
| POST | `/collections/import` | Import Postman Collection v2.1 JSON |
| GET | `/collections/{id}/export` | Export Postman Collection v2.1 JSON |

Interactive API docs are auto-generated at `http://localhost:8000/docs` (Swagger UI).

---

## Getting Started

**Prerequisites:** Node ≥ 18, Python ≥ 3.10.

### Backend
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.seed            # seed sample collections, environments, history
uvicorn app.main:app --reload --port 8000
```
Backend runs at `http://localhost:8000` (docs at `/docs`).

> **Safe mode:** `SAFE_MODE=false` by default (dev) so you can hit local mock servers. Set `SAFE_MODE=true` to block requests to private/loopback/metadata IPs (SSRF guard).

### Frontend
```bash
cd frontend
cp .env.local.example .env.local   # NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
npm install
npm run dev                        # http://localhost:3000
```

Open `http://localhost:3000`. The seeded "Httpbin API" and "JSONPlaceholder" collections, two environments, and some history are ready to use.

---

## Project Structure

```
postman-clone/
├── backend/
│   ├── app/
│   │   ├── main.py            # app factory: lifespan, CORS, exception handlers, routers
│   │   ├── config.py          # typed settings (env / .env)
│   │   ├── db.py              # engine, get_session, FK pragma, init_db
│   │   ├── models/            # SQLModel ORM (the schema)
│   │   ├── schemas/           # Pydantic DTOs (camelCase wire contract)
│   │   ├── resolver.py        # {{var}} resolver (mirrors the TS one)
│   │   ├── runner/            # the proxy: safety, builder, executor, client, errors
│   │   ├── services/          # business logic (collection/request/env/history/runner/snippets)
│   │   ├── routers/           # thin HTTP controllers
│   │   ├── postman/           # v2.1 import/export
│   │   └── seed.py            # sample data seeder
│   └── tests/                 # pytest (runner via MockTransport, CRUD, resolver parity)
└── frontend/
    └── src/
        ├── app/               # layout.tsx (no-flash theme), page.tsx (bootstrap)
        ├── types/             # the canonical TS contract (mirrors backend schemas)
        ├── lib/               # api client, variableResolver, queryParams, buildRequest, curl, formatters…
        ├── stores/            # Zustand: tabs, collections, environments, history, ui
        ├── components/        # workspace, sidebar, builder, response, environment, modals, common
        └── styles/            # tokens.css (all design vars) + per-area CSS modules
```

---

## Key Design Decisions

- **Backend as proxy/runner** — solves browser CORS and keeps a single, testable place for timing/size/redirect/SSRF logic.
- **`/api/run` always returns 200** — upstream failures are data (`RunError`), not transport errors, so the UI renders them inline like Postman. Only malformed requests to *our* API return 422.
- **Frontend-authoritative variable resolution** with a parity-tested Python mirror — the preview is exactly what goes on the wire.
- **Response headers as an ordered `{key,value}[]`** (not a map) to preserve duplicate/multi-value headers like `Set-Cookie`.
- **camelCase everywhere on the wire**, snake_case in the DB — bridged by a `CamelModel` Pydantic base; the frontend `types/index.ts` mirrors it 1:1.
- **Manual redirect following** so each hop is re-validated by the SSRF guard (open-redirect-to-internal protection).
- **Optimistic CRUD** in the stores with rollback + toast on failure.

---

## Testing

```bash
cd backend && source .venv/bin/activate && pytest -q
```
27 tests: the runner (via `httpx.MockTransport` — params merge, auth, JSON body, redirects, invalid scheme, blocked host, truncation), full CRUD + history through the FastAPI `TestClient`, and resolver parity fixtures.

Frontend correctness is enforced by TypeScript strict mode (`npm run build` typechecks the whole project) and a Puppeteer smoke flow used during development (send → 200 → history).

---

## Deployment

**See [DEPLOY.md](./DEPLOY.md) for step-by-step instructions.** In short:

- **Backend** → Render (free web service). Build `pip install -r requirements.txt`; start `python -m app.seed; uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Env: `SAFE_MODE=true`, `CORS_ORIGINS=*`, `DATABASE_URL=sqlite:////var/data/app.db` (+ a 1 GB disk at `/var/data` for persistence).
- **Frontend** → Vercel (root dir `frontend`). Env: `NEXT_PUBLIC_API_BASE_URL` = the backend's live URL. (It's baked at build time — redeploy after changing it.)
- `CORS_ORIGINS=*` is safe here because the backend is a credential-less proxy (no cookies). A `render.yaml` Blueprint (deploys both) and a backend `Dockerfile` are included.

> SQLite persists to a file; on ephemeral hosts mount a disk (as above) or switch `DATABASE_URL` to Postgres (SQLModel makes this a small change).

---

## Assumptions

- **Single default user / workspace** (real auth is out of scope — modeled via the `workspace` table so multi-user/team can layer on later).
- File uploads in `form-data` are modeled but not wired (text fields fully work); documented as a future extension.
- Variable resolution is single-pass and non-recursive (deterministic, no loops) — a resolved value containing `{{x}}` is inserted verbatim.
- The SSRF guard is assignment-grade (scheme allowlist + private-IP block, re-validated per redirect); a DNS-rebinding-proof implementation (pinning the resolved IP to the connection) is documented as a known gap.
- Response bodies are capped (10 MB fetched, truncated flag surfaced; ≤256 KB persisted to history) to keep the UI responsive.
```
