import { db } from './db.js';
import { tokenUsage, roleSettings } from '../../drizzle/schema.js';
import { type InferInsertModel } from 'drizzle-orm';
import { and, eq, sum, gte } from 'drizzle-orm';

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

/** Start of today in UTC (ISO string for DB comparison). */
function startOfTodayUTC(): string {
	const d = new Date();
	d.setUTCHours(0, 0, 0, 0);
	return d.toISOString();
}

/** Get daily token limit for a role from DB. Default 100000 if role not found. */
export async function getTokenLimitForRole(role: string): Promise<number> {
	const normalizedRole = (role || 'user').toLowerCase();
	const row = await db
		.select({ dailyTokenLimit: roleSettings.dailyTokenLimit })
		.from(roleSettings)
		.where(eq(roleSettings.role, normalizedRole))
		.limit(1);
	return row[0]?.dailyTokenLimit ?? 100_000;
}

/** Get total tokens used by user today (UTC). */
export async function getUserTokenUsageToday(userId: string): Promise<number> {
	const start = startOfTodayUTC();
	const result = await db
		.select({ total: sum(tokenUsage.totalTokens) })
		.from(tokenUsage)
		.where(and(eq(tokenUsage.userId, userId), gte(tokenUsage.created, start)));
	const total = result[0]?.total;
	return Number(total ?? 0);
}

/** Check if user can use more tokens today. Returns allowed, usedToday, and limit. */
export async function canUseTokens(
	userId: string,
	role: string = 'user',
	estimatedAdditional: number = 0
): Promise<{ allowed: boolean; usedToday: number; limit: number }> {
	const [usedToday, limit] = await Promise.all([
		getUserTokenUsageToday(userId),
		getTokenLimitForRole(role),
	]);
	const allowed = usedToday + estimatedAdditional <= limit;
	return { allowed, usedToday, limit };
}
