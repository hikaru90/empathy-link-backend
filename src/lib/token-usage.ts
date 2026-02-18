import { db } from './db.js';
import { tokenUsage } from '../../drizzle/schema.js';
import { type InferInsertModel } from 'drizzle-orm';

// Pricing per 1M tokens (as of Feb 2025, adjust as needed)
// Using Gemini 1.5 Flash pricing as baseline if not specified
const PRICING = {
	'gemini-2.0-flash-lite-preview-02-05': { input: 0.10, output: 0.40 },
	'gemini-2.0-pro-exp-02-05': { input: 0.10, output: 0.40 }, // Using flash pricing placeholder
	'gemini-2.0-flash': { input: 0.10, output: 0.40 },
	'gemini-1.5-flash': { input: 0.075, output: 0.30 },
	'gemini-1.5-pro': { input: 3.50, output: 10.50 },
	'default': { input: 0.10, output: 0.40 }
};

type TokenUsageInsert = InferInsertModel<typeof tokenUsage>;

export async function trackTokenUsage(data: {
	userId?: string;
	chatId?: string;
	application?: string;
	context: string;
	model: string;
	inputTokens: number;
	outputTokens: number;
	metadata?: any;
}) {
	try {
		const modelPricing = PRICING[data.model as keyof typeof PRICING] || PRICING.default;
		
		// Calculate cost: (input * price + output * price) / 1,000,000
		const inputCost = (data.inputTokens * modelPricing.input) / 1_000_000;
		const outputCost = (data.outputTokens * modelPricing.output) / 1_000_000;
		const totalCost = inputCost + outputCost;

		const insertData: TokenUsageInsert = {
			userId: data.userId,
			chatId: data.chatId,
			application: data.application || 'web',
			context: data.context,
			model: data.model,
			inputTokens: data.inputTokens,
			outputTokens: data.outputTokens,
			totalTokens: data.inputTokens + data.outputTokens,
			cost: totalCost,
			metadata: data.metadata ? JSON.stringify(data.metadata) : null,
		};

		await db.insert(tokenUsage).values(insertData);
		console.log(`📊 Token usage tracked: ${data.inputTokens + data.outputTokens} tokens ($${totalCost.toFixed(6)})`);
	} catch (error) {
		// Don't fail the request if tracking fails, just log it
		console.error('Failed to track token usage:', error);
	}
}
