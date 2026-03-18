```
npm install
npm run dev
```

```
open http://localhost:4000
```

## Authentication (local via Tailscale + production)

### Environments
- **Local (devices via Tailscale)**: run the backend normally, but access it from real devices using your stable Tailscale HTTPS URL, e.g. `https://<your-host>.ts.net`.
- **Production**: backend runs at `https://fsowkw4soogsgw08c0o8w8ws.clustercluster.de`.

### OAuth redirect URIs (Google/Apple)
OAuth providers must allow the **backend callback URL**, not the app URL:

- `<backendOrigin>/api/auth/callback/google`
- `<backendOrigin>/api/auth/callback/apple`

Examples:
- Dev (Tailscale): `https://<your-host>.ts.net/api/auth/callback/google`
- Prod: `https://fsowkw4soogsgw08c0o8w8ws.clustercluster.de/api/auth/callback/google`

### Native (Expo iOS/Android) social sign-in requirement
Native social login uses the Expo authorization proxy route from `@better-auth/expo`:

- `/api/auth/expo-authorization-proxy`

If this route is missing, native social sign-in will fail with **404**.

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
