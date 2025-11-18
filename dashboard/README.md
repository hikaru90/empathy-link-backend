# Dashboard Frontend

This folder contains a small multi-page Svelte app that powers the backend dashboards (`/index.html` for the NVC knowledge base manager and `/learn.html` for the learn CMS).

## Development

```bash
# install dependencies (run once)
npm install
npm install --prefix dashboard

# start the dashboard in dev/watch mode
npm run dashboard:dev
```

The dev server runs on http://localhost:4173 by default. The Hono backend will continue to serve the compiled `dist` output when running `npm run dev`.

## Building

```bash
npm run dashboard:build
```

The command outputs static assets into `dashboard/dist/`, which the Hono server serves from `/api` alongside the existing endpoints.

