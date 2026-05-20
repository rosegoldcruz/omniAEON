# omniAEON Webapp

Next.js frontend for the omniAEON Projects, Views, Tasks, and Collaboration system.

Deployment model:

- Frontend: Vercel, rooted at this `webapp` directory.
- Backend: owned VPS running the API, PostgreSQL, Redis, realtime gateway, workers, and object storage integration.
- Cloudflare backend services are intentionally out of scope for this app.

## What Is Built

The current UI is a product workbench prototype that demonstrates the core model:

- Projects are both documents and databases.
- Records are task/block rows.
- Fields are project-level schema properties.
- Views render the same records as List, Board, Table, Calendar, Gantt, Mind Map, and Org Chart projections.
- Collaboration surfaces show realtime channel events, roles, comments, and schema state.

The full implementation plan is in [docs/projects-views-tasks-collaboration.md](docs/projects-views-tasks-collaboration.md).

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Build

```bash
npm run build
npm run lint
```

## Environment

The frontend should call the VPS API through an environment variable once the backend exists:

```bash
NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1
NEXT_PUBLIC_REALTIME_URL=wss://api.example.com/realtime
```
