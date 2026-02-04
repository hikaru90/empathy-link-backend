/**
 * AI-powered analysis and memory extraction tools
 * Adapted from empathy-link to use PostgreSQL instead of PocketBase
 */

import { GoogleGenAI, Type } from '@google/genai';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import {
	analyses as analysesTable,
	chats as chatsTable,
	feelings as feelingsTable,
	needs as needsTable,
	user as userTable
} from '../../drizzle/schema.js';
import { decryptChatHistory, type HistoryEntry } from './encryption.js';
import { getExpiryDate, classifyMemoryType } from './memory.js';
import { searchNVCKnowledge, type NVCKnowledgeEntry } from './nvc-knowledge.js';

const db = drizzle(process.env.DATABASE_URL!);

// Initialize Gemini AI client
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
	if (!aiClient) {
		const apiKey = process.env.GEMINI_API_KEY;
		if (!apiKey) {
			throw new Error('GEMINI_API_KEY environment variable is required');
		}
		aiClient = new GoogleGenAI({ apiKey });
	}
	return aiClient;
}

// Type definitions for analysis response
export interface AnalysisResponse {
	emotionalShift: string;
	iStatementMuscle: number;
	clarityOfAsk: string;
	empathyAttempt: boolean;
	feelingVocabulary: number;
	dailyWin: string;
	title: string;
	observation: string;
	feelings: string[];
	needs: string[];
	request: string;
}

// Type definitions for memory extraction
export interface MemoryExtraction {
	aspectType: 'identity' | 'emotion' | 'relationship' | 'value';
	key: string;
	value: string;
	confidence: 'speculative' | 'likely' | 'certain';
	personName?: string | null;
}

// Type definitions for NVC component extraction from individual messages
export interface NVCMessageExtraction {
	observation: string | null;
	feelings: string[];
	needs: string[];
	request: string | null;
}

/**
 * Flexible matching function for feelings/needs validation
 * Handles cases where AI splits comma-separated entries (e.g., "Würdigung, Wertschätzung" -> ["Würdigung", "Wertschätzung"])
 */
function findFlexibleMatch(
	extracted: string,
	records: Array<{ nameDE: string }>
): { nameDE: string } | undefined {
	const extractedLower = extracted.toLowerCase().trim();
	
	// 1. Try exact match first
	let match = records.find(r => r.nameDE.toLowerCase() === extractedLower);
	if (match) return match;
	
	// 2. Try matching if database entry contains the extracted value (or vice versa)
	// This handles cases like: DB has "Wertschätzung, Würdigung", extracted is "Würdigung"
	match = records.find(r => {
		const dbNameLower = r.nameDE.toLowerCase();
		// Check if DB entry contains extracted value or extracted contains DB entry
		return dbNameLower.includes(extractedLower) || extractedLower.includes(dbNameLower);
	});
	if (match) return match;
	
	// 3. Handle comma-separated values: split DB entries and check if any part matches
	// This handles cases where DB has "Wertschätzung, Würdigung" and we extract "Würdigung"
	match = records.find(r => {
		const dbParts = r.nameDE.toLowerCase().split(',').map(p => p.trim());
		return dbParts.includes(extractedLower);
	});
	if (match) return match;
	
	return undefined;
}

/**
 * Extract NVC components (observation, feelings, needs, request) from a single user message
 * Uses low-cost gemini-2.5-flash model and validates against database
 */
export async function extractNVCFromMessage(
	message: string,
	locale: string = 'de'
): Promise<NVCMessageExtraction> {
	console.log('🔍 Extracting NVC components from message:', message.substring(0, 50) + '...');

	try {
		const ai = getAiClient();

		// Fetch feelings and needs lists from database for validation
		const feelingsRecords = await db.select().from(feelingsTable);
		const needsRecords = await db.select().from(needsTable);

		// Convert to German names for the prompt
		const feelingsList = feelingsRecords
			.map((f) => f.nameDE)
			.filter(Boolean)
			.join(', ');
		const needsList = needsRecords
			.map((n) => n.nameDE)
			.filter(Boolean)
			.join(', ');

		// Create response schema for NVC extraction
		const responseSchema = {
			type: Type.OBJECT,
			properties: {
				observation: {
					type: Type.STRING,
					description: 'ONLY extract if user explicitly stated a factual observation without evaluation. Leave EMPTY if not explicitly named. Must be NVC-compliant: factual, without judgment or interpretation.'
				},
				feelings: {
					type: Type.ARRAY,
					items: { type: Type.STRING },
					description: `ONLY extract feelings explicitly named by the user from this list: ${feelingsList}. Return EMPTY array if no feelings were explicitly stated. Do NOT guess or infer. Feelings must match NVC definition: emotions that arise from needs being met or unmet.`
				},
				needs: {
					type: Type.ARRAY,
					items: { type: Type.STRING },
					description: `ONLY extract needs explicitly named by the user from this list: ${needsList}. Return EMPTY array if no needs were explicitly stated. Do NOT guess or infer. Needs must match NVC definition: universal human needs (not strategies or wants).`
				},
				request: {
					type: Type.STRING,
					description: 'ONLY extract if user explicitly formulated a request (actionable, specific). Leave EMPTY if no explicit request was stated. Must be NVC-compliant: clear, doable, without demand.'
				}
			},
			required: ['observation', 'feelings', 'needs', 'request']
		};

		// Create system instruction
		const systemInstruction = `Du bist ein Experte für Gewaltfreie Kommunikation (GFK) und analysierst einzelne Nachrichten, um NVC-Komponenten zu extrahieren.

**GFK-DEFINITIONEN:**

**Beobachtung (Observation):**
- Sachliche Beschreibung ohne Bewertung, Interpretation oder Urteil
- Beispiel: "Du hast gestern Abend nicht auf meine Nachricht geantwortet" (Beobachtung)
- NICHT: "Du ignorierst mich" (Bewertung)

**Gefühle (Feelings):**
- Emotionen, die aus erfüllten oder unerfüllten Bedürfnisse entstehen
- MÜSSEN aus dieser Liste stammen: ${feelingsList}
- Beispiel: "traurig", "frustriert", "erfreut", "ängstlich"
- NICHT: "betrogen gefühlt" (ist eine Bewertung, kein Gefühl)

**Bedürfnisse (Needs):**
- Universelle menschliche Bedürfnisse (nicht Strategien oder Wünsche)
- MÜSSEN aus dieser Liste stammen: ${needsList}
- Beispiel: "Verbindung", "Verständnis", "Autonomie", "Respekt"
- NICHT: "dass du mir zuhörst" (ist eine Strategie, kein Bedürfnis)

**Bitte (Request):**
- Konkrete, umsetzbare Bitte ohne Forderung
- Beispiel: "Könntest du mir heute Abend zuhören?"
- NICHT: "Du musst mir zuhören" (ist eine Forderung)

**WICHTIGE REGELN:**
- Extrahiere NUR explizit genannte Komponenten
- Errate oder interpretiere NICHT
- Wenn etwas nicht explizit genannt wurde, lasse das Feld leer oder gib ein leeres Array zurück
- Validiere Gefühle und Bedürfnisse gegen die gegebenen Listen
- Wenn ein Gefühl oder Bedürfnis nicht in der Liste ist, extrahiere es NICHT

Analysiere diese Nachricht und extrahiere nur die NVC-Komponenten, die der Nutzer EXPLIZIT genannt hat.`;

		// Use low-cost gemini-2.5-flash model
		const chat_session = ai.chats.create({
			model: 'gemini-2.5-flash-lite',
			config: {
				temperature: 0.2, // Lower temperature for more consistent extraction
				maxOutputTokens: 1024,
				responseMimeType: 'application/json',
				responseSchema,
				systemInstruction
			}
		});

		const result = await chat_session.sendMessage({
			message: `Analysiere diese Nachricht und extrahiere NVC-Komponenten:\n\n"${message}"`
		});

		// Parse response
		let extraction: NVCMessageExtraction;
		try {
			const responseText = result.text || '{}';
			const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
			const parsed = JSON.parse(cleanedText);

			// Validate feelings against database
			const validFeelings: string[] = [];
			if (Array.isArray(parsed.feelings)) {
				for (const feeling of parsed.feelings) {
					const matchedFeeling = findFlexibleMatch(feeling, feelingsRecords);
					if (matchedFeeling) {
						validFeelings.push(matchedFeeling.nameDE);
					} else {
						console.warn(`⚠️ Invalid feeling extracted: "${feeling}" - not in database`);
					}
				}
			}

			// Validate needs against database
			const validNeeds: string[] = [];
			if (Array.isArray(parsed.needs)) {
				for (const need of parsed.needs) {
					const matchedNeed = findFlexibleMatch(need, needsRecords);
					if (matchedNeed) {
						validNeeds.push(matchedNeed.nameDE);
					} else {
						console.warn(`⚠️ Invalid need extracted: "${need}" - not in database`);
					}
				}
			}

			extraction = {
				observation: parsed.observation && parsed.observation.trim() ? parsed.observation.trim() : null,
				feelings: validFeelings,
				needs: validNeeds,
				request: parsed.request && parsed.request.trim() ? parsed.request.trim() : null
			};

			console.log('✅ NVC extraction result:', {
				hasObservation: !!extraction.observation,
				feelingsCount: extraction.feelings.length,
				needsCount: extraction.needs.length,
				hasRequest: !!extraction.request
			});

		} catch (parseError) {
			console.error('Failed to parse NVC extraction response:', parseError);
			// Return empty extraction on error
			return {
				observation: null,
				feelings: [],
				needs: [],
				request: null
			};
		}

		return extraction;

	} catch (error) {
		console.error('❌ Error extracting NVC components:', error);
		// Return empty extraction on error
		return {
			observation: null,
			feelings: [],
			needs: [],
			request: null
		};
	}
}

/**
 * Analyze a chat conversation using AI
 * Extracts emotional patterns, NVC components, and provides insights
 */
export async function analyzeChat(
	chatId: string,
	userId: string,
	locale: string = 'de'
): Promise<{ id: string; analysis: AnalysisResponse }> {
	console.log('🔍 Starting chat analysis for chat:', chatId, 'user:', userId);

	try {
		const ai = getAiClient();

		// 1. Fetch the chat history from database
		const chatRecords = await db
			.select()
			.from(chatsTable)
			.where(and(eq(chatsTable.id, chatId), eq(chatsTable.userId, userId)))
			.limit(1);

		if (chatRecords.length === 0) {
			throw new Error('Chat not found');
		}

		const chat = chatRecords[0];

		// 2. Decrypt chat history
		const historyJson = chat.history;
		if (!historyJson) {
			throw new Error('Chat has no history');
		}

		const encryptedHistory = JSON.parse(historyJson) as HistoryEntry[];
		const history = decryptChatHistory(encryptedHistory);

		// 3. Fetch feelings and needs lists from database
		const feelingsRecords = await db.select().from(feelingsTable);
		const needsRecords = await db.select().from(needsTable);

		// Convert to German names for the prompt
		const feelingsList = feelingsRecords
			.map((f) => f.nameDE)
			.filter(Boolean)
			.join(', ');
		const needsList = needsRecords
			.map((n) => n.nameDE)
			.filter(Boolean)
			.join(', ');

		// 4. Filter messages (exclude path markers and hidden messages)
		const filteredHistory = history
			.filter((entry) => !entry.pathMarker && !entry.hidden)
			.map((entry) => `${entry.role === 'user' ? 'User' : 'Model'}: ${entry.parts[0]?.text || ''}`)
			.join('\n\n');

		// 5. Create structured response schema for Gemini
		const responseSchema = {
			type: Type.OBJECT,
			properties: {
				emotionalShift: {
					type: Type.STRING,
					description: 'Brief description of emotional journey (max 100 words)'
				},
				iStatementMuscle: {
					type: Type.NUMBER,
					description: 'Percentage of I-statements vs You-statements (0-100)'
				},
				clarityOfAsk: {
					type: Type.STRING,
					enum: ['Unspezifisch', 'Vage', 'Spezifisch & Umsetzbar'],
					description: 'Clarity of user requests'
				},
				empathyAttempt: {
					type: Type.BOOLEAN,
					description: 'Whether user tried to understand other perspective'
				},
				feelingVocabulary: {
					type: Type.NUMBER,
					description: 'Count of distinct feeling words used'
				},
				dailyWin: {
					type: Type.STRING,
					description: 'Encouraging statement for the user (max 50 words)'
				},
				title: {
					type: Type.STRING,
					description: 'Session title (max 10 words)'
				},
				observation: {
					type: Type.STRING,
					description: 'ONLY extract if user explicitly stated an observation. Leave EMPTY if not explicitly named. NVC-compliant factual observation (max 150 words)'
				},
				feelings: {
					type: Type.ARRAY,
					items: { type: Type.STRING },
					description: 'ONLY extract feelings explicitly named by the user from the provided list. Return EMPTY array if no feelings were explicitly stated. Do NOT guess or infer.'
				},
				needs: {
					type: Type.ARRAY,
					items: { type: Type.STRING },
					description: 'ONLY extract needs explicitly named by the user from the provided list. Return EMPTY array if no needs were explicitly stated. Do NOT guess or infer.'
				},
				request: {
					type: Type.STRING,
					description: 'ONLY extract if user explicitly formulated a request. Leave EMPTY if no explicit request was stated. Clearest actionable request (max 100 words)'
				}
			},
			required: [
				'emotionalShift',
				'iStatementMuscle',
				'clarityOfAsk',
				'empathyAttempt',
				'feelingVocabulary',
				'dailyWin',
				'title',
				'observation',
				'feelings',
				'needs',
				'request'
			]
		};

		// 6. Create system instruction
		const systemInstruction = `Du bist ein Experte für Gewaltfreie Kommunikation (GFK) und analysierst Gespräche.

Analysiere das folgende Gespräch und extrahiere:
- Emotionale Entwicklung (emotionalShift)
- Verhältnis von Ich- zu Du-Aussagen in % (iStatementMuscle)
- Klarheit der Bitten (clarityOfAsk): "Unspezifisch", "Vage", oder "Spezifisch & Umsetzbar"
- Empathie-Versuch (empathyAttempt): Hat die Person versucht, die Perspektive des anderen zu verstehen?
- Anzahl verschiedener Gefühlswörter (feelingVocabulary)
- Ermutigende Aussage (dailyWin): Kurze positive Rückmeldung
- Titel der Sitzung (title): Kurze Zusammenfassung

WICHTIG - Nur explizit genannte Elemente extrahieren:
- Beobachtung (observation): NUR extrahieren, wenn der Nutzer explizit eine Beobachtung formuliert hat (z.B. "Ich beobachte, dass...", "Was passiert ist..."). Falls keine explizite Beobachtung genannt wurde, lasse dieses Feld LEER.
- Gefühle (feelings): NUR Gefühlswörter extrahieren, die der Nutzer EXPLIZIT verwendet oder benannt hat (aus dieser Liste: ${feelingsList}). Errate oder schließe KEINE Gefühle ab, die nicht direkt im Text genannt wurden. Falls keine Gefühle explizit genannt wurden, gib ein LEERES Array zurück.
- Bedürfnisse (needs): NUR Bedürfnisse extrahieren, die der Nutzer EXPLIZIT genannt hat (aus dieser Liste: ${needsList}). Errate oder schließe KEINE Bedürfnisse ab, die nicht direkt im Text erwähnt wurden. Falls keine Bedürfnisse explizit genannt wurden, gib ein LEERES Array zurück.
- Bitte (request): NUR extrahieren, wenn der Nutzer explizit eine Bitte formuliert hat (z.B. "Ich bitte dich...", "Könntest du...", "Ich wünsche mir..."). Falls keine explizite Bitte genannt wurde, lasse dieses Feld LEER.

KRITISCH: Errate oder interpretiere NICHT. Extrahiere NUR das, was der Nutzer wörtlich gesagt hat. Wenn etwas nicht explizit genannt wurde, lasse das Feld leer oder gib ein leeres Array zurück.

Analysiere in deutscher Sprache und gib die Werte als JSON zurück.`;

		// 7. Send to Gemini with structured output
		console.log('📤 Sending analysis request to Gemini...');

		const chat_session = ai.chats.create({
			model: 'gemini-2.5-flash',
			config: {
				temperature: 0.3,
				maxOutputTokens: 8192,
				responseMimeType: 'application/json',
				responseSchema,
				systemInstruction
			}
		});

		const result = await chat_session.sendMessage({
			message: `Bitte analysiere dieses Gespräch:\n\n${filteredHistory}`
		});

		// 8. Parse response
		let analysisData: AnalysisResponse;
		try {
			const responseText = result.text || '{}';
			// Clean markdown formatting if present
			const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
			analysisData = JSON.parse(cleanedText);
		} catch (parseError) {
			console.error('Failed to parse analysis response:', parseError);
			throw new Error('Failed to parse AI analysis response');
		}

		// Validate feelings and needs against database using flexible matching
		if (Array.isArray(analysisData.feelings)) {
			const validFeelings: string[] = [];
			for (const feeling of analysisData.feelings) {
				const matchedFeeling = findFlexibleMatch(feeling, feelingsRecords);
				if (matchedFeeling) {
					validFeelings.push(matchedFeeling.nameDE);
				} else {
					console.warn(`⚠️ Invalid feeling in analysis: "${feeling}" - not in database`);
				}
			}
			analysisData.feelings = validFeelings;
		}

		if (Array.isArray(analysisData.needs)) {
			const validNeeds: string[] = [];
			for (const need of analysisData.needs) {
				const matchedNeed = findFlexibleMatch(need, needsRecords);
				if (matchedNeed) {
					validNeeds.push(matchedNeed.nameDE);
				} else {
					console.warn(`⚠️ Invalid need in analysis: "${need}" - not in database`);
				}
			}
			analysisData.needs = validNeeds;
		}

		console.log('✅ Analysis complete:', analysisData.title);

		// 9. Save analysis to database
		const analysisRecord = await db
			.insert(analysesTable)
			.values({
				id: crypto.randomUUID(),
				userId,
				chatId,
				title: analysisData.title,
				observation: analysisData.observation,
				feelings: JSON.stringify(analysisData.feelings),
				needs: JSON.stringify(analysisData.needs),
				request: analysisData.request,
				emotionalShift: analysisData.emotionalShift,
				iStatementMuscle: analysisData.iStatementMuscle,
				clarityOfAsk: analysisData.clarityOfAsk,
				empathyAttempt: analysisData.empathyAttempt,
				feelingVocabulary: analysisData.feelingVocabulary,
				dailyWin: analysisData.dailyWin
			})
			.returning();

		// 10. Update chat record to mark as analyzed
		await db
			.update(chatsTable)
			.set({
				analyzed: true,
				analysisId: analysisRecord[0].id,
				updated: new Date().toISOString()
			})
			.where(eq(chatsTable.id, chatId));

		console.log('💾 Analysis saved with ID:', analysisRecord[0].id);

		// 11. Generate and store inspirational quote - SIMPLE VERSION
		console.log('🎯 Starting quote generation for user:', userId);
		console.log('📊 Analysis data:', {
			feelings: analysisData.feelings,
			needs: analysisData.needs,
			title: analysisData.title
		});

		try {
			const ai = getAiClient();

			// Use AI to select the most appropriate quote from the backlog
			const systemInstruction = `Du bist ein Experte für Gewaltfreie Kommunikation und hilfst dabei, das passendste inspirierende Zitat aus einer Liste auszuwählen.

Deine Aufgabe:
- Analysiere die gegebenen Gefühle, Bedürfnisse und Gesprächsthemen der Person
- Wähle das Zitat aus der Liste, das am besten zu ihrer aktuellen Situation passt
- Das Zitat soll besonders relevant für ihre aktuellen Bedürfnisse und Gefühle sein
- WICHTIG: Wähle unterschiedliche Zitate - vermeide es, immer das erste oder dasselbe Zitat zu wählen
- Wähle aus dem VOLLSTÄNDIGEN Bereich von 0 bis ${QUOTE_BACKLOG.length - 1}
- Gib die Nummer des Zitats zurück (0-indexiert)

Antworte mit einem JSON-Objekt im Format: {"quoteIndex": <zahl>} wobei <zahl> zwischen 0 und ${QUOTE_BACKLOG.length - 1} liegt.`;

			// Format quote list for the prompt
			const quotesList = QUOTE_BACKLOG.map((q, idx) => `${idx}. "${q.quote}" (${q.author})`).join('\n');

			const quotePrompt = `Person hat gerade dieses Gespräch gehabt:

Titel: "${analysisData.title}"
Gefühle: ${analysisData.feelings.join(', ')}
Bedürfnisse: ${analysisData.needs.join(', ')}

Verfügbare Zitate:
${quotesList}

Wähle die Nummer des Zitats, das am besten zu dieser Person und ihrer Situation passt.`;

			console.log('📤 Sending quote selection request to Gemini');

			const chat = ai.chats.create({
				model: 'gemini-2.5-flash',
				config: {
					temperature: 0.7, // Higher temperature for more variety in selection
					maxOutputTokens: 500, // Increased to ensure complete JSON response
					systemInstruction,
					responseMimeType: 'application/json',
					responseSchema: {
						type: 'object',
						properties: {
							quoteIndex: {
								type: 'number',
								description: 'The index (0-based) of the selected quote. Must be between 0 and ' + (QUOTE_BACKLOG.length - 1) + '. Choose a variety of quotes, not always the same one.'
							}
						},
						required: ['quoteIndex']
					}
				}
			});

			const result = await chat.sendMessage({ message: quotePrompt });

			console.log('📥 Full AI response object:', JSON.stringify(result, null, 2));
			console.log('📥 Raw AI response text:', result.text);
			console.log('📥 Response type:', typeof result.text);
			console.log('📥 Response candidates:', result.candidates);

			// Parse the JSON response to get quote index
			let quoteIndex = -1;
			try {
				// Try to get text from result.text first, then from candidates
				let responseText = result.text?.trim();
				if (!responseText && result.candidates && result.candidates.length > 0) {
					const candidate = result.candidates[0];
					if (candidate.content?.parts && candidate.content.parts.length > 0) {
						responseText = candidate.content.parts[0].text?.trim();
					}
				}
				
				if (!responseText) {
					throw new Error('Empty response');
				}
				
				console.log('📥 Parsing response text:', responseText);
				
				// Try to parse as JSON directly first
				let parsed;
				if (typeof responseText === 'string') {
					try {
						parsed = JSON.parse(responseText);
					} catch (parseError) {
						// If direct parsing fails, try to extract JSON from the text
						// Look for JSON object pattern { ... }
						const jsonMatch = responseText.match(/\{[\s\S]*\}/);
						if (jsonMatch) {
							console.log('📥 Extracted JSON from text:', jsonMatch[0]);
							parsed = JSON.parse(jsonMatch[0]);
						} else {
							// Try to find a number in the response
							const numberMatch = responseText.match(/\d+/);
							if (numberMatch) {
								const num = parseInt(numberMatch[0], 10);
								if (num >= 0 && num < QUOTE_BACKLOG.length) {
									console.log('📥 Extracted number from text:', num);
									parsed = { quoteIndex: num };
								} else {
									throw new Error('No valid JSON or number found in response');
								}
							} else {
								throw new Error('No valid JSON or number found in response');
							}
						}
					}
				} else {
					parsed = responseText;
				}
				
				console.log('📥 Parsed JSON:', parsed);
				
				quoteIndex = Math.floor(Number(parsed.quoteIndex));
				console.log('📥 Extracted quote index:', quoteIndex);
				
				// Ensure index is within bounds
				if (quoteIndex < 0 || quoteIndex >= QUOTE_BACKLOG.length || isNaN(quoteIndex)) {
					console.warn(`⚠️ Invalid quote index ${quoteIndex}, using random quote`);
					quoteIndex = Math.floor(Math.random() * QUOTE_BACKLOG.length);
				}
			} catch (e) {
				console.error('❌ Failed to parse quote index, using random:', e);
				console.error('❌ Raw response was:', result.text);
				quoteIndex = Math.floor(Math.random() * QUOTE_BACKLOG.length);
			}

			console.log(`✨ Final selected quote index: ${quoteIndex} out of ${QUOTE_BACKLOG.length - 1}`);
			const selectedQuoteData = QUOTE_BACKLOG[quoteIndex];
			console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			console.log('📌 SELECTED QUOTE DETAILS:');
			console.log(`   Index: ${quoteIndex}`);
			console.log(`   Quote: "${selectedQuoteData.quote}"`);
			console.log(`   Author: ${selectedQuoteData.author}`);
			console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

			// Store quote and author as JSON
			const quoteJson = JSON.stringify({
				quote: selectedQuoteData.quote,
				author: selectedQuoteData.author
			});

			console.log('📤 JSON to be written to database:');
			console.log('   ', quoteJson);
			console.log('   Length:', quoteJson.length);
			console.log('   User ID:', userId);

			// Update user table DIRECTLY
			const updateResult = await db
				.update(userTable)
				.set({ inspirationalQuote: quoteJson })
				.where(eq(userTable.id, userId))
				.returning();

			console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			console.log('💾 DATABASE UPDATE RESULT:');
			console.log('   Rows updated:', updateResult.length);
			
			if (updateResult.length > 0) {
				const savedQuote = updateResult[0].inspirationalQuote;
				console.log('   ✅ SUCCESS - Quote saved to database');
				console.log('   Saved value:', savedQuote);
				console.log('   Saved value length:', savedQuote?.length || 0);
				
				// Parse and verify what was saved
				if (savedQuote) {
					try {
						const parsed = JSON.parse(savedQuote);
						console.log('   ✅ Parsed saved quote:', parsed.quote);
						console.log('   ✅ Parsed saved author:', parsed.author);
					} catch (e) {
						console.error('   ⚠️ Saved value is not valid JSON:', e);
					}
				} else {
					console.error('   ⚠️ Saved value is null or undefined');
				}
			} else {
				console.error('   ❌ FAILED - UPDATE RETURNED NO ROWS');
				console.error('   User ID used:', userId);
				
				// Verify user exists
				const userCheck = await db
					.select()
					.from(userTable)
					.where(eq(userTable.id, userId))
					.limit(1);
				console.error('   User exists check:', userCheck.length > 0 ? '✅ User found' : '❌ User NOT found');
				if (userCheck.length > 0) {
					console.error('   Current inspirationalQuote value:', userCheck[0].inspirationalQuote);
				}
			}
			console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		} catch (quoteError) {
			console.error('❌❌❌ QUOTE GENERATION FAILED ❌❌❌');
			console.error('Error type:', quoteError instanceof Error ? quoteError.constructor.name : typeof quoteError);
			console.error('Error message:', quoteError instanceof Error ? quoteError.message : String(quoteError));
			console.error('Error stack:', quoteError instanceof Error ? quoteError.stack : 'No stack trace');
			console.error('Full error object:', quoteError);
			throw quoteError; // Re-throw to see it in analyzeChat logs too
		}

		return {
			id: analysisRecord[0].id,
			analysis: analysisData
		};
	} catch (error) {
		console.error('❌ Error in analyzeChat:', error);
		throw error;
	}
}

// Predefined quote backlog for inspirational quotes
const QUOTE_BACKLOG = [
	{"quote": "Der Kern aller Wut ist ein Bedürfnis, das nicht erfüllt wird.", "author": "Marshall B. Rosenberg"},
	{"quote": "Menschen heilen von ihrem Schmerz, wenn sie eine authentische Verbindung zu einem anderen Menschen haben.", "author": "Marshall B. Rosenberg"},
	{"quote": "Deine Präsenz ist das wertvollste Geschenk, das du einem anderen machen kannst.", "author": "Marshall B. Rosenberg"},
	{"quote": "Worte können Fenster sein oder Mauern.", "author": "Marshall B. Rosenberg"},
	{"quote": "Wenn wir unsere Bedürfnisse aussprechen, steigt die Chance, dass unsere Bitten erfüllt werden.", "author": "Marshall B. Rosenberg"},
	{"quote": "Es gibt einen Ort jenseits von richtig und falsch. Dort begegnen wir uns.", "author": "Rumi (häufig im GFK-Kontext zitiert)"},
	{"quote": "Freiheit ist die Fähigkeit, eine Pause zu machen zwischen Auslöser und Reaktion.", "author": "Viktor E. Frankl (oft in GFK-Seminaren zitiert)"},
	{"quote": "Intellektuelles Verständnis blockiert Empathie.", "author": "Marshall B. Rosenberg"},
	{"quote": "Mit unerfüllten Bedürfnissen in Kontakt zu kommen, ist wichtig für den Heilungsprozess.", "author": "Marshall B. Rosenberg"},
	{"quote": "Wenn wir den Menschen unsere Bedürfnisse nicht mitteilen, ist es viel unwahrscheinlicher, dass sie erfüllt werden.", "author": "Marshall B. Rosenberg"},
	{"quote": "Willst du Recht haben oder glücklich sein? Beides geht nicht.", "author": "Marshall B. Rosenberg"},
	{"quote": "Es sind nie die Tatsachen, die uns beunruhigen, es sind immer unsere eigenen Bewertungen.", "author": "Marshall B. Rosenberg"},
	{"quote": "Gefühle entstehen aus Bedürfnissen – nicht aus dem Verhalten anderer.", "author": "Marshall B. Rosenberg"},
	{"quote": "Wenn wir in Empathie hören, können wir die wahre Botschaft hinter Worten entdecken.", "author": "Marshall B. Rosenberg"},
	{"quote": "Bitte ist das, was Verbindung schafft; Forderung schafft Reaktion.", "author": "GFK-Grundsatz"},
	{"quote": "Kritik offenbart ein unerfülltes Bedürfnis – nicht die Wahrheit über den anderen.", "author": "GFK-Lehrsatz"},
	{"quote": "Es gibt kein ‚falsch‘ in den Gefühlen – nur Hinweise darauf, welche Bedürfnisse berührt sind.", "author": "GFK-Perspektive"},
	{"quote": "Empathische Präsenz bedeutet: nicht zu urteilen, sondern zu erforschen, was im anderen lebendig ist.", "author": "Marshall B. Rosenberg"},
	{"quote": "Wenn du hörst, ohne zu bewerten, förderst du Verbindung.", "author": "GFK-Leitgedanke"},
	{"quote": "Verbinde dich zuerst mit dem Bedürfnis, dann mit der Strategie.", "author": "GFK-Leitgedanke"},
	{"quote": "Höre auf das Bedürfnis hinter der Forderung – dort liegt die Brücke zur Verbindung.", "author": "GFK-Grundgedanke"},
	{"quote": "Bitte formuliere Bitten klar, damit andere wissen, worum du bittest – nicht als Vorwurf.", "author": "GFK-Praxisregel"},
	{"quote": "Gewaltfreie Kommunikation beginnt mit Selbstempathie.", "author": "Marshall B. Rosenberg"},
	{"quote": "Ein ‚Nein‘ kann ehrlicher sein als ein ‚Ja‘, das aus falscher Höflichkeit entsteht.", "author": "GFK-Prinzip"},
	{"quote": "Die Beobachtung ohne Bewertung ist das stärkste Mittel gegen Schuldgefühle.", "author": "GFK-Praxis"},
	{"quote": "Empathie ist keine Technik, sondern eine Haltung des Herzens.", "author": "Marshall B. Rosenberg"},
	{"quote": "Dankbarkeit ist die Zutat, die Verbindung nährt.", "author": "GFK-Praxis"},
	{"quote": "Wut sagt: ‚Ich habe einen unerfüllten Wunsch – hilf mir, ihn sichtbar zu machen.‘", "author": "GFK-Interpretation"},
	{"quote": "Wenn wir urteilen, trennen wir; wenn wir fühlen und brauchen, verbinden wir.", "author": "Marshall B. Rosenberg"},
	{"quote": "Konflikte sind Chancen, unsere Bedürfnisse klarer zu sehen.", "author": "Marshall B. Rosenberg"},
	{"quote": "Es ist mutig, die eigenen Bedürfnisse laut auszusprechen.", "author": "GFK-Trainer*innen-Zitat"},
	{"quote": "Frage nach Bedürfnissen, bevor du nach Lösungen springst.", "author": "GFK-Empfehlung"},
	{"quote": "Wenn du jemandem empathisch zuhörst, gibst du ihm Raum, sich selbst zu erkennen.", "author": "GFK-Trainer*innen-Zitat"},
	{"quote": "Bitten ohne Druck öffnen Türen; Druck schließt sie.", "author": "GFK-Praxis"},
	{"quote": "Worte, die verbinden, sind so präzise wie möglich und so freundlich wie möglich.", "author": "GFK-Leitsatz"},
	{"quote": "Manchmal ist schweigendes Zuhören das tiefste Geschenk.", "author": "GFK-Trainer*innen-Zitat"},
	{"quote": "Achte auf die Bedürfnisse, nicht auf die Strategie – sonst löst du den Konflikt nicht nachhaltig.", "author": "GFK-Tipp"},
	{"quote": "Selbstmitgefühl ist die Grundlage, andere mitfühlend zu begegnen.", "author": "Marshall B. Rosenberg"},
	{"quote": "Eine Bitte ist erfolgreich, wenn beide Parteien lebensbejahende Bedürfnisse berücksichtigen.", "author": "GFK-Praxis"},
	{"quote": "Wenn wir urteilen, hören wir auf zu verstehen.", "author": "Marshall B. Rosenberg"},
	{"quote": "Konflikte verwandeln sich, wenn wir Gefühle und Bedürfnisse sprechen lassen statt Vorwürfe.", "author": "Marshall B. Rosenberg"},
	{"quote": "Erkenne erst die Bedürfnisse – dann entstehen kreative Lösungen.", "author": "GFK-Praxis"},
	{"quote": "Höre auf die Sehnsucht hinter den Worten und du findest Verbindung.", "author": "GFK-Trainer*innen-Zitat"},
	{"quote": "GFK heißt nicht, immer nett zu sein – es heißt ehrlich und verbindend zu sein.", "author": "Marshall B. Rosenberg"},
	{"quote": "Empathie für andere beginnt mit Klarheit über das eigene Erleben.", "author": "GFK-Prinzip"},
	{"quote": "Übung macht empathisch: Anfangs schwer, später befreiend.", "author": "GFK-Trainer*innen-Zitat"},
	{"quote": "Die Bereitschaft, verwundbar zu sein, schafft Vertrauen.", "author": "Marshall B. Rosenberg"},
	{"quote": "Beobachte ohne zu bewerten, fühle ohne zu verurteilen, bitte ohne zu fordern.", "author": "GFK-Kurzform"},
	{"quote": "Hinter jedem ‚Du hast…‘ steckt ein ‚Ich brauche…‘, wenn wir genau hinschauen.", "author": "GFK-Grundgedanke"},
	{"quote": "Verbundenheit wächst, wenn wir mitfühlend unsere Wünsche teilen und die des anderen hören.", "author": "GFK-Leitgedanke"}
];

/**
 * Generate and store inspirational quote based on user's recent stats
 * Now selects from predefined quote backlog using AI
 */
async function generateAndStoreInspirationalQuote(
	userId: string,
	currentAnalysis?: AnalysisResponse
): Promise<void> {
	console.log('✨ Selecting inspirational quote for user:', userId);

	try {
		const ai = getAiClient();

		// Use current analysis if provided, otherwise fetch from database
		let allFeelings: string[] = [];
		let allNeeds: string[] = [];
		let allTitles: string[] = [];

		// If we have the current analysis, start with that
		if (currentAnalysis) {
			console.log('📊 Using current analysis data for quote selection');
			allFeelings = Array.isArray(currentAnalysis.feelings) ? [...currentAnalysis.feelings] : [];
			allNeeds = Array.isArray(currentAnalysis.needs) ? [...currentAnalysis.needs] : [];
			if (currentAnalysis.title) {
				allTitles.push(currentAnalysis.title);
			}
		}

		// Also fetch recent analyses from the last week to enrich the context
		const sevenDaysAgo = new Date();
		sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
		const sevenDaysAgoISO = sevenDaysAgo.toISOString();

		const recentAnalyses = await db
			.select()
			.from(analysesTable)
			.where(
				and(
					eq(analysesTable.userId, userId),
					gte(analysesTable.created, sevenDaysAgoISO)
				)
			)
			.orderBy(desc(analysesTable.created))
			.limit(5); // Limit to last 5 analyses

		console.log(`📚 Found ${recentAnalyses.length} recent analyses to include`);

		// Aggregate data from recent analyses
		recentAnalyses.forEach(analysis => {
			// Parse feelings
			try {
				if (analysis.feelings) {
					const feelings = JSON.parse(analysis.feelings);
					if (Array.isArray(feelings)) {
						allFeelings.push(...feelings);
					}
				}
			} catch (e) {
				// Skip invalid JSON
			}

			// Parse needs
			try {
				if (analysis.needs) {
					const needs = JSON.parse(analysis.needs);
					if (Array.isArray(needs)) {
						allNeeds.push(...needs);
					}
				}
			} catch (e) {
				// Skip invalid JSON
			}

			// Collect titles
			if (analysis.title) {
				allTitles.push(analysis.title);
			}
		});

		// Count frequency of feelings and needs
		const feelingCounts = allFeelings.reduce((acc, feeling) => {
			acc[feeling] = (acc[feeling] || 0) + 1;
			return acc;
		}, {} as Record<string, number>);

		const needCounts = allNeeds.reduce((acc, need) => {
			acc[need] = (acc[need] || 0) + 1;
			return acc;
		}, {} as Record<string, number>);

		// Get top 3 most prevalent feelings and needs
		const topFeelings = Object.entries(feelingCounts)
			.sort(([, a], [, b]) => b - a)
			.slice(0, 3)
			.map(([feeling]) => feeling);

		const topNeeds = Object.entries(needCounts)
			.sort(([, a], [, b]) => b - a)
			.slice(0, 3)
			.map(([need]) => need);

		console.log('📊 Data for quote selection:');
		console.log('   Top feelings:', topFeelings);
		console.log('   Top needs:', topNeeds);
		console.log('   Recent themes:', allTitles.slice(0, 3));

		// If no data, randomly select a quote
		if (allFeelings.length === 0 && allNeeds.length === 0 && allTitles.length === 0) {
			console.log('📭 No analysis data available, selecting random quote');
			const randomQuote = QUOTE_BACKLOG[Math.floor(Math.random() * QUOTE_BACKLOG.length)];
			const quoteJson = JSON.stringify({
				quote: randomQuote.quote,
				author: randomQuote.author
			});
			await db
				.update(userTable)
				.set({ inspirationalQuote: quoteJson })
				.where(eq(userTable.id, userId));
			return;
		}

		// Use AI to select the most appropriate quote from the backlog
		const systemInstruction = `Du bist ein Experte für Gewaltfreie Kommunikation und hilfst dabei, das passendste inspirierende Zitat aus einer Liste auszuwählen.

Deine Aufgabe:
- Analysiere die gegebenen Gefühle, Bedürfnisse und Gesprächsthemen der Person
- Wähle das Zitat aus der Liste, das am besten zu ihrer aktuellen Situation passt
- Das Zitat soll besonders relevant für ihre aktuellen Bedürfnisse und Gefühle sein
- WICHTIG: Wähle unterschiedliche Zitate - vermeide es, immer das erste oder dasselbe Zitat zu wählen
- Wähle aus dem VOLLSTÄNDIGEN Bereich von 0 bis ${QUOTE_BACKLOG.length - 1}
- Gib die Nummer des Zitats zurück (0-indexiert)

Antworte mit einem JSON-Objekt im Format: {"quoteIndex": <zahl>} wobei <zahl> zwischen 0 und ${QUOTE_BACKLOG.length - 1} liegt.`;

		const needsContext = topNeeds.length > 0 
			? `Die Person hat in den letzten Gesprächen besonders diese Bedürfnisse geäußert: ${topNeeds.join(', ')}.` 
			: 'Die Person hat keine Bedürfnisse explizit genannt.';
		
		const feelingsContext = topFeelings.length > 0
			? `Die Person hat folgende Gefühle häufig geäußert: ${topFeelings.join(', ')}.`
			: 'Keine Gefühle explizit genannt.';

		const themesContext = allTitles.length > 0
			? `Die Gespräche der letzten Woche drehten sich um diese Themen: ${allTitles.slice(0, 5).join(', ')}.`
			: 'Keine spezifischen Gesprächsthemen vorhanden.';

		// Format quote list for the prompt
		const quotesList = QUOTE_BACKLOG.map((q, idx) => `${idx}. "${q.quote}" (${q.author})`).join('\n');

		const contextPrompt = `${needsContext}

${feelingsContext}

${themesContext}

Verfügbare Zitate:
${quotesList}

Wähle die Nummer des Zitats, das am besten zu dieser Person und ihrer Situation passt.`;

		const chat = ai.chats.create({
			model: 'gemini-2.5-flash',
			config: {
				temperature: 0.7, // Higher temperature for more variety in selection
				maxOutputTokens: 50, // Increased to ensure complete JSON response
				systemInstruction,
				responseMimeType: 'application/json',
				responseSchema: {
					type: 'object',
					properties: {
						quoteIndex: {
							type: 'number',
							description: 'The index (0-based) of the selected quote. Must be between 0 and ' + (QUOTE_BACKLOG.length - 1) + '. Choose a variety of quotes, not always the same one.'
						}
					},
					required: ['quoteIndex']
				}
			}
		});

		const result = await chat.sendMessage({ message: contextPrompt });
		
		console.log('📥 Raw AI response:', result.text);
		console.log('📥 Response type:', typeof result.text);

		// Parse the JSON response to get quote index
		let quoteIndex = -1;
		try {
			const responseText = result.text?.trim();
			if (!responseText) {
				throw new Error('Empty response');
			}
			
			console.log('📥 Parsing response text:', responseText);
			const parsed = typeof responseText === 'string' ? JSON.parse(responseText) : responseText;
			console.log('📥 Parsed JSON:', parsed);
			
			quoteIndex = Math.floor(Number(parsed.quoteIndex));
			console.log('📥 Extracted quote index:', quoteIndex);
			
			// Ensure index is within bounds
			if (quoteIndex < 0 || quoteIndex >= QUOTE_BACKLOG.length || isNaN(quoteIndex)) {
				console.warn(`⚠️ Invalid quote index ${quoteIndex}, using random quote`);
				quoteIndex = Math.floor(Math.random() * QUOTE_BACKLOG.length);
			}
		} catch (e) {
			console.error('❌ Failed to parse quote index, using random:', e);
			console.error('❌ Raw response was:', result.text);
			quoteIndex = Math.floor(Math.random() * QUOTE_BACKLOG.length);
		}

		console.log(`📝 Final selected quote index: ${quoteIndex} out of ${QUOTE_BACKLOG.length - 1}`);
		const selectedQuoteData = QUOTE_BACKLOG[quoteIndex];
		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		console.log('📌 SELECTED QUOTE DETAILS:');
		console.log(`   Index: ${quoteIndex}`);
		console.log(`   Quote: "${selectedQuoteData.quote}"`);
		console.log(`   Author: ${selectedQuoteData.author}`);
		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

		if (!selectedQuoteData.quote || selectedQuoteData.quote.length === 0) {
			console.warn('⚠️ Selected quote is empty, skipping storage');
			return;
		}

		// Store quote and author as JSON
		const quoteJson = JSON.stringify({
			quote: selectedQuoteData.quote,
			author: selectedQuoteData.author
		});

		console.log('📤 JSON to be written to database:');
		console.log('   ', quoteJson);
		console.log('   Length:', quoteJson.length);
		console.log('   User ID:', userId);

		// Store quote in user table
		try {
			const updateResult = await db
				.update(userTable)
				.set({
					inspirationalQuote: quoteJson
				})
				.where(eq(userTable.id, userId))
				.returning();

			console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			console.log('💾 DATABASE UPDATE RESULT:');
			console.log('   Rows updated:', updateResult.length);

			if (updateResult.length === 0) {
				console.error('   ❌ FAILED - User update returned no rows');
				console.error('   User ID used:', userId);
				
				// Try to verify user exists
				const userCheck = await db
					.select()
					.from(userTable)
					.where(eq(userTable.id, userId))
					.limit(1);
				console.error('   User exists check:', userCheck.length > 0 ? '✅ User found' : '❌ User NOT found');
				if (userCheck.length > 0) {
					console.error('   Current inspirationalQuote value:', userCheck[0].inspirationalQuote);
				}
			} else {
				const savedQuote = updateResult[0].inspirationalQuote;
				console.log('   ✅ SUCCESS - Quote saved to database');
				console.log('   Saved value:', savedQuote);
				console.log('   Saved value length:', savedQuote?.length || 0);
				
				// Parse and verify what was saved
				if (savedQuote) {
					try {
						const parsed = JSON.parse(savedQuote);
						console.log('   ✅ Parsed saved quote:', parsed.quote);
						console.log('   ✅ Parsed saved author:', parsed.author);
					} catch (e) {
						console.error('   ⚠️ Saved value is not valid JSON:', e);
					}
				} else {
					console.error('   ⚠️ Saved value is null or undefined');
				}
			}
			console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		} catch (updateError) {
			console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			console.error('❌ ERROR UPDATING USER TABLE WITH QUOTE:');
			console.error('   Error type:', updateError instanceof Error ? updateError.constructor.name : typeof updateError);
			console.error('   Error message:', updateError instanceof Error ? updateError.message : String(updateError));
			console.error('   Error stack:', updateError instanceof Error ? updateError.stack : 'No stack trace');
			console.error('   User ID:', userId);
			console.error('   Quote JSON:', quoteJson);
			console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			throw updateError;
		}
	} catch (error) {
		console.error('❌ Error generating inspirational quote:', error);
		throw error;
	}
}

/**
 * Extract memories from unprocessed chats using AI
 * Creates embeddings and stores in PostgreSQL vector database
 */
export async function extractMemories(
	userId: string,
	locale: string = 'de',
	specificChatId?: string
): Promise<boolean> {
	console.log(`🧠 Extracting memories for user: ${userId}${specificChatId ? ` from chat: ${specificChatId}` : ''}`);

	try {
		const ai = getAiClient();

		// 1. Fetch chats for user
		let chatsToProcess;

		if (specificChatId) {
			// If specific chat ID is provided, fetch only that chat (regardless of memoryProcessed status)
			chatsToProcess = await db
				.select()
				.from(chatsTable)
				.where(and(eq(chatsTable.userId, userId), eq(chatsTable.id, specificChatId)));
		} else {
			// Otherwise, fetch all unprocessed chats
			chatsToProcess = await db
				.select()
				.from(chatsTable)
				.where(and(eq(chatsTable.userId, userId), eq(chatsTable.memoryProcessed, false)));
		}

		console.log('userChats found:', chatsToProcess.length);
		console.log('Chat IDs being processed:', chatsToProcess.map(chat => chat.id));

		if (chatsToProcess.length === 0) {
			console.log('No unprocessed chats found');
			return true;
		}

		// 2. Decrypt and concatenate all chat histories (matching empathy-link approach)
		const chatIds: string[] = [];

		const concatenatedHistory = chatsToProcess
			.map((chat) => {
				if (!chat.history) return '';

				const encryptedHistory = JSON.parse(chat.history) as HistoryEntry[];
				const decryptedHistory = decryptChatHistory(encryptedHistory);
				chatIds.push(chat.id);

				// JSON.stringify the decrypted history like empathy-link does
				return JSON.stringify(decryptedHistory);
			})
			.filter(Boolean)
			.join('\n');

		if (!concatenatedHistory) {
			console.log('ℹ️ concatenatedHistory is empty, skipping memory extraction');
			return true;
		}

		// 3. Create response schema for memory extraction
		const memorySchema = {
			type: Type.ARRAY,
			items: {
				type: Type.OBJECT,
				properties: {
					aspectType: {
						type: Type.STRING,
						enum: ['identity', 'emotion', 'relationship', 'value'],
						description: 'Type of memory aspect'
					},
					key: {
						type: Type.STRING,
						description: 'Memory heading/title'
					},
					value: {
						type: Type.STRING,
						description: 'Memory content'
					},
					confidence: {
						type: Type.STRING,
						enum: ['speculative', 'likely', 'certain'],
						description: 'Confidence level'
					},
					personName: {
						type: Type.STRING,
						description: 'Name of the other person this memory refers to (empty string if not applicable)'
					}
				},
				required: ['aspectType', 'key', 'value', 'confidence', 'personName']
			}
		};

		// 4. Create system instruction for memory extraction (localized)
		const isGerman = (locale || '').toLowerCase().startsWith('de');
		const systemInstruction = isGerman
			? `Du bist Expert:in für Erinnerungsextraktion und analysierst Gespräche, um zentrale Aspekte über die Nutzerin/den Nutzer zu identifizieren.

	Extrahiere Erinnerungen in diesen Kategorien:
	- identity: Wer die Person ist (Rollen, Merkmale, Identitätsmarker, persönliche Eigenschaften, Hobbys, Vorlieben/Abneigungen)
	- emotion: Emotionale Muster, Auslöser, Bewältigungsstrategien, wie Gefühle verarbeitet werden
	- relationship: Informationen über ANDERE PERSONEN im Leben der Nutzerin/des Nutzers – Beziehungen zu Partnern, Familie, Freund:innen, Kolleg:innen, Konflikte mit anderen, Beziehungsdynamiken
	- value: Grundwerte, Prioritäten, Überzeugungen, was der Person wichtig ist, Prinzipien

	WICHTIGE UNTERSCHEIDUNGEN:
	- „Ich mag Bären“ → identity (es geht um die VORLIEBE DER PERSON)
	- „Mein Partner mag Bären“ → relationship (es geht um JEMAND ANDEREN)
	- „Ehrlichkeit ist mir wichtig“ → value (ein Grundsatz)
	- „Ich fühle mich ängstlich, wenn …“ → emotion (ein emotionales Muster)

	Formuliere alle Erinnerungen konsequent in der Ich-Perspektive ("Ich …"), niemals in der dritten Person.

	WICHTIG: Für JEDE Erinnerung MUSST du das Feld "personName" angeben. Wenn sich eine Erinnerung auf eine ANDERE Person bezieht (z. B. Partner:in, Freund:in, Kolleg:in), extrahiere den Namen dieser Person. Wenn kein Name genannt wird oder die Erinnerung sich auf mich selbst bezieht, setze "personName" auf eine leere Zeichenfolge (""). Das Feld "personName" ist PFLICHT und muss bei jeder Erinnerung vorhanden sein.

	Für jede Erinnerung:
	- aspectType: identity, emotion, relationship oder value
	- key: Eine kurze Überschrift für die Erinnerung
	- value: Der eigentliche Erinnerungsinhalt
	- confidence: speculative, likely oder certain
	- personName: Name der anderen Person, falls vorhanden, sonst leere Zeichenfolge

	WICHTIG: Wenn die Nutzerin/der Nutzer ausdrücklich bittet, etwas zu merken (z. B. „Merke dir …“, „Bitte erinnere dich …“, „Vergiss nicht …“), MUSST du das als Erinnerung mit dem Vertrauenslevel „certain“ extrahieren. Solche expliziten Bitten sind immer zu erfassen.

	Extrahiere nur sinnvolle, handlungsrelevante Erinnerungen. Gib ausschließlich ein JSON-Array zurück.`
			: `You are a memory extraction expert analyzing conversations to identify key aspects about the user.

	Extract memories in these categories:
	- identity: Who the person is (roles, characteristics, identity markers, personal traits, hobbies, preferences, likes/dislikes)
	- emotion: Emotional patterns, triggers, coping mechanisms, how they process feelings
	- relationship: Information about OTHER PEOPLE in the user's life - their relationships with partners, family, friends, colleagues, conflicts with others, relationship dynamics
	- value: Core values, priorities, beliefs, what matters to them, principles they live by

	IMPORTANT DISTINCTIONS:
	- "I like bears" → identity (it's about the USER's preference)
	- "My partner likes bears" → relationship (it's about SOMEONE ELSE)
	- "I value honesty" → value (it's a core principle)
	- "I feel anxious when..." → emotion (it's an emotional pattern)

Write all memories strictly in the user's first-person voice ("I …"), never in third person.

IMPORTANT: For EVERY memory you MUST include the "personName" field. If a memory refers to ANOTHER person (e.g., partner, friend, colleague), extract that person's name. If no name is given or the memory refers to myself, set "personName" to an empty string (""). The "personName" field is REQUIRED and must be present for every memory.

For each memory:
	- aspectType: Choose from identity, emotion, relationship, or value
	- key: A short title/heading for the memory
	- value: The memory content itself
	- confidence: speculative, likely, or certain
	- personName: Name of the other person if applicable, otherwise empty string

	IMPORTANT: If the user explicitly asks you to remember something (e.g., "remember that...", "please remember...", "don't forget that...", "merke dir...", "vergiss nicht..."), you MUST extract that as a memory with confidence level "certain". These explicit requests should always be captured.

	Extract only meaningful, actionable memories. Return as JSON array.`;

		// 5. Send to Gemini for memory extraction
		console.log('📤 Sending memory extraction request to Gemini...');

		const chat_session = ai.chats.create({
			model: 'gemini-2.5-flash-lite',
			config: {
				temperature: 0.3,
				maxOutputTokens: 8192,
				responseMimeType: 'application/json',
				responseSchema: memorySchema,
				systemInstruction
			}
		});

		const message = `
The chat history is:
${concatenatedHistory}
`;

		console.log('📋 FULL CHAT HISTORY BEING ANALYZED:');
		console.log(concatenatedHistory);

		const result = await chat_session.sendMessage({ message });

		// 6. Parse response
		let extractedMemories: MemoryExtraction[];
		try {
			const responseText = result.text || '[]';
			const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
			extractedMemories = JSON.parse(cleanedText);
		} catch (parseError) {
			console.error('Failed to parse memory extraction response:', parseError);
			throw new Error('Failed to parse AI memory extraction response');
		}

		console.log(`📝 Extracted ${extractedMemories.length} memories from chat`);
		if (extractedMemories.length === 0) {
			console.warn('⚠️ No memories extracted from chat - AI returned empty array');
			console.log('📋 Chat history that was analyzed:', concatenatedHistory.substring(0, 500) + '...');
		} else {
			console.log('📝 Sample extracted memory:', JSON.stringify(extractedMemories[0] || {}, null, 2));
		}

		// 7. Generate embeddings and save memories to PostgreSQL
		let savedCount = 0;
		let failedCount = 0;
		for (const memory of extractedMemories) {
			try {
				// Generate embedding using Gemini's correct API
				const embeddingText = `${memory.key}: ${memory.value}`;
				const response = await ai.models.embedContent({
					model: 'gemini-embedding-001',
					contents: embeddingText,
					config: {
						outputDimensionality: 768
					}
				});

				// Check both singular and plural forms (SDK might use either)
				let embeddingValues: number[] | undefined;
				if (response.embeddings && Array.isArray(response.embeddings) && response.embeddings.length > 0) {
					embeddingValues = response.embeddings[0].values;
				} else if ((response as any).embedding?.values) {
					embeddingValues = (response as any).embedding.values;
				}

				if (!embeddingValues || !Array.isArray(embeddingValues)) {
					console.error('Failed to get embedding values for memory:', memory.key);
					console.error('Response structure:', JSON.stringify(response, null, 2));
					continue;
				}
				
				const priority = memory.confidence === 'certain' ? 3 : memory.confidence === 'likely' ? 2 : 1;
				const chatIdToUse = specificChatId || chatIds[0] || null;
				// Convert empty string to null for cleaner database storage
				const personName = memory.personName && memory.personName.trim() !== '' ? memory.personName.trim() : null;

				// Map aspectType from AI extraction to MemoryType for database
				// aspectType: 'identity' | 'emotion' | 'relationship' | 'value'
				// MemoryType: 'core_identity' | 'patterns' | 'preferences' | 'episodic' | 'contextual'
				const memoryType = classifyMemoryType(memory.value); // Use the value text to classify
				
				// Calculate expiry date based on memory type
				const expiryDate = getExpiryDate(memoryType);
				const expiresAt = expiryDate ? expiryDate.toISOString() : null;

				console.log(`Saving memory with personName: "${personName}" (aspectType: ${memory.aspectType} -> memoryType: ${memoryType}), embedding dimensions: ${embeddingValues.length}, expires_at: ${expiresAt}`);

				// Use raw SQL to insert with proper vector conversion (like empathy-link does)
				await db.execute(sql`
					INSERT INTO memories (
						user_id, confidence, type, priority, key, value, person_name, embedding,
						chat_id, relevance_score, access_count, expires_at
					) VALUES (
						${userId}, ${memory.confidence}, ${memoryType}, ${priority}, ${memory.key},
						${memory.value}, ${personName}, ${JSON.stringify(embeddingValues)}::vector, ${chatIdToUse},
						1.0, 0, ${expiresAt}
					)
				`);

				console.log(`✅ Created memory: [${memory.aspectType}] ${memory.value}${personName ? ` (person: ${personName})` : ''}`);
				savedCount++;
			} catch (embeddingError) {
				console.error(`❌ Error creating memory for "${memory.key}":`, embeddingError);
				console.error('❌ Error details:', {
					message: embeddingError instanceof Error ? embeddingError.message : String(embeddingError),
					stack: embeddingError instanceof Error ? embeddingError.stack : undefined
				});
				failedCount++;
				// Continue with next memory even if one fails
			}
		}

		console.log(`💾 Memory save summary: ${savedCount} saved, ${failedCount} failed out of ${extractedMemories.length} total`);

		// 8. Mark all processed chats as memoryProcessed
		for (const chatId of chatIds) {
			try {
				await db
					.update(chatsTable)
					.set({
						memoryProcessed: true,
						updated: new Date().toISOString()
					})
					.where(eq(chatsTable.id, chatId));
			} catch (error) {
				console.error('Error updating chat record:', error);
			}
		}

		console.log('Memory extraction completed successfully');
		return true;
	} catch (error) {
		console.error('❌ Error in extractMemories:', error);
		throw error;
	}
}

// Type definitions for NVC knowledge retrieval
export interface NVCKnowledgeRetrievalResult {
	knowledgeEntries: Array<NVCKnowledgeEntry & { similarity: number }>;
	searchQuery: string;
	extractedConcepts: string[];
}

/**
 * Retrieve relevant NVC knowledge based on a chat message
 * Uses AI to extract key concepts from the message, then searches the NVC knowledge base
 */
export async function retrieveNVCKnowledge(
	message: string,
	locale: string = 'de',
	options: {
		limit?: number;
		minSimilarity?: number;
		category?: string;
		tags?: string[];
	} = {}
): Promise<NVCKnowledgeRetrievalResult> {
	console.log('📚 Retrieving NVC knowledge for message:', message.substring(0, 100) + '...');

	try {
		const ai = getAiClient();
		const isGerman = (locale || '').toLowerCase().startsWith('de');
		const language = isGerman ? 'de' : 'en';

		// Step 1: Use AI to extract key concepts and create an optimized search query
		const systemInstruction = isGerman
			? `Du bist ein Experte für Gewaltfreie Kommunikation (GFK) und analysierst Nachrichten, um relevante GFK-Konzepte zu identifizieren.

Deine Aufgabe:
- Analysiere die Nachricht und identifiziere die wichtigsten GFK-relevanten Konzepte
- Erstelle eine präzise Suchanfrage für die GFK-Wissensdatenbank
- Extrahiere Schlüsselbegriffe wie: Gefühle, Bedürfnisse, Beobachtungen, Bitten, Konflikte, Empathie, etc.

Antworte mit einem JSON-Objekt im Format:
{
  "searchQuery": "Eine präzise Suchanfrage für die GFK-Wissensdatenbank",
  "extractedConcepts": ["Konzept1", "Konzept2", "Konzept3"]
}`
			: `You are an expert in Nonviolent Communication (NVC) and analyze messages to identify relevant NVC concepts.

Your task:
- Analyze the message and identify the most important NVC-relevant concepts
- Create a precise search query for the NVC knowledge base
- Extract key terms like: feelings, needs, observations, requests, conflicts, empathy, etc.

Respond with a JSON object in the format:
{
  "searchQuery": "A precise search query for the NVC knowledge base",
  "extractedConcepts": ["concept1", "concept2", "concept3"]
}`;

		const conceptExtractionSchema = {
			type: Type.OBJECT,
			properties: {
				searchQuery: {
					type: Type.STRING,
					description: 'A precise search query optimized for semantic search in the NVC knowledge base'
				},
				extractedConcepts: {
					type: Type.ARRAY,
					items: { type: Type.STRING },
					description: 'List of key NVC concepts extracted from the message'
				}
			},
			required: ['searchQuery', 'extractedConcepts']
		};

		const chat_session = ai.chats.create({
			model: 'gemini-2.5-flash-lite',
			config: {
				temperature: 0.3,
				maxOutputTokens: 512,
				responseMimeType: 'application/json',
				responseSchema: conceptExtractionSchema,
				systemInstruction
			}
		});

		const conceptResult = await chat_session.sendMessage({
			message: isGerman
				? `Analysiere diese Nachricht und extrahiere GFK-relevante Konzepte:\n\n"${message}"`
				: `Analyze this message and extract NVC-relevant concepts:\n\n"${message}"`
		});

		// Parse concept extraction result
		let searchQuery: string = message;
		let extractedConcepts: string[] = [];

		try {
			const responseText = conceptResult.text || '{}';
			const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
			const parsed = JSON.parse(cleanedText);
			searchQuery = parsed.searchQuery || message;
			extractedConcepts = Array.isArray(parsed.extractedConcepts) ? parsed.extractedConcepts : [];
		} catch (parseError) {
			console.warn('⚠️ Failed to parse concept extraction, using original message as search query');
			searchQuery = message;
		}

		console.log('🔍 Extracted search query:', searchQuery);
		console.log('📋 Extracted concepts:', extractedConcepts);

		// Step 2: Search the NVC knowledge base using the optimized query
		const knowledgeEntries = await searchNVCKnowledge(searchQuery, {
			language: language as 'de' | 'en',
			limit: options.limit || 5,
			minSimilarity: options.minSimilarity || 0.7,
			category: options.category,
			tags: options.tags
		});

		console.log(`✅ Found ${knowledgeEntries.length} relevant NVC knowledge entries`);

		return {
			knowledgeEntries,
			searchQuery,
			extractedConcepts
		};
	} catch (error) {
		console.error('❌ Error retrieving NVC knowledge:', error);
		// Return empty result on error
		return {
			knowledgeEntries: [],
			searchQuery: message,
			extractedConcepts: []
		};
	}
}
