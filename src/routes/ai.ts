import { Hono } from 'hono';
import type { Context } from 'hono';
import { getAiClient } from '../lib/gemini.js';

const ai = new Hono();

// POST /api/ai/check-judgement - Check text for judgement
ai.post('/check-judgement', async (c: Context) => {
	let lang = 'de';
	try {
		const body = await c.req.json();
		const { text } = body;
		lang = body.lang || 'de';

		console.log('text', text);
		console.log('lang', lang);

		// TODO: Initialize AI model (Gemini or other)
		// const safetySettings = [
		//   { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
		//   { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
		// ];
		//
		// const chatSession = ai.chats.create({
		//   model: "gemini-2.5-flash",
		//   config: {
		//     temperature: 0,
		//     topP: 0.95,
		//     topK: 64,
		//     maxOutputTokens: 8192,
		//     responseMimeType: "text/plain",
		//     safetySettings,
		//   },
		//   history: [],
		// });
		//
		// const result = await chatSession.sendMessage(text);
		// const resultText = result.text;

		return c.json({ result: 'placeholder' }); // TODO: Use resultText
	} catch (error) {
		console.error('Error checking for judgment:', error);
		return c.json({
			error: 'Failed to check for judgment.',
			result: lang === 'en'
				? 'Your observation might contain a judgement. Please make sure to keep to the facts and be as neutral as possible.'
				: 'Deine Beobachtung enthält wahrscheinlich ein Urteil. Sei bitte so objektiv wie möglich bei der Beschreibung der Situation.'
		}, 200);
	}
});

// POST /api/ai/selfempathy/init-chat - Initialize self-empathy chat
ai.post('/selfempathy/init-chat', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const { history, systemInstruction } = await c.req.json();

		// TODO: Check if chat already exists in database
		// const chatInDb = await db.select().from(chatsTable)
		//   .where(and(
		//     eq(chatsTable.user, user.id),
		//     eq(chatsTable.module, 'selfempathy')
		//   ))
		//   .limit(1);

		// if (!chatInDb || chatInDb.length === 0) {
		//   // Initialize new chat with AI
		//   const chat = await initModel(user, systemInstruction);
		//   const newChatInDb = await db.insert(chatsTable).values({
		//     user: user.id,
		//     module: 'selfempathy',
		//     history: chat.history || []
		//   }).returning();
		//
		//   // Save chat in memory
		//   selfempathyChats.set(newChatInDb[0].id, chat);
		//
		//   // Send initial greeting
		//   await sendMessage(newChatInDb[0].id, chat, 'Please greet the user and ask for the current state of mind.', []);
		//
		//   return c.json({ record: newChatInDb[0] });
		// } else {
		//   // Load existing chat
		//   const chat = await initModel(user, systemInstruction, chatInDb[0].history);
		//   selfempathyChats.set(chatInDb[0].id, chat);
		//
		//   return c.json({ record: chatInDb[0] });
		// }

		return c.json({ record: null }); // TODO: Use actual record
	} catch (error) {
		console.error('error in initChat', error);
		return c.json({ error: 'Failed to initialize chat' }, 500);
	}
});

// POST /api/ai/selfempathy/send-message - Send message in self-empathy chat
ai.post('/selfempathy/send-message', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const { message, history, chatId } = await c.req.json();

		// TODO: Get chat from memory
		// let chat = selfempathyChats.get(chatId);
		//
		// if (!chat) {
		//   return c.json({ error: 'Chat not found' }, 404);
		// }
		//
		// // Remove timestamps from history
		// chat = removeTimestamp(chat);
		//
		// const responseJson = await sendMessage(chatId, chat, message, history);

		return c.json({ response: null }); // TODO: Use responseJson
	} catch (error) {
		console.error('Chat error:', error);
		return c.json({ message: 'Failed to process message', error }, 500);
	}
});

// POST /api/ai/test-conversation-quality - Test conversation quality
ai.post('/test-conversation-quality', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const testData = await c.req.json();

		// TODO: Implement conversation quality testing logic
		// This would involve:
		// 1. Running test scenarios
		// 2. Evaluating AI responses
		// 3. Scoring conversation quality
		// 4. Storing results

		return c.json({
			message: 'Test not implemented',
			testData
		});
	} catch (error) {
		console.error('Error testing conversation quality:', error);
		return c.json({ error: 'Failed to test conversation quality' }, 500);
	}
});

// POST /api/ai/update-prompt-scores - Update prompt scores
ai.post('/update-prompt-scores', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const { promptId, score } = await c.req.json();

		// TODO: Update prompt scores in database
		// await db.update(promptsTable)
		//   .set({ score })
		//   .where(eq(promptsTable.id, promptId));

		return c.json({ success: true });
	} catch (error) {
		console.error('Error updating prompt scores:', error);
		return c.json({ error: 'Failed to update prompt scores' }, 500);
	}
});

// POST /api/ai/learn/askQuestion - Ask AI a question based on user's answer
ai.post('/learn/askQuestion', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const { question, userAnswer, systemPrompt } = await c.req.json();

		if (!question || !userAnswer || !systemPrompt) {
			return c.json({ error: 'Missing required fields' }, 400);
		}

		console.log('systemPrompt', systemPrompt);

		const ai = getAiClient();
		const chat = ai.chats.create({
			model: 'gemini-2.5-flash',
			config: {
				systemInstruction: systemPrompt,
				temperature: 0.7,
				maxOutputTokens: 4000,
			}
		});

		const prompt = `Question: ${question}\n\nUser's Answer: ${userAnswer}`;
		
		const result = await chat.sendMessage({ message: prompt });
		const response = result.text;

		if (!response) {
			throw new Error('No response from AI');
		}

		return c.json({ response });
	} catch (error) {
		console.error('Error in AI question endpoint:', error);
		return c.json({ error: 'Failed to process question' }, 500);
	}
});

// POST /api/ai/learn/feelingsDetective - Feelings Detective AI reflection or summary
ai.post('/learn/feelingsDetective', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const body = await c.req.json();
		const { step, situation, thoughts, feelings } = body;

		console.log('FeelingsDetective API request:', { 
			step, 
			situation: !!situation, 
			thoughts: !!thoughts, 
			feelings: Array.isArray(feelings) ? feelings.length : feelings 
		});

		if (!step) {
			return c.json({ error: 'Missing step parameter' }, 400);
		}

		let systemPrompt = '';
		let prompt = '';

		if (step === 'reflection') {
			if (!situation) {
				return c.json({ error: 'Missing situation for reflection step' }, 400);
			}

			systemPrompt = `Du bist ein einfühlsamer Begleiter, der Menschen hilft, ihre Situationen ohne Bewertung zu reflektieren. 
Deine Aufgabe ist es, die geschilderte Situation neutral und verständnisvoll wiederzugeben, ohne Urteile zu fällen oder Ratschläge zu geben.
Konzentriere dich darauf, die Situation objektiv zu spiegeln und zu validieren, was die Person erlebt hat.
Verwende eine warme, verständnisvolle Sprache und bleibe bei den Fakten der geschilderten Situation.`;

			prompt = `Situation: ${situation}

Bitte spiegele diese Situation neutral und verständnisvoll wider, ohne Bewertungen oder Ratschläge.`;

		} else if (step === 'summary') {
			if (!situation || !thoughts || feelings === undefined || feelings === null) {
				const errorDetails = { 
					situation: !!situation, 
					thoughts: !!thoughts, 
					feelings: feelings,
					situationType: typeof situation,
					thoughtsType: typeof thoughts,
					feelingsType: typeof feelings
				};
				console.log('Validation failed:', errorDetails);
				return c.json({ error: 'Missing required fields for summary step', details: errorDetails }, 400);
			}

			systemPrompt = `Du bist ein experte für gewaltfreie kommunikation. Du existierst in dem Lernmodul "Wie fühlst du dich eigentlich? Gefühle erkennen
". Du erstellst eine zusammenfassung für den letzten Schritt einer lern-session die "Gefühlsdtektiv" heißt. Es geht darum dem nutzer zu erklären, dass es sinnvoll ist, sich mit seinen gefühlen auseinander zu setzen. Er musste dafür eine schwierige situation beschreiben und gedanken oder urteile die er im kopf hatte schildern. danach sollte er sich mit seinen gefühlen auseinander setzen und aus einer liste gefühle aussuchen die er oder sie hatte. Deine Aufgabe ist es, eine zusammenfassung zu erstellen, die dem nutzer hilft, den sinn und mehrwert der auseinandersetzung mit seinen gefühlen zu verstehen. Du redest direkt mit dem nutzer. Antworte nur mit unformattiertem text. Ohne begrüßung oder abschluss. Du bist der letzte schritt in einem mehrstufigen prozess. Du kannst Bedürfnisse erwähnen, aber fokussiere dich in der antwort auf die gefühle. Bitte gib dem Nutzer keine Aufgaben, mit deiner antwort ist das lernmodul abgeschlossen.`;

			const feelingsText = Array.isArray(feelings) && feelings.length > 0 
				? feelings.join(', ') 
				: Array.isArray(feelings) && feelings.length === 0
					? 'Keine spezifischen Gefühle ausgewählt'
					: String(feelings || 'Nicht angegeben');

			prompt = `Situation: ${situation}

Gedanken und Urteile: ${thoughts}

Gefühle: ${feelingsText}

Erstelle eine einfühlsame Zusammenfassung dieser Selbstreflexion, die der Person hilft, ihre Erfahrung mit Mitgefühl zu verstehen.`;

		} else {
			return c.json({ error: 'Invalid step parameter' }, 400);
		}

		const aiClient = getAiClient();
		const chat = aiClient.chats.create({
			model: 'gemini-2.5-flash',
			config: {
				systemInstruction: systemPrompt,
				temperature: 0.7,
				maxOutputTokens: 8192,
			}
		});

		console.log('Sending message to Gemini:', prompt.substring(0, 100) + '...');
		const result = await chat.sendMessage({ message: prompt });
		console.log('Gemini result:', result);

		// Extract text from the response - handle both direct text and candidates structure
		let response = result.text;

		// If result.text is undefined, try to extract from candidates
		if (!response && result.candidates && result.candidates.length > 0) {
			const candidate = result.candidates[0];
			if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
				response = candidate.content.parts[0].text;
			}
		}

		// Additional fallback: try to extract from response object directly
		if (!response && (result as any).response?.candidates?.[0]?.content?.parts?.[0]?.text) {
			response = (result as any).response.candidates[0].content.parts[0].text;
		}

		console.log('Extracted text:', response);

		if (!response || response.trim() === '') {
			console.error('Empty response from Gemini. Full result:', JSON.stringify(result, null, 2));
			console.error('Finish reason:', result.candidates?.[0]?.finishReason);

			// Provide specific error messages based on finish reason
			if (result.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
				throw new Error('AI response was cut off due to length limit. Please try again.');
			}

			throw new Error('No response from AI');
		}

		return c.json({ response });
	} catch (error) {
		console.error('Error in FeelingsDetective endpoint:', error);
		return c.json({ error: 'Failed to process request' }, 500);
	}
});

// POST /api/ai/learn/needsDetective - Needs Detective AI reflection or summary
ai.post('/learn/needsDetective', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const body = await c.req.json();
		const { step, situation, thoughts, needs } = body;

		console.log('NeedsDetective API request:', {
			step,
			situation: !!situation,
			thoughts: !!thoughts,
			needs: !!needs,
		});

		if (!step) {
			return c.json({ error: 'Missing step parameter' }, 400);
		}

		let systemPrompt = '';
		let prompt = '';

		if (step === 'reflection') {
			if (!situation) {
				return c.json({ error: 'Missing situation for reflection step' }, 400);
			}

			const thoughtsText = thoughts ?? situation;

			systemPrompt = `Du bist ein einfühlsamer Begleiter, der Menschen hilft, ihre Situationen und Strategien ohne Bewertung zu reflektieren.
Deine Aufgabe ist es, die geschilderte Situation und Strategie neutral und verständnisvoll wiederzugeben, ohne Urteile zu fällen oder Ratschläge zu geben.
Konzentriere dich darauf, die Situation objektiv zu spiegeln und zu validieren, was die Person erlebt hat.
Verwende eine warme, verständnisvolle Sprache und bleibe bei den Fakten der geschilderten Situation.`;

			prompt = `Situation: ${situation}

Gedanken/Strategie: ${thoughtsText}

Bitte spiegele diese Situation neutral und verständnisvoll wider, ohne Bewertungen oder Ratschläge.`;

		} else if (step === 'summary') {
			if (!situation || !thoughts || !needs) {
				return c.json({ error: 'Missing required fields for summary step (situation, thoughts, needs)' }, 400);
			}

			systemPrompt = `Du bist ein Experte für gewaltfreie Kommunikation. Du existierst in dem Lernmodul "Bedürfnis-Detektiv".
Du erstellst eine Zusammenfassung für den letzten Schritt einer Lern-Session. Es geht darum, dem Nutzer zu erklären, dass es sinnvoll ist, sich mit seinen Bedürfnissen auseinanderzusetzen.
Der Nutzer hat eine schwierige Situation beschrieben, seine Gedanken oder Strategien geschildert und seine Bedürfnisse identifiziert.
Deine Aufgabe ist es, eine einfühlsame Zusammenfassung zu erstellen, die dem Nutzer hilft, den Sinn und Mehrwert der Auseinandersetzung mit seinen Bedürfnissen zu verstehen.
Du redest direkt mit dem Nutzer. Antworte nur mit unformattiertem Text. Ohne Begrüßung oder Abschluss.
Bitte gib dem Nutzer keine Aufgaben – mit deiner Antwort ist das Lernmodul abgeschlossen.`;

			prompt = `Situation: ${situation}

Gedanken/Strategie: ${thoughts}

Bedürfnisse: ${needs}

Erstelle eine einfühlsame Zusammenfassung dieser Selbstreflexion, die der Person hilft, ihre Erfahrung und die Verbindung zu ihren Bedürfnissen mit Mitgefühl zu verstehen.`;

		} else {
			return c.json({ error: 'Invalid step parameter' }, 400);
		}

		const aiClient = getAiClient();
		const chat = aiClient.chats.create({
			model: 'gemini-2.5-flash',
			config: {
				systemInstruction: systemPrompt,
				temperature: 0.7,
				maxOutputTokens: 8192,
			},
		});

		console.log('NeedsDetective: Sending message to Gemini:', prompt.substring(0, 100) + '...');
		const result = await chat.sendMessage({ message: prompt });

		let response = result.text;

		if (!response && result.candidates && result.candidates.length > 0) {
			const candidate = result.candidates[0];
			if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
				response = candidate.content.parts[0].text;
			}
		}

		if (!response && (result as any).response?.candidates?.[0]?.content?.parts?.[0]?.text) {
			response = (result as any).response.candidates[0].content.parts[0].text;
		}

		if (!response || response.trim() === '') {
			if (result.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
				throw new Error('AI response was cut off due to length limit. Please try again.');
			}
			throw new Error('No response from AI');
		}

		return c.json({ response });
	} catch (error) {
		console.error('Error in NeedsDetective endpoint:', error);
		return c.json({ error: 'Failed to process request' }, 500);
	}
});

// POST /api/ai/learn/needsRubiksCube - Transform sentence into underlying needs
ai.post('/learn/needsRubiksCube', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const body = await c.req.json();
		const { sentence, instruction } = body;

		if (!sentence || typeof sentence !== 'string') {
			return c.json({ error: 'Missing sentence parameter' }, 400);
		}

		const inst = instruction || 'Transformiere diesen Satz in die zugrunde liegenden Bedürfnisse.';
		const systemPrompt = `Du bist ein Experte für gewaltfreie Kommunikation. Deine Aufgabe ist es, Sätze in die zugrunde liegenden Bedürfnisse zu übersetzen.
Der Nutzer gibt einen schwierigen Satz ein (z.B. etwas, das er gehört hat). Antworte NUR mit einer JSON-Liste von Bedürfnissen als Array.
Beispiel: ["Verständnis", "Respekt", "Wertschätzung"]
Antworte ausschließlich mit dem JSON-Array, keine zusätzlichen Erklärungen.`;

		const prompt = `${inst}\n\nSatz: ${sentence.trim()}`;

		const aiClient = getAiClient();
		const chat = aiClient.chats.create({
			model: 'gemini-2.5-flash',
			config: {
				systemInstruction: systemPrompt,
				temperature: 0.5,
				maxOutputTokens: 1024,
			},
		});

		const result = await chat.sendMessage({ message: prompt });
		let response = result.text;

		if (!response && result.candidates && result.candidates.length > 0) {
			const candidate = result.candidates[0];
			if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
				response = candidate.content.parts[0].text;
			}
		}

		if (!response || response.trim() === '') {
			throw new Error('No response from AI');
		}

		// Parse JSON array from response (may be wrapped in markdown code blocks)
		let needs: string[] = [];
		const trimmed = response.trim();
		const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
		if (jsonMatch) {
			try {
				needs = JSON.parse(jsonMatch[0]);
				if (!Array.isArray(needs)) needs = [];
			} catch {
				needs = trimmed.split(/[,\n]/).map((s) => s.replace(/^["'\s\-•]+|["'\s\-•]+$/g, '').trim()).filter(Boolean);
			}
		}

		return c.json({ needs });
	} catch (error) {
		console.error('Error in needsRubiksCube endpoint:', error);
		return c.json({ error: 'Failed to transform sentence into needs' }, 500);
	}
});

export default ai;
