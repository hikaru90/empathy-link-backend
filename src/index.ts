import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync } from 'fs';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { cors } from "hono/cors";
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { auth } from './lib/auth.js';
import ai from './routes/ai.js';
import analyses from './routes/analyses.js';
import bullshift from './routes/bullshift.js';
import data from './routes/data.js';
import garden from './routes/garden.js';
import learn from './routes/learn.js';
import memories from './routes/memories.js';
import messages from './routes/messages.js';
import nvcKnowledge from './routes/nvc-knowledge.js';
import reminders from './routes/reminders.js';
import stats from './routes/stats.js';
import streaks from './routes/streaks.js';
import testRuns from './routes/test-runs.js';
import user from './routes/user.js';
import type { Env } from './types/hono.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = new Hono<Env>()

app.use('/*', cors({
  origin: (origin) => {
    const allowedOrigins = [
      'http://localhost:8081',
      'http://localhost:5173', // SvelteKit dev server
      'http://localhost:4173', // Vite dev server
      'http://192.168.0.230:8081', // Local network access for mobile devices
      'https://expo.clustercluster.de', // Production frontend
    ];
    if (!origin) return null;
    if (allowedOrigins.includes(origin)) return origin;
    // Check if origin matches localhost on any port
    if (/^http:\/\/localhost:\d+$/.test(origin)) return origin;
    // Check if origin matches local network IP pattern on any port
    if (/^http:\/\/192\.168\.\d+\.\d+:\d+$/.test(origin)) return origin;
    return null;
  },
  credentials: true,
}))

/**
 * Translate better-auth error messages to German
 */
function translateErrorMessage(message: string): string {
	const messageLower = message.toLowerCase();
	
	// Email/Account errors
	if (messageLower.includes('already exists') || 
	    messageLower.includes('duplicate') ||
	    messageLower.includes('unique constraint') ||
	    (messageLower.includes('email') && (messageLower.includes('taken') || messageLower.includes('exists'))) ||
	    messageLower.includes('user already exists')) {
		return 'Diese E-Mail-Adresse ist bereits registriert. Bitte verwende eine andere E-Mail-Adresse.';
	}
	
	if (messageLower.includes('invalid email') || messageLower.includes('email is invalid')) {
		return 'Die E-Mail-Adresse ist ungültig. Bitte überprüfe deine Eingabe.';
	}
	
	if (messageLower.includes('email not found') || messageLower.includes('user not found')) {
		return 'Kein Konto mit dieser E-Mail-Adresse gefunden.';
	}
	
	// Password errors
	if (messageLower.includes('invalid password') || messageLower.includes('incorrect password')) {
		return 'Das Passwort ist falsch. Bitte versuche es erneut.';
	}
	
	if (messageLower.includes('password too short') || messageLower.includes('password must be')) {
		return 'Das Passwort ist zu kurz. Bitte verwende mindestens 8 Zeichen.';
	}
	
	if (messageLower.includes('password required')) {
		return 'Ein Passwort ist erforderlich.';
	}
	
	// Verification errors
	if (messageLower.includes('email not verified') || messageLower.includes('email verification required')) {
		return 'Deine E-Mail-Adresse wurde noch nicht verifiziert. Bitte überprüfe dein E-Mail-Postfach.';
	}
	
	if (messageLower.includes('verification token') && (messageLower.includes('invalid') || messageLower.includes('expired'))) {
		return 'Der Verifizierungslink ist ungültig oder abgelaufen. Bitte fordere einen neuen Link an.';
	}
	
	// Session/Token errors
	if (messageLower.includes('invalid session') || messageLower.includes('session expired')) {
		return 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.';
	}
	
	if (messageLower.includes('unauthorized') || messageLower.includes('not authenticated')) {
		return 'Du bist nicht angemeldet. Bitte melde dich an.';
	}
	
	// Rate limiting
	if (messageLower.includes('too many requests') || messageLower.includes('rate limit')) {
		return 'Zu viele Anfragen. Bitte versuche es später erneut.';
	}
	
	// Generic errors
	if (messageLower.includes('bad request')) {
		return 'Ungültige Anfrage. Bitte überprüfe deine Eingaben.';
	}
	
	if (messageLower.includes('internal server error')) {
		return 'Ein Serverfehler ist aufgetreten. Bitte versuche es später erneut.';
	}
	
	// If no translation found, return original message
	return message;
}

app.on(["POST", "GET", "OPTIONS"], "/api/auth/*", async (c) => {
	try {
		// Handle both Promise and direct Response returns
		const handlerResult = auth.handler(c.req.raw);
		const response = handlerResult instanceof Promise ? await handlerResult : handlerResult;
		
		// Transform error responses to match frontend expectations
		if (response && response.status >= 400) {
			const clonedResponse = response.clone();
			try {
				const errorData = await clonedResponse.json();
				
				// Check if error is already in the expected format
				if (errorData?.error && typeof errorData.error === 'object' && 
				    errorData.error.message && errorData.error.status) {
					// Translate the message to German
					const translatedMessage = translateErrorMessage(errorData.error.message);
					return c.json({
						error: {
							message: translatedMessage,
							status: errorData.error.status,
							statusText: errorData.error.statusText || 'Error'
						}
					}, errorData.error.status);
				}
				
				// Better-auth might return errors in different formats
				// Transform to consistent format with 'error' field containing message, status, statusText
				let errorMessage = 'Ein Fehler ist aufgetreten';
				let statusCode = response.status;
				let statusText = response.statusText || 'Error';
				
				// Extract error message from various possible formats
				if (errorData?.error?.message) {
					errorMessage = errorData.error.message;
				} else if (errorData?.message) {
					errorMessage = errorData.message;
				} else if (errorData?.error && typeof errorData.error === 'string') {
					errorMessage = errorData.error;
				} else if (typeof errorData === 'string') {
					errorMessage = errorData;
				}
				
				// Translate error message to German
				errorMessage = translateErrorMessage(errorMessage);
				
				// Set appropriate status text for common status codes
				if (statusCode === 422) {
					statusText = 'Unprocessable Entity';
				} else if (statusCode === 401) {
					statusText = 'Unauthorized';
				} else if (statusCode === 403) {
					statusText = 'Forbidden';
				} else if (statusCode === 404) {
					statusText = 'Not Found';
				} else if (statusCode === 429) {
					statusText = 'Too Many Requests';
				} else if (statusCode === 500) {
					statusText = 'Internal Server Error';
				}
				
				// Return error in the format frontend expects: { error: { message, status, statusText } }
				return c.json({ 
					error: {
						message: errorMessage,
						status: statusCode,
						statusText: statusText
					}
				}, statusCode);
			} catch (parseError) {
				// If response is not JSON, return error in expected format
				return c.json({
					error: {
						message: 'Ein Fehler ist aufgetreten',
						status: response.status,
						statusText: response.statusText || 'Error'
					}
				}, response.status);
			}
		}
		
		return response;
	} catch (error: any) {
		// Fallback error handling
		console.error('Auth handler error:', error);
		return c.json({ 
			error: {
				message: translateErrorMessage(error?.message || 'Ein Fehler ist bei der Authentifizierung aufgetreten'),
				status: 500,
				statusText: 'Internal Server Error'
			}
		}, 500);
	}
});

// Auth middleware - add user to context
app.use('/api/*', async (c: Context<Env>, next) => {
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
app.route('/api/learn', learn);
app.route('/api/user', user);

// Serve static files from dashboard directory (after API routes)
// Use process.cwd() to get the project root, which works regardless of where the code is compiled
const staticPath = join(process.cwd(), 'dashboard/dist');

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
	} catch (error) {
		console.error('Failed to load dashboard index.html:', error);
		console.error('Looking for dashboard at:', staticPath);
		return c.text(`Hello Hono! Dashboard files not found at: ${staticPath}`);
	}
});

serve({
  fetch: app.fetch,
  port: 4000,
  hostname: '0.0.0.0' // Listen on all network interfaces, not just localhost
  // hostname: 'localhost' // Listen on all network interfaces, not just localhost
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port} and http://0.0.0.0:${info.port}`)
})
