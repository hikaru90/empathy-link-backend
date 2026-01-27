import { desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { chats as chatsTable, feelings as feelingsTable, user as userTable } from '../../drizzle/schema.js';
import { decryptChatHistory, encryptChatHistory, type HistoryEntry } from '../lib/encryption.js';
import { getAiResponseWithRetry, analyzePathSwitchingIntent, type PathSwitchAnalysis } from '../lib/gemini.js';
import { createPathMarker, getSystemPromptForPath, type PathState, CONVERSATION_PATHS } from '../lib/paths.js';
import { analyzeChat, extractMemories } from '../lib/ai-tools.js';
import { formatMemoriesForPrompt } from '../lib/memory.js';
import { getToolCalls, executeTools, formatToolResults } from '../lib/tool-caller.js';

const db = drizzle(process.env.DATABASE_URL!);
const bullshift = new Hono();

// POST /api/ai/bullshift/initChat - Initialize a new chat session
bullshift.post('/initChat', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const body = await c.req.json();
		const { locale, initialPath } = body;

		const pathId = initialPath || 'idle';
		console.log('initChat called with pathId:', pathId, 'for user:', user.id);

		// Create initial path state
		const pathState: PathState = {
			activePath: pathId,
			pathHistory: [pathId],
			startedAt: Date.now()
		};

		// Create initial path marker
		const pathMarker = createPathMarker('path_start', pathId);

		// Create initial history with path marker
		const initialHistory: HistoryEntry[] = [
			// Hidden user message to satisfy Gemini's requirement
			{
				role: 'user',
				parts: [{ text: '[System: Chat initialisiert]' }],
				timestamp: Date.now(),
				hidden: true // Mark as hidden so it doesn't show in UI
			},
			// Path marker as model message (text will not be displayed, only visual indicator)
			{
				role: 'model',
				parts: [{ text: '' }], // Empty text - only pathMarker is used for display
				timestamp: Date.now(),
				pathMarker
			}
		];

		// If starting with idle path, add proactive welcome message
		if (pathId === 'idle') {
			const welcomeMessage1 = `Ich begleite dich dabei, schwierige Situationen zu erforschen – ob Streit mit einer wichtigen Person oder ein innerer Konflikt, bei dem du hin- und hergerissen bist.<br/><br/>Es geht dabei nicht um Tipps oder fertige Lösungen, sondern ich helfe dir, deine eigenen Gefühle und Gedanken zu sortieren. So findest du selbst heraus, was dir wichtig ist.<br/><br/>Manchmal schauen wir gemeinsam auf deine Sicht, manchmal auf die Perspektive der anderen Person. Wichtig ist: Du kannst hier nichts falsch machen. Alles, was dich bewegt, hat hier seinen Platz. <br/><br/>Und deine Gespräche bleiben natürlich privat und sicher – sie gehören nur dir.`;

			const welcomeMessage2 = `Was kann ich heute für Dich tun?`;

			initialHistory.push({
				role: 'model',
				parts: [{ text: welcomeMessage1 }],
				timestamp: Date.now()
			});
			initialHistory.push({
				role: 'model',
				parts: [{ text: welcomeMessage2 }],
				timestamp: Date.now()
			});
		}

		// Encrypt history before storing
		const encryptedHistory = encryptChatHistory(initialHistory);

		// Store in database
		const chatRecord = await db.insert(chatsTable).values({
			id: crypto.randomUUID(),
			userId: user.id,
			module: 'bullshift',
			history: JSON.stringify(encryptedHistory),
			pathState: JSON.stringify(pathState)
		}).returning();

		console.log('Created new chat record:', chatRecord[0].id);

		// Fetch full user record with preferences
		const userWithPreferences = await db
			.select({
				id: userTable.id,
				firstName: userTable.firstName,
				aiAnswerLength: userTable.aiAnswerLength,
				toneOfVoice: userTable.toneOfVoice,
				nvcKnowledge: userTable.nvcKnowledge,
			})
			.from(userTable)
			.where(eq(userTable.id, user.id))
			.limit(1);

		const userContext = userWithPreferences[0] || user;

		// Get system instruction for the specific path
		const systemInstruction = getSystemPromptForPath(pathId, userContext);

		// Return chat initialization data with unencrypted history for immediate use
		return c.json({
			chatId: chatRecord[0].id,
			systemInstruction,
			activePath: pathId,
			pathState,
			history: initialHistory // Return unencrypted for immediate display
		});

	} catch (error) {
		console.error('Error initializing chat:', error);
		return c.json({ error: 'Failed to initialize chat' }, 500);
	}
});

// GET /api/ai/bullshift/getLatestChat - Get the latest active chat session
bullshift.get('/getLatestChat', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		console.log('getLatestChat called for user:', user.id);

		// Get the latest chat for this user
		const chatRecord = await db.select().from(chatsTable)
			.where(eq(chatsTable.userId, user.id))
			.orderBy(desc(chatsTable.created))
			.limit(1);

		if (!chatRecord || chatRecord.length === 0) {
			return c.json({ error: 'No active chat found' }, 404);
		}

		const chat = chatRecord[0];

		// Parse and decrypt history
		const encryptedHistory = JSON.parse(chat.history || '[]');
		const history = decryptChatHistory(encryptedHistory);

		// Parse path state
		const pathState = chat.pathState ? JSON.parse(chat.pathState) : { activePath: 'idle' };
		const activePath = pathState.activePath || 'idle';

		// Fetch full user record with preferences
		const userWithPreferences = await db
			.select({
				id: userTable.id,
				firstName: userTable.firstName,
				aiAnswerLength: userTable.aiAnswerLength,
				toneOfVoice: userTable.toneOfVoice,
				nvcKnowledge: userTable.nvcKnowledge,
			})
			.from(userTable)
			.where(eq(userTable.id, user.id))
			.limit(1);

		const userContext = userWithPreferences[0] || user;

		// Get system instruction for current path
		const systemInstruction = getSystemPromptForPath(activePath, userContext);

		console.log('Found existing chat:', chat.id, 'with path:', activePath);

		return c.json({
			chatId: chat.id,
			systemInstruction,
			activePath,
			pathState,
			history
		});

	} catch (error) {
		console.error('Error getting latest chat:', error);
		return c.json({ error: 'Failed to get latest chat' }, 500);
	}
});

// POST /api/ai/bullshift/send - Send a message and get AI response
bullshift.post('/send', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const body = await c.req.json();
		const { chatId, message, history } = body;

		if (!chatId || !message) {
			return c.json({ error: 'chatId and message are required' }, 400);
		}

		console.log('send called for chat:', chatId);

		// Verify chat belongs to user and get path state
		const chatRecord = await db.select().from(chatsTable)
			.where(eq(chatsTable.id, chatId))
			.limit(1);

		if (!chatRecord || chatRecord.length === 0) {
			return c.json({ error: 'Chat not found' }, 404);
		}

		if (chatRecord[0].userId !== user.id) {
			return c.json({ error: 'Unauthorized' }, 403);
		}

		// Get path state to determine system prompt
		const pathState = chatRecord[0].pathState ? JSON.parse(chatRecord[0].pathState) : { activePath: 'idle' };
		let activePath = pathState.activePath || 'idle';

		// PATH SWITCHING ANALYSIS - Analyze if user wants to switch paths
		let pathSwitchAnalysis: PathSwitchAnalysis | null = null;
		let pathSwitched = false;
		let newPathId: string | null = null;
		
		// Initialize memory variables early so they can be set during path switch
		let memoryContext = '';
		let relevantMemories: any[] = [];

		try {
			// Prepare recent conversation history for analysis
			const decryptedHistory = chatRecord[0].history ? JSON.parse(chatRecord[0].history) : [];
			const fullHistory = decryptChatHistory(decryptedHistory);

			const preliminaryMessages = fullHistory.slice(-6)
				.filter((h: any) => h.parts && h.parts.length > 0 && !h.pathMarker && !h.hidden)
				.map((h: any) => ({
					role: h.role === 'model' ? 'assistant' : h.role as string,
					content: h.parts[0]?.text || ''
				}))
				.filter((m: any) => (m.role === 'user' || m.role === 'assistant') && m.content.trim().length > 0);

			// Add current user message to context
			preliminaryMessages.push({ role: 'user', content: message });

			console.log('🔍 Pre-response path analysis - User message:', message);
			console.log('🔍 Current active path:', activePath);
			console.log('🔍 Path state object:', pathState);
			console.log('🔍 Passing to AI - activePath value:', activePath, 'type:', typeof activePath);

			// Special handling for feedback path - only allow explicit switches
			if (activePath === 'feedback') {
				const explicitSwitchKeywords = [
					'beenden', 'ende', 'stop', 'aufhören', 'abbrechen',
					'selbst-empathie', 'fremd-empathie', 'handlungsplanung', 'konfliktlösung',
					'anderes thema', 'wechseln zu', 'gehen zu'
				];

				const hasExplicitSwitch = explicitSwitchKeywords.some(keyword =>
					message.toLowerCase().includes(keyword)
				);

				if (!hasExplicitSwitch) {
					console.log('🔒 Feedback path: Preventing automatic path switching');
				} else {
					console.log('🔓 Feedback path: Explicit switch detected, running path analysis');
					pathSwitchAnalysis = await analyzePathSwitchingIntent(
						message,
						activePath,
						preliminaryMessages,
						'de'
					);
				}
			} else {
				// ALWAYS run AI path analysis for all non-feedback paths
				console.log('🤖 Running AI path analysis for all messages');
				pathSwitchAnalysis = await analyzePathSwitchingIntent(
					message,
					activePath,
					preliminaryMessages,
					'de'
				);
			}

			console.log('🔍 Path analysis result:', pathSwitchAnalysis);

			// Switch path if AI determines it's appropriate
			if (pathSwitchAnalysis?.shouldSwitch &&
				(pathSwitchAnalysis?.confidence || 0) >= 70 && // Lowered from 80 to 70
				pathSwitchAnalysis?.suggestedPath &&
				pathSwitchAnalysis.suggestedPath !== activePath) {

				const nextPath = pathSwitchAnalysis.suggestedPath;
				console.log('🔄 Switching path BEFORE AI response generation');
				console.log('🎯 Switching from:', activePath, 'to:', nextPath);
				console.log('📊 Confidence:', pathSwitchAnalysis.confidence);
				console.log('📝 Reason:', pathSwitchAnalysis.reason);

				if (CONVERSATION_PATHS[nextPath]) {
					// Update path state
					const newPathState: PathState = {
						activePath: nextPath,
						pathHistory: [...pathState.pathHistory, nextPath],
						startedAt: pathState.startedAt,
						lastSwitch: Date.now()
					};

					// Update database with new path state
					await db.update(chatsTable)
						.set({ pathState: JSON.stringify(newPathState) })
						.where(eq(chatsTable.id, chatId));

					pathSwitched = true;
					newPathId = nextPath;
					activePath = nextPath; // Update active path for the response
					console.log(`✅ Path switched to ${nextPath}`);
					
					// Update pathState variable for later use
					pathState.activePath = nextPath;
					pathState.pathHistory = newPathState.pathHistory;
					pathState.lastSwitch = Date.now();
					
					// If switched to memory path, fetch memories immediately
					if (nextPath === 'memory') {
						try {
							console.log('🧠 Path switched to memory - fetching all memories immediately');
							const { getUserMemories } = await import('../lib/memory.js');
							const allMemories = await getUserMemories(user.id, 20);
							if (allMemories.length > 0) {
								// Set memoryContext early so it's available for system prompt
								memoryContext = formatMemoriesForPrompt(allMemories);
								relevantMemories = allMemories;
								console.log(`✅ Fetched ${allMemories.length} memories immediately after path switch`);
							} else {
								memoryContext = '- Keine Erinnerungen gefunden';
								console.log('⚠️ No memories found for user after path switch');
							}
						} catch (memoryError) {
							console.error('❌ Error fetching memories immediately after path switch:', memoryError);
							memoryContext = '- Fehler beim Abrufen der Erinnerungen';
						}
					}
				}
			} else if (pathSwitchAnalysis) {
				console.log('❌ No path switch - AI decision:', pathSwitchAnalysis.reason);
				console.log('   shouldSwitch:', pathSwitchAnalysis.shouldSwitch, 'confidence:', pathSwitchAnalysis.confidence);
			}
		} catch (error) {
			console.error('❌ Error analyzing path switching:', error);
		}

		// TOOL CALLING: Use AI to decide which tools to call
		let toolResults: any[] = [];
		// memoryContext and relevantMemories are already declared above (may have been set during path switch)
		let nvcKnowledgeContext = '';
		let relevantNVCKnowledge: any[] = [];
		let nvcExtraction: { observation: string | null; feelings: string[]; needs: string[]; request: string | null } | null = null;
		let pathSwitchAnalysisFromTool: PathSwitchAnalysis | null = null;

		// SPECIAL HANDLING FOR MEMORY PATH: Use semantic search if user asks specific question, otherwise get all
		// This must happen AFTER path switching so we fetch memories if path switched to memory
		// Only fetch if we haven't already fetched (from path switch above)
		if (activePath === 'memory' && memoryContext === '') {
			try {
				console.log('🧠 Memory path active - checking if semantic search needed');
				const { getUserMemories, searchSimilarMemories } = await import('../lib/memory.js');
				
				// If user message contains a question or specific query, use semantic search
				const isSpecificQuery = message.trim().length > 0 && (
					message.includes('?') || 
					message.toLowerCase().includes('mag') || 
					message.toLowerCase().includes('mag ich') ||
					message.toLowerCase().includes('erinner') ||
					message.toLowerCase().includes('weißt du')
				);
				
				if (isSpecificQuery) {
					console.log('🔍 Using semantic search for specific query:', message);
					const searchedMemories = await searchSimilarMemories(message, user.id, 20);
					relevantMemories = searchedMemories;
					if (searchedMemories.length > 0) {
						memoryContext = formatMemoriesForPrompt(searchedMemories);
						console.log(`✅ Found ${searchedMemories.length} relevant memories via semantic search`);
					} else {
						// Fallback to all memories if semantic search finds nothing
						const allMemories = await getUserMemories(user.id, 50);
						relevantMemories = allMemories;
						memoryContext = allMemories.length > 0 
							? formatMemoriesForPrompt(allMemories)
							: '- Keine Erinnerungen gefunden';
						console.log(`⚠️ Semantic search found nothing, using ${allMemories.length} total memories`);
					}
				} else {
					console.log('📋 Fetching all memories (no specific query)');
					const allMemories = await getUserMemories(user.id, 50);
					relevantMemories = allMemories;
					if (allMemories.length > 0) {
						memoryContext = formatMemoriesForPrompt(allMemories);
						console.log(`✅ Fetched ${allMemories.length} memories for memory path`);
					} else {
						memoryContext = '- Keine Erinnerungen gefunden';
						console.log('⚠️ No memories found for user');
					}
				}
			} catch (memoryError) {
				console.error('❌ Error fetching memories for memory path:', memoryError);
				memoryContext = '- Fehler beim Abrufen der Erinnerungen';
			}
		}

		try {
			// Prepare recent conversation history for tool calling
			const decryptedHistory = chatRecord[0].history ? JSON.parse(chatRecord[0].history) : [];
			const fullHistory = decryptChatHistory(decryptedHistory);

			const recentHistory = fullHistory.slice(-6)
				.filter((h: any) => h.parts && h.parts.length > 0 && !h.pathMarker && !h.hidden)
				.map((h: any) => ({
					role: h.role === 'model' ? 'assistant' : h.role as string,
					content: h.parts[0]?.text || ''
				}))
				.filter((m: any) => (m.role === 'user' || m.role === 'assistant') && m.content.trim().length > 0);

			// Get tool calls from AI (skip if we're in memory path and already have memories)
			if (activePath !== 'memory') {
				const toolCallResponse = await getToolCalls({
					message,
					history: recentHistory,
					context: {
						userId: user.id,
						currentPath: activePath,
						locale: 'de'
					}
				});

				console.log('🔧 Tool call reasoning:', toolCallResponse.reasoning);
				console.log(`🔧 AI requested ${toolCallResponse.toolCalls.length} tool(s)`);

				// Execute tools
				if (toolCallResponse.toolCalls.length > 0) {
					toolResults = await executeTools(toolCallResponse.toolCalls, {
						userId: user.id,
						locale: 'de'
					});

					// Process tool results
					for (const result of toolResults) {
						if (!result.success) {
							console.warn(`⚠️ Tool ${result.tool} failed:`, result.error);
							continue;
						}

						if (result.tool === 'search_memories') {
							relevantMemories = result.result || [];
							if (relevantMemories.length > 0) {
								memoryContext = formatMemoriesForPrompt(relevantMemories);
								console.log(`✅ Found ${relevantMemories.length} relevant memories`);
							}
						} else if (result.tool === 'retrieve_nvc_knowledge') {
							relevantNVCKnowledge = result.result?.knowledgeEntries || [];
							if (relevantNVCKnowledge.length > 0) {
								const knowledgeEntries = relevantNVCKnowledge.map((entry: any) => {
									return `**${entry.title}** (Ähnlichkeit: ${(entry.similarity * 100).toFixed(0)}%)\n${entry.content}${entry.source ? `\n_Quelle: ${entry.source}_` : ''}`;
								}).join('\n\n');

								nvcKnowledgeContext = `\n\n**RELEVANTES GFK-WISSEN FÜR DIESE SITUATION:**\n${knowledgeEntries}\n\nNutze dieses Wissen, um dem Nutzer hilfreiche GFK-Perspektiven und -Konzepte anzubieten, wenn sie für die aktuelle Situation relevant sind. Integriere das Wissen natürlich und subtil in deine Antworten, ohne es aufzudrängen.`;
								console.log(`✅ Found ${relevantNVCKnowledge.length} relevant NVC knowledge entries`);
							}
						} else if (result.tool === 'extract_nvc_components') {
							nvcExtraction = result.result;
							console.log('✅ NVC extraction completed:', {
								observation: nvcExtraction?.observation ? 'present' : 'none',
								feelings: nvcExtraction?.feelings?.length || 0,
								needs: nvcExtraction?.needs?.length || 0,
								request: nvcExtraction?.request ? 'present' : 'none'
							});
						} else if (result.tool === 'analyze_path_switch') {
							pathSwitchAnalysisFromTool = result.result;
							// Use tool-based path analysis if we didn't already do path switching
							if (!pathSwitched && pathSwitchAnalysisFromTool) {
								pathSwitchAnalysis = pathSwitchAnalysisFromTool;
								console.log('🔍 Path analysis from tool:', pathSwitchAnalysis);
								
								// Apply path switch if needed
								if (pathSwitchAnalysis.shouldSwitch &&
									pathSwitchAnalysis.confidence >= 70 &&
									pathSwitchAnalysis.suggestedPath &&
									pathSwitchAnalysis.suggestedPath !== activePath) {
									
									const nextPath = pathSwitchAnalysis.suggestedPath;
									if (CONVERSATION_PATHS[nextPath]) {
										const newPathState: PathState = {
											activePath: nextPath,
											pathHistory: [...pathState.pathHistory, nextPath],
											startedAt: pathState.startedAt,
											lastSwitch: Date.now()
										};

										await db.update(chatsTable)
											.set({ pathState: JSON.stringify(newPathState) })
											.where(eq(chatsTable.id, chatId));

										pathSwitched = true;
										newPathId = nextPath;
										activePath = nextPath;
										pathState.activePath = nextPath;
										pathState.pathHistory = newPathState.pathHistory;
										pathState.lastSwitch = Date.now();
										console.log(`✅ Path switched to ${nextPath} (from tool)`);
										
										// If switched to memory path, fetch memories immediately
										if (nextPath === 'memory' && !memoryContext) {
											try {
												console.log('🧠 Path switched to memory - fetching all memories directly');
												const { getUserMemories } = await import('../lib/memory.js');
												const allMemories = await getUserMemories(user.id, 20);
												relevantMemories = allMemories;
												if (allMemories.length > 0) {
													memoryContext = formatMemoriesForPrompt(allMemories);
													console.log(`✅ Fetched ${allMemories.length} memories after path switch to memory`);
												} else {
													memoryContext = '- Keine Erinnerungen gefunden';
													console.log('⚠️ No memories found for user after path switch');
												}
											} catch (memoryError) {
												console.error('❌ Error fetching memories after path switch:', memoryError);
												memoryContext = '- Fehler beim Abrufen der Erinnerungen';
											}
										}
									}
								}
							}
						}
					}
				}
			} else {
				console.log('📭 No tools requested by AI');
			}
		} catch (toolError) {
			console.error('⚠️ Tool calling failed, continuing without tools:', toolError);
			// Continue without tools if calling fails
		}

		// Load existing NVC components from chat to avoid asking for them again
		let existingFeelings: string[] = [];
		let existingNeeds: string[] = [];
		let existingObservation: string | null = null;
		let existingRequest: string | null = null;

		if (chatRecord[0].feelings) {
			try {
				const parsedFeelings = JSON.parse(chatRecord[0].feelings);
				if (Array.isArray(parsedFeelings)) {
					existingFeelings = parsedFeelings;
				}
			} catch (e) {
				console.warn('Failed to parse existing feelings from chat');
			}
		}

		if (chatRecord[0].needs) {
			try {
				const parsedNeeds = JSON.parse(chatRecord[0].needs);
				if (Array.isArray(parsedNeeds)) {
					existingNeeds = parsedNeeds;
				}
			} catch (e) {
				console.warn('Failed to parse existing needs from chat');
			}
		}

		// Build NVC context to inject into system prompt
		let nvcContext = '';
		if (existingFeelings.length > 0 || existingNeeds.length > 0 || existingObservation || existingRequest) {
			nvcContext = '\n\n**BEREITS ERFASSTE NVC-KOMPONENTEN:**\n';
			
			if (existingObservation) {
				nvcContext += `- Beobachtung: ${existingObservation}\n`;
			}
			
			if (existingFeelings.length > 0) {
				nvcContext += `- Gefühle: ${existingFeelings.join(', ')}\n`;
			}
			
			if (existingNeeds.length > 0) {
				nvcContext += `- Bedürfnisse: ${existingNeeds.join(', ')}\n`;
			}
			
			if (existingRequest) {
				nvcContext += `- Bitte: ${existingRequest}\n`;
			}
			
			nvcContext += '\n**WICHTIG:** Diese Komponenten wurden bereits vom Nutzer genannt. Frage NICHT erneut danach, es sei denn, der Nutzer bringt neue Aspekte ein oder möchte etwas ändern. Nutze diese Informationen, um deine Antworten zu kontextualisieren und dem Nutzer zu zeigen, dass du dich an bereits Gesagtes erinnerst.';
		}

		// Fetch full user record with preferences
		const userWithPreferences = await db
			.select({
				id: userTable.id,
				firstName: userTable.firstName,
				aiAnswerLength: userTable.aiAnswerLength,
				toneOfVoice: userTable.toneOfVoice,
				nvcKnowledge: userTable.nvcKnowledge,
			})
			.from(userTable)
			.where(eq(userTable.id, user.id))
			.limit(1);

		const userContext = userWithPreferences[0] || user;

		// Get system instruction for current path with memory context and NVC context
		let systemInstruction = getSystemPromptForPath(activePath, userContext, memoryContext);
		
		// Append NVC context to system instruction
		if (nvcContext) {
			systemInstruction += nvcContext;
		}

		// For memory path specifically, inject memory context
		if (activePath === 'memory') {
			if (!memoryContext) {
				// If no memories found from tools, try to get some anyway
				memoryContext = '- Keine Erinnerungen gefunden';
			}
			systemInstruction = getSystemPromptForPath(activePath, userContext, memoryContext);
		} else if (memoryContext) {
			// For other paths, inject memories subtly in system prompt
			systemInstruction += `\n\n**KONTEXTWISSEN ÜBER DEN NUTZER:**\n${memoryContext}\nNutze dieses Wissen subtil und natürlich, um deine Antworten zu personalisieren. Erwähne Erinnerungen nur, wenn sie für die aktuelle Situation relevant sind.`;
		}

		// Append NVC knowledge context to system instruction
		if (nvcKnowledgeContext) {
			systemInstruction += nvcKnowledgeContext;
		}

		// Add tool results context to system instruction
		if (toolResults.length > 0) {
			const toolResultsText = formatToolResults(toolResults);
			systemInstruction += `\n\n**TOOL ERGEBNISSE:**\n${toolResultsText}\n\nNutze diese Informationen, um deine Antwort zu kontextualisieren.`;
		}

		console.log('📝 SYSTEM PROMPT:');
		console.log('='.repeat(80));
		console.log(systemInstruction);
		console.log('='.repeat(80));

		// Add user message to history
		const userMessage: HistoryEntry = {
			role: 'user',
			parts: [{ text: message }],
			timestamp: Date.now()
		};

		const historyWithUserMessage = [...(history || []), userMessage];

		// Get AI response with retry logic
		let aiResponse: string;
		try {
			aiResponse = await getAiResponseWithRetry(
				message,
				historyWithUserMessage,
				systemInstruction,
				3 // max retries
			);
		} catch (aiError) {
			console.error('AI response error:', aiError);
			// Return a helpful error message to the user
			const errorMessage = aiError instanceof Error ? aiError.message : 'Failed to get AI response';
			return c.json({
				error: errorMessage,
				fallbackResponse: 'Entschuldigung, ich habe gerade technische Schwierigkeiten. Bitte versuche es noch einmal.'
			}, 500);
		}

		// Add AI response to history
		const modelMessage: HistoryEntry = {
			role: 'model',
			parts: [{ text: aiResponse }],
			timestamp: Date.now()
		};

		const updatedHistory = [...historyWithUserMessage, modelMessage];

		// Encrypt and save updated history
		const encryptedHistory = encryptChatHistory(updatedHistory);

		// Aggregate NVC components: merge new extraction with existing chat data
		// (We already loaded existingFeelings and existingNeeds above, reuse them)
		let aggregatedFeelings: string[] = [...existingFeelings];
		let aggregatedNeeds: string[] = [...existingNeeds];
		let latestObservation: string | null = existingObservation;
		let latestRequest: string | null = existingRequest;

		// Add new NVC components (avoid duplicates)
		if (nvcExtraction) {
			// Merge feelings (avoid duplicates)
			for (const feeling of nvcExtraction.feelings) {
				if (!aggregatedFeelings.includes(feeling)) {
					aggregatedFeelings.push(feeling);
				}
			}
			
			// Merge needs (avoid duplicates)
			for (const need of nvcExtraction.needs) {
				if (!aggregatedNeeds.includes(need)) {
					aggregatedNeeds.push(need);
				}
			}

			// Store latest observation and request (overwrite previous if new one exists)
			if (nvcExtraction.observation) {
				latestObservation = nvcExtraction.observation;
			}
			if (nvcExtraction.request) {
				latestRequest = nvcExtraction.request;
			}
		}

		// Prepare update data
		const updateData: any = {
			history: JSON.stringify(encryptedHistory),
			updated: new Date().toISOString()
		};

		// Update feelings and needs if we have new data
		if (aggregatedFeelings.length > 0) {
			updateData.feelings = JSON.stringify(aggregatedFeelings);
		}
		if (aggregatedNeeds.length > 0) {
			updateData.needs = JSON.stringify(aggregatedNeeds);
		}
		
		// Note: observation and request columns don't exist in chats table yet
		// They are stored in analyses table after chat completion
		// For now, we extract them but don't store in chats table
		// TODO: Add observation and request columns to chats table if needed

		await db.update(chatsTable)
			.set(updateData)
			.where(eq(chatsTable.id, chatId));

		console.log('Message processed successfully, AI responded');

		// Add path markers to history if path was switched
		let historyWithMarkers = updatedHistory;
		if (pathSwitched && newPathId) {
			const pathMarker = createPathMarker('path_switch', newPathId, pathState.activePath);
			const pathMarkerEntry: HistoryEntry = {
				role: 'model',
				parts: [{ text: '' }],
				timestamp: Date.now(),
				pathMarker
			};
			historyWithMarkers = [...updatedHistory, pathMarkerEntry];

			// Save history with path marker
			const encryptedHistoryWithMarker = encryptChatHistory(historyWithMarkers);
			await db.update(chatsTable)
				.set({
					history: JSON.stringify(encryptedHistoryWithMarker),
					updated: new Date().toISOString()
				})
				.where(eq(chatsTable.id, chatId));
		}

		// Return AI response with updated history, memories, NVC knowledge, and path switch info
		return c.json({
			response: aiResponse,
			timestamp: Date.now(),
			history: historyWithMarkers,
			pathSwitched: pathSwitched,
			newPath: newPathId,
			pathSwitchReason: pathSwitchAnalysis?.reason,
			activePath: activePath,
			memoriesUsed: relevantMemories.length,
			memories: relevantMemories, // Include the memories that were used
			nvcKnowledgeUsed: relevantNVCKnowledge.length,
			nvcKnowledge: relevantNVCKnowledge // Include the NVC knowledge that was used
		});

	} catch (error) {
		console.error('Error sending message:', error);
		const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
		return c.json({ error: errorMessage }, 500);
	}
});

// GET /api/ai/bullshift/getHistory - Get chat history (optional, for refresh)
bullshift.get('/getHistory', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const chatId = c.req.query('chatId');

		if (!chatId) {
			return c.json({ error: 'chatId is required' }, 400);
		}

		// Get chat from database
		const chatRecord = await db.select().from(chatsTable)
			.where(eq(chatsTable.id, chatId))
			.limit(1);

		if (!chatRecord || chatRecord.length === 0) {
			return c.json({ error: 'Chat not found' }, 404);
		}

		if (chatRecord[0].userId !== user.id) {
			return c.json({ error: 'Unauthorized' }, 403);
		}

		// Parse and decrypt history
		const encryptedHistory = JSON.parse(chatRecord[0].history || '[]');
		// Note: We don't decrypt here in the MVP - we'll return encrypted and let client handle it
		// Or decrypt on backend and send plain to client
		const history = encryptedHistory; // TODO: Add decryption if needed

		const pathState = chatRecord[0].pathState ? JSON.parse(chatRecord[0].pathState) : null;

		return c.json({
			history,
			pathState
		});

	} catch (error) {
		console.error('Error getting history:', error);
		return c.json({ error: 'Failed to get history' }, 500);
	}
});

// GET /api/ai/bullshift/feelings - Get all feelings
bullshift.get('/feelings', async (c: Context) => {
	try {
		const feelings = await db.select().from(feelingsTable).orderBy(feelingsTable.sort);
		return c.json(feelings);
	} catch (error) {
		console.error('Error getting feelings:', error);
		return c.json({ error: 'Failed to get feelings' }, 500);
	}
});

// GET /api/ai/bullshift/needs - Get all needs (using feelings table structure for now)
bullshift.get('/needs', async (c: Context) => {
	try {
		// For now, we'll use a hardcoded list of needs since there's no needs table
		// This should be replaced with a proper needs table in the future
		const needs = [
			{ id: '1', nameDE: 'Verbindung', nameEN: 'Connection', category: 'relationship', sort: 1 },
			{ id: '2', nameDE: 'Verständnis', nameEN: 'Understanding', category: 'relationship', sort: 2 },
			{ id: '3', nameDE: 'Sicherheit', nameEN: 'Safety', category: 'physical', sort: 3 },
			{ id: '4', nameDE: 'Autonomie', nameEN: 'Autonomy', category: 'personal', sort: 4 },
			{ id: '5', nameDE: 'Respekt', nameEN: 'Respect', category: 'relationship', sort: 5 },
			{ id: '6', nameDE: 'Gerechtigkeit', nameEN: 'Justice', category: 'social', sort: 6 },
			{ id: '7', nameDE: 'Kreativität', nameEN: 'Creativity', category: 'personal', sort: 7 },
			{ id: '8', nameDE: 'Ruhe', nameEN: 'Peace', category: 'personal', sort: 8 },
			{ id: '9', nameDE: 'Spaß', nameEN: 'Fun', category: 'personal', sort: 9 },
			{ id: '10', nameDE: 'Wachstum', nameEN: 'Growth', category: 'personal', sort: 10 },
		];
		return c.json(needs);
	} catch (error) {
		console.error('Error getting needs:', error);
		return c.json({ error: 'Failed to get needs' }, 500);
	}
});

// POST /api/ai/bullshift/analyzeChat - Analyze a completed chat session
bullshift.post('/analyzeChat', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const body = await c.req.json();
		const { chatId, locale = 'de', initialPath = 'idle' } = body;

		if (!chatId) {
			return c.json({ error: 'chatId is required' }, 400);
		}

		console.log('analyzeChat called for chat:', chatId, 'user:', user.id);

		// Step 1: Analyze the chat
		const result = await analyzeChat(chatId, user.id, locale);
		console.log('Analysis completed with ID:', result.id);

		// Step 2: Initialize a new chat session for the user
		const pathId = initialPath || 'idle';
		const pathState: PathState = {
			activePath: pathId,
			pathHistory: [pathId],
			startedAt: Date.now()
		};

		const pathMarker = createPathMarker('path_start', pathId);

		const initialHistory: HistoryEntry[] = [
			{
				role: 'user',
				parts: [{ text: '[System: Chat initialisiert]' }],
				timestamp: Date.now(),
				hidden: true
			},
			{
				role: 'model',
				parts: [{ text: '' }],
				timestamp: Date.now(),
				pathMarker
			}
		];

		if (pathId === 'idle') {
			const welcomeMessage1 = `Ich begleite dich dabei, schwierige Situationen zu erforschen – ob Streit mit einer wichtigen Person oder ein innerer Konflikt, bei dem du hin- und hergerissen bist.<br/><br/>Es geht dabei nicht um Tipps oder fertige Lösungen, sondern ich helfe dir, deine eigenen Gefühle und Gedanken zu sortieren. So findest du selbst heraus, was dir wichtig ist.<br/><br/>Manchmal schauen wir gemeinsam auf deine Sicht, manchmal auf die Perspektive der anderen Person. Wichtig ist: Du kannst hier nichts falsch machen. Alles, was dich bewegt, hat hier seinen Platz. <br/><br/>Und deine Gespräche bleiben natürlich privat und sicher – sie gehören nur dir.`;
			const welcomeMessage2 = `Was kann ich heute für Dich tun?`;

			initialHistory.push({
				role: 'model',
				parts: [{ text: welcomeMessage1 }],
				timestamp: Date.now()
			});
			initialHistory.push({
				role: 'model',
				parts: [{ text: welcomeMessage2 }],
				timestamp: Date.now()
			});
		}

		const encryptedHistory = encryptChatHistory(initialHistory);

		const newChatRecord = await db.insert(chatsTable).values({
			id: crypto.randomUUID(),
			userId: user.id,
			module: 'bullshift',
			history: JSON.stringify(encryptedHistory),
			pathState: JSON.stringify(pathState)
		}).returning();

		console.log('Created new chat record:', newChatRecord[0].id);

		// Fetch full user record with preferences
		const userWithPreferences = await db
			.select({
				id: userTable.id,
				firstName: userTable.firstName,
				aiAnswerLength: userTable.aiAnswerLength,
				toneOfVoice: userTable.toneOfVoice,
				nvcKnowledge: userTable.nvcKnowledge,
			})
			.from(userTable)
			.where(eq(userTable.id, user.id))
			.limit(1);

		const userContext = userWithPreferences[0] || user;

		const systemInstruction = getSystemPromptForPath(pathId, userContext);

		// Step 3: Extract memories from the analyzed chat (pass the specific chatId)
		console.log('🧠 Triggering memory extraction for chat:', chatId);
		try {
			const memoryResult = await extractMemories(user.id, locale, chatId);
			console.log('✅ Memory extraction completed, result:', memoryResult);
		} catch (memError) {
			console.error('❌ Memory extraction failed:', memError);
			console.error('❌ Memory extraction error details:', {
				message: memError instanceof Error ? memError.message : String(memError),
				stack: memError instanceof Error ? memError.stack : undefined
			});
			// Don't fail the whole request if memory extraction fails
		}

		// Return both the analysis and the new chat session
		return c.json({
			initiatedChat: {
				chatId: newChatRecord[0].id,
				systemInstruction,
				activePath: pathId,
				pathState,
				history: initialHistory
			},
			analysis: {
				id: result.id,
				...result.analysis
			}
		});

	} catch (error) {
		console.error('Error analyzing chat:', error);
		const errorMessage = error instanceof Error ? error.message : 'Failed to analyze chat';
		return c.json({ error: errorMessage }, 500);
	}
});

// PUT /api/ai/bullshift/updateHistory - Update chat history (for reopening chats)
bullshift.put('/updateHistory', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const body = await c.req.json();
		const { chatId, history, pathState } = body;

		if (!chatId || !history) {
			return c.json({ error: 'chatId and history are required' }, 400);
		}

		console.log('updateHistory called for chat:', chatId);

		// Verify chat belongs to user
		const chatRecord = await db.select().from(chatsTable)
			.where(eq(chatsTable.id, chatId))
			.limit(1);

		if (!chatRecord || chatRecord.length === 0) {
			return c.json({ error: 'Chat not found' }, 404);
		}

		if (chatRecord[0].userId !== user.id) {
			return c.json({ error: 'Unauthorized' }, 403);
		}

		// Encrypt and save the history
		const encryptedHistory = encryptChatHistory(history);
		const updateData: any = {
			history: JSON.stringify(encryptedHistory),
			updated: new Date().toISOString()
		};

		if (pathState) {
			updateData.pathState = JSON.stringify(pathState);
		}

		await db.update(chatsTable)
			.set(updateData)
			.where(eq(chatsTable.id, chatId));

		console.log('Chat history updated for chat:', chatId);

		return c.json({ success: true });

	} catch (error) {
		console.error('Error updating chat history:', error);
		const errorMessage = error instanceof Error ? error.message : 'Failed to update chat history';
		return c.json({ error: errorMessage }, 500);
	}
});

// POST /api/ai/bullshift/extractMemories - Extract memories from unprocessed chats
bullshift.post('/extractMemories', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const body = await c.req.json().catch(() => ({}));
		const { locale = 'de', chatId } = body;

		console.log('extractMemories called for user:', user.id);

		// Call the extractMemories function
		const success = await extractMemories(user.id, locale, chatId);

		return c.json({ success });

	} catch (error) {
		console.error('Error extracting memories:', error);
		const errorMessage = error instanceof Error ? error.message : 'Failed to extract memories';
		return c.json({ error: errorMessage }, 500);
	}
});

export default bullshift;
