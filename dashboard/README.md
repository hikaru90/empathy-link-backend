# Dashboard Frontend

This folder contains a small multi-page Svelte app that powers the backend dashboards (`/index.html` for the NVC knowledge base manager and `/analytics.html` for analytics).

## Development

```bash
# install dependencies (run once)
npm install
npm install --prefix dashboard

# start the dashboard in dev/watch mode
npm run dashboard:dev
```

The dashboard is served by the backend at http://localhost:4000 when you run `npm run dev`. Run `npm run dashboard:dev` to watch and rebuild on changes.

## Building

```bash
npm run dashboard:build
```

The command outputs static assets into `dashboard/dist/`, which the Hono server serves from `/api` alongside the existing endpoints.

