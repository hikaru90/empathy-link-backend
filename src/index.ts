import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { auth } from './lib/auth.js'
import { cors } from "hono/cors";
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import testRuns from './routes/test-runs.js';
import messages from './routes/messages.js';
import garden from './routes/garden.js';
import reminders from './routes/reminders.js';
import ai from './routes/ai.js';
import stats from './routes/stats.js';
import bullshift from './routes/bullshift.js';
import data from './routes/data.js';
import streaks from './routes/streaks.js';
import analyses from './routes/analyses.js';
import memories from './routes/memories.js';
import nvcKnowledge from './routes/nvc-knowledge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = new Hono()

app.use('/*', cors({
  origin: [
    'http://localhost:8081',
    'http://localhost:5173', // SvelteKit dev server
    'http://192.168.0.230:8081', // Local network access for mobile devices
    /^http:\/\/192\.168\.\d+\.\d+:8081$/, // Any local network IP
  ],
  credentials: true,
}))

app.on(["POST", "GET"], "/api/auth/**", (c) => auth.handler(c.req.raw));

// Auth middleware - add user to context
app.use('/api/*', async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (session) {
    c.set('user', session.user);
  }
  await next();
});

// Register API routes (must come before static serving)
app.route('/api/test-runs', testRuns);
app.route('/api/messages', messages);
app.route('/api/garden', garden);
app.route('/api/reminders', reminders);
app.route('/api/ai', ai);
app.route('/api/ai/bullshift', bullshift);
app.route('/api/stats', stats);
app.route('/api/data', data);
app.route('/api/streaks', streaks);
app.route('/api/analyses', analyses);
app.route('/api/memories', memories);
app.route('/api/nvc-knowledge', nvcKnowledge);

// Serve static files from dashboard directory (after API routes)
const staticPath = join(__dirname, '../dashboard');

// Serve static assets (JS, CSS, images, etc.)
app.use('/*', async (c, next) => {
	// Skip API routes
	if (c.req.path.startsWith('/api/')) {
		return next();
	}
	
	// Try to serve static file
	try {
		return await serveStatic({ root: staticPath })(c, next);
	} catch {
		return next();
	}
});

// Fallback to index.html for SPA routing (catch-all for non-API routes)
app.get('*', async (c) => {
	// Skip API routes
	if (c.req.path.startsWith('/api/')) {
		return c.notFound();
	}
	
		try {
			const indexHtml = readFileSync(join(staticPath, 'index.html'), 'utf-8');
			return c.html(indexHtml);
		} catch {
			return c.text('Hello Hono! Dashboard files not found.');
		}
});

serve({
  fetch: app.fetch,
  port: 4000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
