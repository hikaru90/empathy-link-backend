/**
 * Gemini AI client for chat functionality
 */

import 'dotenv/config';
import { GoogleGenAI as GoogleGenAI_PostHog } from '@posthog/ai';
import { GoogleGenAI as GoogleGenAI_Official } from '@google/genai';
import { PostHog } from 'posthog-node';
import type { HistoryEntry } from './encryption.js';

// Lazy-initialized so env is loaded (e.g. dotenv) before we read POSTHOG_API_KEY
let posthogClient: PostHog | null = null;

function getPosthogClient(): PostHog | null {
	if (posthogClient === null && process.env.POSTHOG_API_KEY) {
		posthogClient = new PostHog(
			process.env.POSTHOG_API_KEY,
			{ host: process.env.POSTHOG_HOST || 'https://eu.i.posthog.com' }
		);
	}
	return posthogClient;
}

/** Use this in other modules to only add posthog* params when PostHog is enabled. */
export function isPostHogEnabled(): boolean {
	return !!getPosthogClient();
}

// Initialize Gemini AI client
// We use 'any' type here because the two clients have slightly different interfaces (wrapper vs official)
// but we only use common methods like models.generateContent
let aiClient: any | null = null;

function getAiClient(): any {
	if (!aiClient) {
		const apiKey = process.env.GEMINI_API_KEY;
		if (!apiKey) {
			throw new Error('GEMINI_API_KEY environment variable is required');
		}
		
		const phClient = getPosthogClient();
		if (phClient) {
			console.log('Initializing Gemini with PostHog analytics');
			aiClient = new GoogleGenAI_PostHog({
				apiKey,
				posthog: phClient
			});
		} else {
			console.warn('PostHog API key not found, initializing Gemini without analytics');
			// Use the official client directly to avoid bugs in the wrapper when PostHog is missing
			aiClient = new GoogleGenAI_Official({ apiKey });
		}
	}
	return aiClient;
}

// Export the client for use in other modules
export { getAiClient };

// Path Switching Analysis Types
export type PathSwitchAnalysis = {
	shouldSwitch: boolean;
	confidence: number;
	suggestedPath: string | null;
	reason: string;
	currentPathComplete: boolean;
};

/**
 * Convert database history to Gemini format with sliding window
 * Filters out path markers and keeps only recent conversational messages
 */
export function convertHistoryToGemini(dbHistory: HistoryEntry[], maxMessages: number = 20) {
	const filtered = dbHistory
		// Filter out path markers and other non-conversational entries
		.filter(entry =>
			!entry.pathMarker &&
			!entry.hidden &&
			entry.role &&
			entry.parts &&
			entry.parts[0]?.text &&
			entry.parts[0].text.trim() !== ''
		)
		// Convert to Gemini format
		.map(entry => ({
			role: entry.role,
			parts: entry.parts
		}));

	// Implement sliding window: keep only the most recent messages
	if (filtered.length <= maxMessages) {
		// Ensure first message is from user (Gemini requirement)
		if (filtered.length > 0 && filtered[0].role !== 'user') {
			const firstUserIndex = filtered.findIndex(msg => msg.role === 'user');
			if (firstUserIndex > 0) {
				return filtered.slice(firstUserIndex);
			}
		}
		return filtered;
	}

	const recentMessages = filtered.slice(-maxMessages);

	// Ensure first message is from user (Gemini requirement)
	if (recentMessages.length > 0 && recentMessages[0].role !== 'user') {
		const firstUserIndex = recentMessages.findIndex(msg => msg.role === 'user');
		if (firstUserIndex > 0) {
			return recentMessages.slice(firstUserIndex);
		}
	}

	return recentMessages;
}

import { trackTokenUsage } from './token-usage.js';

export async function getAiResponse(
	message: string,
	history: HistoryEntry[],
	systemInstruction: string,
	userId?: string,
	chatId?: string
): Promise<string> {
	try {
		const ai = getAiClient();
		const modelName = 'gemini-2.5-flash';

		// Convert history to Gemini format
		const geminiHistory = convertHistoryToGemini(history);

		console.log('Sending to Gemini:', {
			messageLength: message.length,
			historyLength: geminiHistory.length,
			systemInstructionLength: systemInstruction.length
		});

		// Create contents array from history and new message
		const contents = [
			...geminiHistory,
			{
				role: 'user',
				parts: [{ text: message }]
			}
		];

		const requestOptions: any = {
			model: modelName,
			config: {
				temperature: 0.7,
				topP: 0.95,
				topK: 64,
				maxOutputTokens: 8192,
				systemInstruction
			},
			contents
		};

		// Only add PostHog params if we are using the PostHog-wrapped client
		if (getPosthogClient()) {
			requestOptions.posthogDistinctId = userId;
			requestOptions.posthogTraceId = chatId;
			requestOptions.posthogProperties = { 
				application: 'empathy-link-backend',
				context: 'chat_message'
			};
		}

		// Both clients support models.generateContent, but PostHog wrapper adds extra params
		const result = await ai.models.generateContent(requestOptions);

		// Track token usage
		// Official SDK puts usageMetadata in response directly sometimes, or usageMetadata property
		// Wrapper puts it in response.usageMetadata
		let usage: any;
		if ((result as any).response?.usageMetadata) {
			usage = (result as any).response.usageMetadata;
		} else if ((result as any).usageMetadata) {
			usage = (result as any).usageMetadata;
		}

		if (usage) {
			await trackTokenUsage({
				userId,
				chatId,
				context: 'chat_message',
				model: modelName,
				inputTokens: usage.promptTokenCount || 0,
				outputTokens: usage.candidatesTokenCount || 0,
			});
		}

		const responseText = result.text || '';

		console.log('Gemini response received:', {
			responseLength: responseText.length,
			truncated: responseText.substring(0, 100) + '...'
		});

		return responseText;

	} catch (error) {
		console.error('Error getting AI response:', error);

		// Return a friendly error message
		if (error instanceof Error) {
			if (error.message.includes('API key')) {
				throw new Error('AI service not configured. Please add GEMINI_API_KEY to environment.');
			}
			if (error.message.includes('quota') || error.message.includes('limit')) {
				throw new Error('AI service temporarily unavailable. Please try again in a moment.');
			}
		}

		throw new Error('Failed to get AI response. Please try again.');
	}
}

/**
 * Retry logic for AI responses with exponential backoff
 */
export async function getAiResponseWithRetry(
	message: string,
	history: HistoryEntry[],
	systemInstruction: string,
	maxRetries: number = 3,
	userId?: string,
	chatId?: string
): Promise<string> {
	let lastError: Error | null = null;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			return await getAiResponse(message, history, systemInstruction, userId, chatId);
		} catch (error) {
			lastError = error instanceof Error ? error : new Error('Unknown error');

			console.log(`AI response attempt ${attempt + 1} failed:`, lastError.message);

			// Don't retry on configuration errors
			if (lastError.message.includes('not configured') || lastError.message.includes('API key')) {
				throw lastError;
			}

			// Wait before retry (exponential backoff)
			if (attempt < maxRetries - 1) {
				const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
				console.log(`Waiting ${delay}ms before retry...`);
				await new Promise(resolve => setTimeout(resolve, delay));
			}
		}
	}

	// All retries failed
	throw lastError || new Error('Failed to get AI response after multiple attempts');
}

/**
 * Analyze whether the user wants to switch conversation paths
 */
export async function analyzePathSwitchingIntent(
	message: string,
	currentPath: string,
	recentHistory: Array<{ role: string; content: string }>,
	locale: string = 'de',
	userId?: string
): Promise<PathSwitchAnalysis> {
	console.log('::analyzePathSwitchingIntent - Received currentPath:', currentPath);
	console.log('::analyzePathSwitchingIntent - User message:', message);
	try {
		const ai = getAiClient();

		const systemPrompt = `Du bist ein Experte für Gesprächsanalyse und Gewaltfreie Kommunikation. Analysiere, ob der Nutzer zu einem anderen Gesprächspfad wechseln möchte.

Aktueller Pfad: ${currentPath}

WICHTIG: Der aktuelle Pfad ist "${currentPath}". Verwende GENAU diesen Wert in deiner Analyse!

Verfügbare Pfade:
- idle: Gesprächsführung (Meta-Ebene, Richtungsvorschläge, noch kein konkretes Thema)
- self_empathy: Selbst-Empathie (eigene Gefühle und Bedürfnisse verstehen)
- other_empathy: Fremd-Empathie (Empathie für andere Personen entwickeln)
- action_planning: Handlungsplanung (konkrete Schritte planen)
- conflict_resolution: Konfliktlösung (Probleme mit anderen lösen)
- teach: GFK lernen (Konzepte erklären, Lernmodule empfehlen)
- memory: Erinnerungen ABRUFEN (gespeicherte Informationen über den Nutzer anzeigen)
- feedback: Gespräch beenden (Feedback sammeln und Gespräch abschließen)

WICHTIG: Achte auf die ABSICHT des Nutzers, nicht nur auf exakte Keywords!

KRITISCHER UNTERSCHIED:
- "merken" / "merke dir" / "vergiss nicht" = Nutzer möchte etwas SPEICHERN → NICHT zu memory wechseln, im aktuellen Pfad bleiben
- "was erinnerst du" / "was weißt du" / "erzähl mir von" = Nutzer möchte Erinnerungen ABRUFEN → zu memory wechseln

FALL A: Nutzer ist im Pfad "idle" (Gesprächsführung):
→ Wechsle SOFORT, wenn der Nutzer ein konkretes Thema oder Ziel äußert:
  - "Selbst-Empathie" / "meine Gefühle" / "wie ich mich fühle" → self_empathy
  - "andere Person" / "jemand anderen" / "Empathie für X" → other_empathy
  - "was tun" / "Handlung" / "Schritte" / "Plan" → action_planning
  - "Konflikt" / "Streit" / "Problem lösen" → conflict_resolution
  - "erklären" / "lernen" / "was ist" / "GFK" / "Bedürfnisse" / "Gefühle" (als Konzept) → teach
  - "was erinnerst du" / "was weißt du über mich" / "erzähl mir von früher" → memory (NUR zum Abrufen!)
  - "beenden" / "fertig" / "Schluss" → feedback
  - "merke dir" / "vergiss nicht" / "merken" → NICHT wechseln, im idle bleiben (Speichern passiert automatisch)

FALL B: Nutzer ist bereits in einem spezifischen Pfad (nicht idle):
→ Wechsle nur, wenn der Nutzer EXPLIZIT ein ANDERES Thema nennt
→ Bleibe im aktuellen Pfad, wenn der Nutzer das aktuelle Thema weiter vertieft

Beispiele:

Aktueller Pfad = idle, Nachricht = "ich würde gerne selbstempathie erhalten"
→ shouldSwitch: true, suggestedPath: "self_empathy", confidence: 95

Aktueller Pfad = idle, Nachricht = "ich habe Stress mit meinem Chef"
→ shouldSwitch: true, suggestedPath: "self_empathy", confidence: 85

Aktueller Pfad = self_empathy, Nachricht = "ich fühle mich traurig"
→ shouldSwitch: false (vertieft das aktuelle Thema)

Aktueller Pfad = self_empathy, Nachricht = "können wir jetzt zur handlungsplanung?"
→ shouldSwitch: true, suggestedPath: "action_planning", confidence: 95

Aktueller Pfad = idle, Nachricht = "kannst du dir merken, dass ich Otter mag?"
→ shouldSwitch: false (Nutzer möchte etwas speichern, nicht abrufen - Speichern passiert automatisch im Hintergrund)

Aktueller Pfad = idle, Nachricht = "was erinnerst du dich über mich?"
→ shouldSwitch: true, suggestedPath: "memory", confidence: 95 (Nutzer möchte Erinnerungen abrufen)

Aktueller Pfad = idle, Nachricht = "erklär mir bitte was Bedürfnisse in der GFK sind"
→ shouldSwitch: true, suggestedPath: "teach", confidence: 95

Antworte ausschließlich mit einem JSON-Objekt:
{
  "shouldSwitch": boolean,
  "confidence": 0-100,
  "suggestedPath": "path_id oder null",
  "reason": "kurze Erklärung der Analyse",
  "currentPathComplete": boolean
}`;

		// Include recent context for better analysis
		const contextMessage = `AKTUELLER PFAD: ${currentPath}

Aktuelle Nachricht des Nutzers: "${message}"

Letzter Gesprächsverlauf:
${recentHistory.slice(-4).map(h => `${h.role}: ${h.content}`).join('\n')}

Analysiere diese Nachricht und bestimme, ob der Nutzer vom aktuellen Pfad "${currentPath}" zu einem anderen Pfad wechseln möchte.`;

		const requestOptions: any = {
			model: 'gemini-2.5-flash',
			config: {
				temperature: 0.1,
				systemInstruction: systemPrompt
			},
			contents: [{ role: 'user', parts: [{ text: contextMessage }] }]
		};

		if (getPosthogClient()) {
			requestOptions.posthogProperties = { 
				context: 'path_switching',
				currentPath
			};
			if (userId) requestOptions.posthogDistinctId = userId;
		}

		// @ts-ignore
		const result = await ai.models.generateContent(requestOptions);

		// Track token usage
		let usage: any;
		if ((result as any).response?.usageMetadata) {
			usage = (result as any).response.usageMetadata;
		} else if ((result as any).usageMetadata) {
			usage = (result as any).usageMetadata;
		}

		if (usage) {
			await trackTokenUsage({
				context: 'path_switching',
				model: 'gemini-2.5-flash',
				inputTokens: usage.promptTokenCount || 0,
				outputTokens: usage.candidatesTokenCount || 0,
			});
		}

		const responseText = result.text || '{}';

		// Clean the response text
		let cleanedResponseText = responseText.trim();
		if (cleanedResponseText.startsWith('```json')) {
			cleanedResponseText = cleanedResponseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
		} else if (cleanedResponseText.startsWith('```')) {
			cleanedResponseText = cleanedResponseText.replace(/^```\s*/, '').replace(/\s*```$/, '');
		}

		const analysis = JSON.parse(cleanedResponseText) as PathSwitchAnalysis;
		console.log('🔍 Path switching analysis result:');
		console.log('   Current path (from parameter):', currentPath);
		console.log('   Should switch:', analysis.shouldSwitch);
		console.log('   Confidence:', analysis.confidence);
		console.log('   Suggested path:', analysis.suggestedPath);
		console.log('   Reason:', analysis.reason);
		console.log('   Current path complete:', analysis.currentPathComplete);

		return analysis;

	} catch (error) {
		console.error('Error in path switching analysis:', error);
		return {
			shouldSwitch: false,
			confidence: 0,
			suggestedPath: null,
			reason: 'Analysis error',
			currentPathComplete: false
		};
	}
}

/** Safety classification result - ONLY severity, never message content */
export type SafetySeverity = 'none' | 'moderate' | 'severe';

/**
 * AI-based safety classification. Returns severity only - never stores or logs message content.
 * Use this instead of keyword lists to detect mental health crisis, self-harm, or suicidal ideation.
 */
export async function classifySafetyRisk(message: string, userId?: string): Promise<SafetySeverity> {
	try {
		const ai = getAiClient();

		const systemPrompt = `Du bist ein Experte für psychische Gesundheit und Krisenerkennung. Deine Aufgabe: Beurteile EINZIG die Schwere von Hinweisen auf psychische Instabilität, Selbstverletzung oder Suizidalität in einer Nutzernachricht.

WICHTIG: Du speicherst oder loggst NIEMALS den Nachrichteninhalt. Du gibst NUR einen von drei Werten zurück.

Schweregrade:
- "none": Keine Hinweise auf Krise, Selbstverletzung oder Suizidalität. Normale emotionale Belastung, Traurigkeit oder Stress. AUCH: Zwanghafte Verhaltensweisen wie "Skin Picking" (Dermatillomanie), "Pickel ausdrücken", "Nägelkauen" fallen unter "none", solange keine Suizidabsicht oder schwere körperliche Gefahr besteht.
- "moderate": Deutliche Anzeichen von Hoffnungslosigkeit, schwerer Verzweiflung, oder vage Andeutungen, die auf Krise hindeuten könnten. Noch keine klare Absicht.
- "severe": Klare Hinweise auf LEBENSBEDROHLICHE Selbstverletzung, Suizidgedanken, konkrete Pläne oder unmittelbare Krise. Nutzer äußert explizit oder implizit den Wunsch, sich das Leben zu nehmen oder sich schwer zu verletzen (z.B. "Ritzen", "Schneiden" als Ausdruck von Suizidalität).

WICHTIGE ABGRENZUNG:
- Zwanghaftes Hautzupfen/Knibbeln (Skin Picking) ist KEINE Suizidalität → "none".
- Selbstverletzendes Verhalten mit Suizidabsicht → "severe".

Beispiele (nur zur Orientierung, nicht exhaustive):
- "Ich bin traurig" → none
- "Ich kann nicht aufhören an meiner Haut zu zupfen (Skin Picking)" → none
- "Ich habe meine Pickel aufgekratzt bis es blutet" → none
- "Ich fühle mich hoffnungslos" → moderate
- "Ich will nicht mehr" / "Es hat keinen Sinn" → moderate
- "Ich denke daran, mir etwas anzutun" → severe
- "Ich will mich umbringen" / "Suizid" / "sich ritzen" → severe

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, sonst nichts:
{"severity":"none"|"moderate"|"severe"}`;

		const requestOptions: any = {
			model: 'gemini-2.5-flash',
			config: {
				temperature: 0.1,
				systemInstruction: systemPrompt
			},
			contents: [{ role: 'user', parts: [{ text: `Nachricht zur Bewertung:\n${message}` }] }]
		};

		if (getPosthogClient()) {
			requestOptions.posthogProperties = {
				context: 'safety_check'
			};
			if (userId) requestOptions.posthogDistinctId = userId;
		}

		// @ts-ignore
		const result = await ai.models.generateContent(requestOptions);
		
		// Track token usage
		let usage: any;
		if ((result as any).response?.usageMetadata) {
			usage = (result as any).response.usageMetadata;
		} else if ((result as any).usageMetadata) {
			usage = (result as any).usageMetadata;
		}

		if (usage) {
			await trackTokenUsage({
				context: 'safety_check',
				model: 'gemini-2.5-flash',
				inputTokens: usage.promptTokenCount || 0,
				outputTokens: usage.candidatesTokenCount || 0,
			});
		}

		const responseText = result.text || '{"severity":"none"}';

		let cleaned = responseText.trim();
		if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
		else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');

		const parsed = JSON.parse(cleaned) as { severity?: string };
		const severity = parsed?.severity;
		if (severity === 'severe' || severity === 'moderate') {
			return severity;
		}
		return 'none';
	} catch (error) {
		console.error('Safety classification error (no content logged):', (error as Error).message);
		return 'none'; // Fail open - do not restrict on AI failure
	}
}
