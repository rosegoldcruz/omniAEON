# omniAEON Projects, Views, Tasks, and Collaboration Specification

This document defines the production architecture for a Taskade-inspired project system where a project is simultaneously a document, a database, and the backing data layer for multiple views. The intended deployment split is Vercel for the Next.js frontend and an owned VPS for the API, realtime gateway, workers, PostgreSQL, Redis, object storage integration, and background jobs.

## 1. Product Definition

### 1.1 Core Concept

A project is the single source of truth for a collection of records. It behaves like a document because records can be nested as blocks, headings, bullets, tasks, and subtasks. It behaves like a database because each record has typed field values. It behaves like a view engine because list, board, table, calendar, mind map, Gantt, and org chart layouts are projections of the same record set.

A record is one item in `project_records`. The same record can render as a list bullet, board card, table row, calendar event, Gantt bar, mind map node, or org chart node. The record is never duplicated between views.

A field is a project-level schema definition in `project_fields`. Field values live in `project_record_values`. System fields such as title, status, assignee, due date, start date, created at, and updated at can be denormalized onto `project_records` for speed while still preserving the generic field-value model.

### 1.2 Goals

- Use one canonical data model for all views.
- Support nested tasks, blocks, notes, and database-like rows.
- Support realtime collaboration, comments, mentions, assignments, attachments, watchers, and activity logs.
- Support custom fields and saved view configurations.
- Keep clean integration points for future AI agents and automations.
- Keep Cloudflare out of the main plan: the frontend deploys to Vercel, the backend runs on the owned VPS.

### 1.3 Non-Goals for V1

- No billing platform.
- No full AI agent runtime.
- No offline-first mobile sync.
- No complex public marketplace for templates or automations.

## 2. System Architecture

### 2.1 Suggested Stack

Frontend:

- Next.js App Router deployed to Vercel.
- React client state with Zustand or Redux Toolkit.
- TanStack Query for server cache, invalidation, optimistic updates, and retries.
- Tailwind CSS and a small internal design system.
- Virtualization with TanStack Virtual for long lists/tables.

Backend on VPS:

- Node.js with Fastify or NestJS. Fastify is leaner; NestJS is stronger for large modules.
- PostgreSQL as primary relational store.
- Redis for sessions, rate limits, websocket presence, and pub/sub fanout.
- WebSocket gateway using `ws`, Socket.IO, or uWebSockets.js.
- BullMQ or Faktory-style queue for background jobs and webhooks.
- S3-compatible object storage for attachments, such as MinIO on VPS or external S3.
- NGINX or Caddy as reverse proxy with TLS.
- Docker Compose for early production; migrate to k3s or Nomad only when needed.

### 2.2 Component Boundaries

- Auth service: registration, login, refresh tokens, password reset, session invalidation.
- Workspace service: workspaces, membership, roles, invitations.
- Project service: projects, fields, records, views, comments, attachments, events.
- Permission service: central authorization checks used by every route and websocket event.
- Realtime gateway: project rooms, presence, field updates, comment events, CRDT document sync.
- Automation service: consumes project events, invokes webhooks, exposes scoped API tokens.
- Search service: PostgreSQL full-text in V1, OpenSearch or Meilisearch later.

## 3. Data Model

Use UUID primary keys, `created_at`, `updated_at`, and soft delete or archive flags on user-facing entities. All tenant access starts from `workspace_id`.

### 3.1 Users and Sessions

```sql
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  refresh_token_hash text not null,
  user_agent text,
  ip_address inet,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
```

### 3.2 Workspaces

```sql
create type workspace_role as enum ('owner', 'admin', 'member', 'guest');

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references users(id),
  logo_url text,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
```

### 3.3 Projects and Permissions

```sql
create type project_visibility as enum ('private', 'workspace', 'public_readonly');
create type project_role as enum ('owner', 'editor', 'commenter', 'viewer');

create table projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  description text,
  icon text,
  color text,
  visibility project_visibility not null default 'workspace',
  is_archived boolean not null default false,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role project_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);
```

### 3.4 Fields and Records

```sql
create type project_field_type as enum (
  'text', 'rich_text', 'number', 'date', 'datetime', 'boolean', 'select',
  'multi_select', 'user', 'relation', 'file', 'url', 'email', 'phone', 'formula'
);

create table project_fields (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  key text not null,
  type project_field_type not null,
  config jsonb not null default '{}'::jsonb,
  is_required boolean not null default false,
  is_system boolean not null default false,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, key)
);

create table project_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  parent_id uuid references project_records(id) on delete set null,
  order_index numeric(20, 10) not null default 0,
  depth integer not null default 0,
  title text not null default '',
  status text,
  assignee_ids uuid[] not null default '{}',
  start_date date,
  due_date date,
  is_archived boolean not null default false,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table project_record_values (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references project_records(id) on delete cascade,
  field_id uuid not null references project_fields(id) on delete cascade,
  value jsonb not null default 'null'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (record_id, field_id)
);
```

### 3.5 Views

```sql
create type project_view_type as enum ('list', 'board', 'table', 'calendar', 'mind_map', 'gantt', 'org_chart');

create table project_views (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  type project_view_type not null,
  config jsonb not null default '{}'::jsonb,
  order_index integer not null default 0,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

View config shape:

```json
{
  "visible_field_ids": ["field_title", "field_status", "field_assignee"],
  "grouping_field_id": "field_status",
  "date_field_id": "field_due_date",
  "start_date_field_id": "field_start_date",
  "end_date_field_id": "field_due_date",
  "filters": [{ "field_id": "field_status", "op": "neq", "value": "done" }],
  "sorts": [{ "field_id": "field_due_date", "direction": "asc" }],
  "layout": { "density": "comfortable", "show_subtasks": true }
}
```

### 3.6 Comments, Assignments, Attachments, and Events

```sql
create table project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  record_id uuid not null references project_records(id) on delete cascade,
  parent_comment_id uuid references project_comments(id) on delete cascade,
  author_id uuid not null references users(id),
  body jsonb not null,
  is_resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table project_record_assignees (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references project_records(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (record_id, user_id)
);

create table project_record_watchers (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references project_records(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (record_id, user_id)
);

create table project_attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  record_id uuid not null references project_records(id) on delete cascade,
  file_url text not null,
  file_name text not null,
  file_size bigint not null,
  mime_type text not null,
  uploaded_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table project_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  record_id uuid references project_records(id) on delete set null,
  user_id uuid references users(id) on delete set null,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

### 3.7 Required Indexes

```sql
create index idx_projects_workspace on projects(workspace_id);
create index idx_records_project on project_records(project_id, is_archived, order_index);
create index idx_records_parent on project_records(project_id, parent_id, order_index);
create index idx_record_values_field on project_record_values(field_id);
create index idx_record_values_value_gin on project_record_values using gin(value);
create index idx_views_project on project_views(project_id, order_index);
create index idx_comments_record on project_comments(record_id, created_at);
create index idx_events_project_created on project_events(project_id, created_at desc);
```

## 4. API Design

Use `/api/v1` on the VPS backend. Vercel frontend talks to `NEXT_PUBLIC_API_BASE_URL`. All mutations return the updated canonical resource and emit a project event.

### 4.1 Auth

`POST /api/v1/auth/register`

Request:

```json
{ "email": "mara@example.com", "password": "correct-horse", "name": "Mara" }
```

Response:

```json
{ "user": { "id": "user_1", "email": "mara@example.com", "name": "Mara" }, "access_token": "jwt", "refresh_token": "opaque" }
```

`POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me` follow the same resource envelope.

### 4.2 Workspaces

- `GET /api/v1/workspaces`
- `POST /api/v1/workspaces`
- `GET /api/v1/workspaces/:workspaceId`
- `PATCH /api/v1/workspaces/:workspaceId`
- `DELETE /api/v1/workspaces/:workspaceId`
- `GET /api/v1/workspaces/:workspaceId/members`
- `POST /api/v1/workspaces/:workspaceId/members`
- `PATCH /api/v1/workspaces/:workspaceId/members/:memberId`
- `DELETE /api/v1/workspaces/:workspaceId/members/:memberId`

Create workspace request:

```json
{ "name": "omniAEON", "color": "#20201d" }
```

### 4.3 Projects

- `GET /api/v1/workspaces/:workspaceId/projects?include_archived=false`
- `POST /api/v1/workspaces/:workspaceId/projects`
- `GET /api/v1/projects/:projectId`
- `PATCH /api/v1/projects/:projectId`
- `DELETE /api/v1/projects/:projectId`
- `POST /api/v1/projects/:projectId/archive`
- `POST /api/v1/projects/:projectId/unarchive`

Create project request:

```json
{
  "name": "Product Roadmap",
  "description": "High-level roadmap for Q3",
  "icon": "rocket",
  "color": "#e4572e",
  "template": "kanban_default"
}
```

Create project response includes default fields and views:

```json
{
  "project": { "id": "project_1", "workspace_id": "workspace_1", "name": "Product Roadmap" },
  "fields": [
    { "id": "field_title", "key": "title", "type": "rich_text", "is_system": true },
    { "id": "field_status", "key": "status", "type": "select" }
  ],
  "views": [
    { "id": "view_list", "type": "list", "name": "List" },
    { "id": "view_board", "type": "board", "name": "Board" }
  ]
}
```

### 4.4 Fields

- `GET /api/v1/projects/:projectId/fields`
- `POST /api/v1/projects/:projectId/fields`
- `PATCH /api/v1/projects/:projectId/fields/:fieldId`
- `DELETE /api/v1/projects/:projectId/fields/:fieldId`

Create select field request:

```json
{
  "name": "Status",
  "key": "status",
  "type": "select",
  "config": {
    "options": [
      { "id": "todo", "label": "To Do", "color": "slate" },
      { "id": "in_progress", "label": "In Progress", "color": "blue" },
      { "id": "done", "label": "Done", "color": "green" }
    ]
  },
  "is_required": false
}
```

Validation rules:

- `key` must be unique per project and lower snake case.
- Cannot delete a required system field.
- Changing a field type must either migrate values or clear incompatible values explicitly.

### 4.5 Records

- `GET /api/v1/projects/:projectId/records?view_id=view_board&limit=100&cursor=...`
- `POST /api/v1/projects/:projectId/records`
- `GET /api/v1/projects/:projectId/records/:recordId`
- `PATCH /api/v1/projects/:projectId/records/:recordId`
- `DELETE /api/v1/projects/:projectId/records/:recordId`
- `POST /api/v1/projects/:projectId/records/:recordId/move`

Create record request:

```json
{
  "parent_id": null,
  "after_record_id": "rec_10",
  "values": {
    "title": "Design new onboarding flow",
    "status": "in_progress",
    "priority": "high",
    "assignee": ["user_1"],
    "due_date": "2026-06-01"
  }
}
```

Patch record request:

```json
{
  "values": {
    "status": "done",
    "due_date": "2026-06-05"
  },
  "client_revision": 42
}
```

Record response:

```json
{
  "record": {
    "id": "rec_1",
    "project_id": "project_1",
    "parent_id": null,
    "order_index": "2000.0000000000",
    "values": {
      "title": "Design new onboarding flow",
      "status": "done",
      "priority": "high",
      "assignee": ["user_1"],
      "due_date": "2026-06-05"
    },
    "updated_at": "2026-05-20T13:00:00Z"
  }
}
```

### 4.6 Views

- `GET /api/v1/projects/:projectId/views`
- `POST /api/v1/projects/:projectId/views`
- `GET /api/v1/projects/:projectId/views/:viewId`
- `PATCH /api/v1/projects/:projectId/views/:viewId`
- `DELETE /api/v1/projects/:projectId/views/:viewId`

Create board view request:

```json
{
  "name": "Kanban Board",
  "type": "board",
  "config": {
    "grouping_field_id": "field_status",
    "visible_field_ids": ["field_title", "field_status", "field_assignee", "field_due_date"],
    "filters": [],
    "sorts": [{ "field_id": "field_priority", "direction": "desc" }]
  }
}
```

### 4.7 Comments, Assignments, Attachments

- `GET /api/v1/projects/:projectId/records/:recordId/comments`
- `POST /api/v1/projects/:projectId/records/:recordId/comments`
- `PATCH /api/v1/projects/:projectId/comments/:commentId`
- `DELETE /api/v1/projects/:projectId/comments/:commentId`
- `POST /api/v1/projects/:projectId/records/:recordId/assignees`
- `DELETE /api/v1/projects/:projectId/records/:recordId/assignees/:userId`
- `POST /api/v1/projects/:projectId/records/:recordId/attachments`
- `DELETE /api/v1/projects/:projectId/attachments/:attachmentId`

Comment request:

```json
{ "body": { "type": "doc", "content": [{ "type": "paragraph", "text": "Clarify acceptance criteria." }] } }
```

## 5. View Rendering Logic

Every view starts from records plus fields plus one view config. The frontend should normalize entities into stores by ID, then selectors project them into layout-specific shapes.

### 5.1 List View

Input: records ordered by `parent_id` and `order_index`.

Algorithm:

1. Fetch records with `GET /records?view_id=view_list`.
2. Build `childrenByParentId` map.
3. Recursively flatten from `parent_id = null`.
4. Render indentation from `depth` or recursion level.
5. Enter creates a sibling after the current record.
6. Tab moves the record under the previous visible record.
7. Shift+Tab moves the record to its grandparent.
8. Drag reorder calls `POST /records/:recordId/move` with `parent_id`, `before_record_id`, or `after_record_id`.

### 5.2 Board View

Input: `grouping_field_id` must point to a select or user field.

Algorithm:

1. Resolve grouping field from `project_fields`.
2. Build columns from select options or workspace users.
3. Group records by the value in `project_record_values`.
4. Dragging a card between columns sends `PATCH /records/:recordId` with the new grouping field value.
5. Dragging within a column sends `POST /records/:recordId/move` with a lane-specific order token if using per-view ordering.

### 5.3 Table View

Input: `visible_field_ids`, filters, sorts.

Algorithm:

1. Backend applies filters and sorts where possible.
2. Frontend renders a virtualized grid.
3. Each cell editor validates against `field.type` and `field.config`.
4. Save on blur or Enter with optimistic update.
5. Failed validation reverts the cell and shows inline error.

### 5.4 Calendar View

Input: `date_field_id` or date range field.

Algorithm:

1. Query only records with non-null date value in the visible range.
2. Map each record to a calendar event.
3. Dragging an event to a new day updates the date field.
4. If the field is a range, preserve duration when dragging.

### 5.5 Gantt View

Input: `start_date_field_id`, `end_date_field_id`, optional dependency relation field.

Algorithm:

1. Fetch records in visible date window.
2. Convert dates to timeline coordinates.
3. Resize left handle updates start date.
4. Resize right handle updates end date.
5. Moving the bar updates both dates while preserving duration.
6. Dependency validation blocks cycles.

### 5.6 Mind Map View

Input: hierarchy via `parent_id`.

Algorithm:

1. Build tree from parent-child relationships.
2. Layout root in center or left edge.
3. Render child records as nodes.
4. Editing node title updates the title field.
5. Dragging a node under another node updates `parent_id`.

### 5.7 Org Chart View

Input: either `parent_id` or a relation/user field such as manager.

Algorithm:

1. Resolve chart mode from view config.
2. Build directed tree from parent or manager relation.
3. Detect cycles and orphan nodes.
4. Render top-down with collapsible branches.

## 6. Realtime Collaboration

### 6.1 WebSocket Connection

Endpoint: `wss://api.omniaeon.example/realtime`

Client sends auth immediately:

```json
{ "type": "auth", "token": "jwt", "client_id": "browser_tab_uuid" }
```

Join project room:

```json
{ "type": "join_project", "project_id": "project_1" }
```

Room name: `project:project_1`. Presence key in Redis: `presence:project:project_1`.

### 6.2 Broadcast Event Shape

```json
{
  "id": "evt_1",
  "type": "record_updated",
  "workspace_id": "workspace_1",
  "project_id": "project_1",
  "record_id": "rec_1",
  "actor_id": "user_1",
  "revision": 43,
  "payload": {
    "before": { "status": "in_progress" },
    "after": { "status": "done" },
    "record": { "id": "rec_1", "values": { "status": "done" } }
  },
  "created_at": "2026-05-20T13:00:00Z"
}
```

### 6.3 Update Flow

1. User edits a field in the frontend.
2. Frontend applies optimistic update and marks entity `pending`.
3. Frontend sends HTTP PATCH or websocket mutation.
4. Backend authenticates token and authorizes action.
5. Backend validates field type and project schema.
6. Backend writes to PostgreSQL in a transaction.
7. Backend inserts a `project_events` row.
8. Backend publishes event to Redis channel `project:project_1`.
9. WebSocket gateway broadcasts to all project subscribers except the originating client or with an origin marker.
10. Frontend reconciles by revision number and clears pending state.

### 6.4 Conflicts

Simple scalar fields use last write wins by default. Every accepted write increments a per-record revision and creates an event log entry. If the client sends an old `client_revision`, the backend can still accept the write but returns `conflict: true` with the server-before snapshot.

Rich text fields should use Yjs in V1. Store compact Yjs updates in `project_record_text_updates` or periodically snapshot merged state into `project_record_values.value`.

## 7. Permissions

Permission check inputs: authenticated user, workspace membership, project visibility, project member override, action.

Workspace roles:

- Owner: all workspace and project actions.
- Admin: manage members except owner, create/delete projects, manage templates.
- Member: create projects and edit workspace-visible projects unless project override says otherwise.
- Guest: only explicitly shared projects.

Project roles:

- Owner: manage settings, delete project, manage project members.
- Editor: create/edit/delete records, fields, views, comments, attachments.
- Commenter: read records and write comments.
- Viewer: read only.

Every API route calls `authorize(userId, projectId, action)` before reading sensitive data or mutating state. WebSocket `join_project` also calls authorization and stores the allowed role on the socket context.

## 8. UX Flows

### 8.1 Create Workspace

1. User registers.
2. Frontend sends `POST /workspaces` with name and color.
3. Backend creates workspace and owner membership in one transaction.
4. Frontend routes to `/workspaces/:id/projects`.

### 8.2 Create Project

1. User clicks New Project.
2. Modal asks for name, icon, color, template.
3. Frontend sends `POST /workspaces/:id/projects`.
4. Backend creates project, default fields, and default views in one transaction.
5. Frontend opens the default List view.

Default fields: title, status, assignee, due date, priority, tags.

Default views: List, Board grouped by status, Table, Calendar by due date.

### 8.3 Add/Edit Records

List:

- Enter creates sibling.
- Tab indents under previous visible record.
- Shift+Tab outdents.
- Inline chips edit status, assignee, priority, due date.

Board:

- Plus in column creates a record with grouping value prefilled.
- Drag to another column patches grouping field.
- Click card opens details panel.

Table:

- Double-click edits cell.
- Arrow keys navigate cells.
- Column menu configures sort, filter, hide, and width.

### 8.4 Collaboration

Record detail panel contains fields, comments, attachments, watchers, and activity. Mentions create notifications. Resolved comment threads remain in history but collapse by default.

Presence indicators show active users, focused record, and optional cursor selection. Presence updates are ephemeral Redis data and are not stored in PostgreSQL.

## 9. Performance and Reliability

- Paginate records with cursor-based pagination.
- Use virtualized list, table, board lanes, and Gantt rows.
- Cache project fields and views in Redis for 60 seconds and invalidate on field/view mutation.
- Use PostgreSQL JSONB GIN indexes for generic values, plus denormalized columns for hot fields.
- Limit websocket event payloads to diffs and fetch full records on demand if event is too large.
- Store project events for audit and webhook retries.
- Run nightly database backups and test restore jobs monthly.

## 10. AI and Automations

### 10.1 Event Bus

Internal event types:

- `project.record.created`
- `project.record.updated`
- `project.record.deleted`
- `project.comment.created`
- `project.field.created`
- `project.view.updated`

Automation event shape:

```json
{
  "event_id": "evt_1",
  "type": "project.record.updated",
  "workspace_id": "workspace_1",
  "project_id": "project_1",
  "record_id": "rec_1",
  "actor_id": "user_1",
  "before": { "status": "review" },
  "after": { "status": "done" },
  "occurred_at": "2026-05-20T13:00:00Z"
}
```

### 10.2 Webhooks

Workspace owners configure webhook URL, secret, and subscribed event types. Delivery signs payloads with `HMAC-SHA256(secret, rawBody)`. Failed deliveries retry with exponential backoff and dead-letter after the configured limit.

### 10.3 AI Agent Tokens

API tokens are scoped by workspace, project, and actions:

```json
{
  "workspace_id": "workspace_1",
  "project_ids": ["project_1"],
  "scopes": ["records:read", "records:write", "comments:write"]
}
```

Agents can read schema, query records, create records, update fields, and add comments. They cannot manage members, delete projects, or view private projects outside their scope.

## 11. Implementation Roadmap

### Phase 1: Foundations

1. Create VPS backend repo with Fastify/NestJS, PostgreSQL, Redis, and Docker Compose.
2. Add migrations for users, sessions, workspaces, members, projects, fields, records, values, views, comments, events.
3. Implement auth routes and secure refresh-token rotation.
4. Implement workspace CRUD and membership routes.
5. In Next.js, add auth pages, workspace shell, project list, API client, TanStack Query provider.

### Phase 2: Core Project Dataset

1. Implement project CRUD.
2. On project creation, insert default fields and views transactionally.
3. Implement field CRUD with type validation.
4. Implement record CRUD and generic value persistence.
5. Implement list view with nesting, inline title edit, create sibling, indent, outdent, and delete.

### Phase 3: Multi-View Rendering

1. Implement view CRUD and saved view config.
2. Implement board grouped by select field.
3. Implement table with visible fields, sorting, filtering, resizing, and virtualization.
4. Implement calendar by date field.
5. Implement Gantt by start/end date fields.
6. Implement mind map and org chart from parent/child data.

### Phase 4: Collaboration

1. Add WebSocket gateway with auth and project rooms.
2. Broadcast record, field, view, comment, and presence events.
3. Add optimistic updates on frontend and revision reconciliation.
4. Add comments, mentions, watchers, assignments, and activity log.
5. Add Yjs for rich text fields.

### Phase 5: Production Hardening

1. Add permission checks to every API and websocket message.
2. Add audit tests for role/action combinations.
3. Add rate limiting, structured logs, request IDs, health checks, and metrics.
4. Add backups, restore documentation, and migration rollback procedures.
5. Add webhook delivery, API tokens, and automation event consumers.

## 12. Edge Cases

- Deleting a field must either archive values or hard-delete only after confirmation.
- Changing a select option ID must migrate record values using that option.
- Moving a record under its own descendant must be rejected.
- Calendar records without dates are hidden by default but available in an unscheduled tray.
- Board grouping field deleted means the view becomes invalid until repaired.
- Guest websocket joins must not leak project names or presence for inaccessible projects.
- Large projects need server-side filters and virtualized rendering before loading every record.
- Offline edits must be queued with revision checks or blocked until offline mode is designed.