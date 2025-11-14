```
npm install
npm run dev
```

```
open http://localhost:3000
```

## NVC Knowledge Base Dashboard

The project includes a SvelteKit dashboard for managing the NVC Knowledge Base, served from the same Hono backend.

### Building the Dashboard

```bash
# Install all dependencies (including dashboard)
npm install

# Build the dashboard
npm run build:dashboard

# Or build everything
npm run build:all
```

### Running

```bash
# Start backend (serves dashboard at root)
npm run dev

# Dashboard will be available at http://localhost:4000
```

### Dashboard Development

For dashboard development with hot reload:

```bash
npm run dev:dashboard
```

This runs the SvelteKit dev server separately for development.
