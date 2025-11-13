import { Hono } from 'hono';
import type { Context } from 'hono';

const ai = new Hono();

// POST /api/ai/check-judgement - Check text for judgement
ai.post('/check-judgement', async (c: Context) => {
	try {
		const { text, lang } = await c.req.json();

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

export default ai;
