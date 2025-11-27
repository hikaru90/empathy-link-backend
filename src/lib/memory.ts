/**
 * Memory system with vector embeddings for semantic search
 * Based on empathy-link implementation
 */

import { GoogleGenAI } from '@google/genai';
import { db } from './db.js';
import { memories } from '../../drizzle/schema.js';
import { sql, desc, and, eq, inArray } from 'drizzle-orm';
import 'dotenv/config';

// Initialize Gemini client for embeddings
let genaiClient: GoogleGenAI | null = null;

function getGenAIClient(): GoogleGenAI {
	if (!genaiClient) {
		const apiKey = process.env.GEMINI_API_KEY;
		if (!apiKey) {
			throw new Error('GEMINI_API_KEY environment variable is required');
		}
		genaiClient = new GoogleGenAI({ apiKey });
	}
	return genaiClient;
}

// Memory type configuration
export const MEMORY_CONFIG = {
	core_identity: { priority: 1.0, expiryDays: null }, // Never expires
	patterns: { priority: 0.8, expiryDays: 365 }, // 1 year
	preferences: { priority: 0.6, expiryDays: 180 }, // 6 months
	episodic: { priority: 0.4, expiryDays: 90 }, // 3 months
	contextual: { priority: 0.2, expiryDays: 30 } // 1 month
} as const;

export type MemoryType = keyof typeof MEMORY_CONFIG;

export interface Memory {
	id: string;
	userId: string;
	confidence: string;
	type: string;
	priority: number;
	key: string | null;
	value: string;
	personName: string | null;
	embedding: unknown;
	chatId: string | null;
	relevanceScore: number;
	accessCount: number;
	lastAccessed: string | null;
	expiresAt: string | null;
	created: string;
	updated: string;
}

/**
 * Generate text embedding using Gemini
 */
export async function generateEmbedding(text: string): Promise<number[]> {
	try {
		const genai = getGenAIClient();

		const response = await genai.models.embedContent({
			model: 'text-embedding-004',
			contents: text,
		});

		if (!response.embeddings || response.embeddings.length === 0) {
			throw new Error('No embeddings returned from API');
		}

		const values = response.embeddings[0].values;
		if (!values || !Array.isArray(values)) {
			throw new Error('No embedding values returned from API');
		}

		return values as number[];
	} catch (error) {
		console.error('Embedding generation failed:', error);
		throw new Error('Failed to generate embedding');
	}
}

/**
 * Classify memory type based on content
 */
export function classifyMemoryType(summary: string): MemoryType {
	const text = summary.toLowerCase();

	// Core identity patterns
	if (text.includes('personality') || text.includes('character') || text.includes('identity') ||
		text.includes('persönlichkeit') || text.includes('identität') ||
		text.includes('core belief') || text.includes('value') || text.includes('fundamental')) {
		return 'core_identity';
	}

	// Pattern recognition
	if (text.includes('pattern') || text.includes('tends to') || text.includes('usually') ||
		text.includes('often') || text.includes('repeatedly') || text.includes('habit') ||
		text.includes('muster') || text.includes('gewohnheit') || text.includes('meistens')) {
		return 'patterns';
	}

	// Preferences
	if (text.includes('prefers') || text.includes('likes') || text.includes('dislikes') ||
		text.includes('enjoys') || text.includes('hates') || text.includes('favorite') ||
		text.includes('bevorzugt') || text.includes('mag') || text.includes('liebt') || text.includes('hasst')) {
		return 'preferences';
	}

	// Recent context
	if (text.includes('currently') || text.includes('today') || text.includes('recently') ||
		text.includes('right now') || text.includes('this week') ||
		text.includes('derzeit') || text.includes('heute') || text.includes('kürzlich')) {
		return 'contextual';
	}

	// Default to episodic for specific events
	return 'episodic';
}

/**
 * Get expiry date based on memory type
 */
export function getExpiryDate(memoryType: MemoryType): Date | null {
	const config = MEMORY_CONFIG[memoryType];
	if (config.expiryDays === null) {
		return null; // Never expires
	}

	const expiryDate = new Date();
	expiryDate.setDate(expiryDate.getDate() + config.expiryDays);
	return expiryDate;
}

/**
 * Search for top-k most similar memories for chat context
 */
export async function searchSimilarMemories(
	text: string,
	userId: string,
	k: number = 5
): Promise<Array<Memory & { similarity: number }>> {
	try {
		console.log(`🔍 Searching for ${k} similar memories for user: ${userId}`);

		// Generate embedding for the search text
		const embedding = await generateEmbedding(text);

		// Search for similar memories using vector similarity
		const results = await db.execute(sql`
			SELECT *,
				   1 - (embedding <-> ${JSON.stringify(embedding)}::vector) as similarity
			FROM memories
			WHERE user_id = ${userId}
			AND (expires_at IS NULL OR expires_at > NOW())
			ORDER BY embedding <-> ${JSON.stringify(embedding)}::vector
			LIMIT ${k}
		`);

		// Update access_count and last_accessed for retrieved memories
		const resultRows = Array.isArray(results) ? results : (results.rows || []);
		
		console.log(`📝 Found ${resultRows.length} similar memories`);
		const memoryIds = resultRows.map((r: any) => r.id).filter((id: any) => id);

		if (memoryIds.length > 0) {
			await db.update(memories)
				.set({
					accessCount: sql`access_count + 1`,
					lastAccessed: new Date().toISOString()
				})
				.where(inArray(memories.id, memoryIds));
			console.log('✅ Updated access count for retrieved memories');
		}

		return resultRows.map((result: any) => ({
			...result,
			similarity: result.similarity || 0
		}));

	} catch (error) {
		console.error('Error searching similar memories:', error);
		return [];
	}
}

/**
 * Check for similar existing memories to prevent duplication
 */
export async function findSimilarMemory(
	embedding: number[],
	userId: string,
	threshold: number = 0.9
): Promise<Memory | null> {
	try {
		const results = await db.execute(sql`
			SELECT *,
				   1 - (embedding <-> ${JSON.stringify(embedding)}::vector) as similarity
			FROM memories
			WHERE user_id = ${userId}
			AND (expires_at IS NULL OR expires_at > NOW())
			ORDER BY embedding <-> ${JSON.stringify(embedding)}::vector
			LIMIT 1
		`);

		const resultRows = Array.isArray(results) ? results : (results.rows || []);
		if (resultRows.length === 0) return null;

		const memory = resultRows[0] as any;
		const similarity = memory.similarity || 0;

		return similarity >= threshold ? (memory as Memory) : null;
	} catch (error) {
		console.error('Error finding similar memory:', error);
		return null;
	}
}

/**
 * Merge similar memories
 */
export async function mergeMemories(existingMemory: Memory, newSummary: string): Promise<void> {
	try {
		const mergedValue = `${existingMemory.value}. ${newSummary}`;
		const newEmbedding = await generateEmbedding(mergedValue);

		await db.execute(sql`
			UPDATE memories
			SET
				value = ${mergedValue},
				embedding = ${JSON.stringify(newEmbedding)}::vector,
				access_count = ${existingMemory.accessCount + 1},
				updated = NOW()
			WHERE id = ${existingMemory.id}
		`);

		console.log(`✅ Merged memory ${existingMemory.id}`);
	} catch (error) {
		console.error('Error merging memories:', error);
		throw error;
	}
}

/**
 * Create a new memory with deduplication
 */
export async function createMemory(
	userId: string,
	summary: string,
	chatId?: string,
	confidence: string = 'medium'
): Promise<Memory | null> {
	try {
		console.log(`💾 Creating memory for user ${userId}: "${summary.substring(0, 50)}..."`);

		const embedding = await generateEmbedding(summary);

		// Check for duplicates
		const existingMemory = await findSimilarMemory(embedding, userId, 0.85);
		if (existingMemory) {
			console.log(`🔄 Found similar memory, merging instead of creating new`);
			await mergeMemories(existingMemory, summary);
			return existingMemory;
		}

		const memoryType = classifyMemoryType(summary);
		const priority = MEMORY_CONFIG[memoryType].priority;
		const expiryDate = getExpiryDate(memoryType);

		// Use raw SQL to insert with proper vector conversion
		const result = await db.execute(sql`
			INSERT INTO memories (
				user_id, confidence, type, priority, key, value, embedding,
				chat_id, relevance_score, access_count, expires_at
			) VALUES (
				${userId}, ${confidence}, ${memoryType}, ${priority}, '',
				${summary}, ${JSON.stringify(embedding)}::vector, ${chatId || null},
				1.0, 0, ${expiryDate ? expiryDate.toISOString() : null}
			) RETURNING *
		`);

		const resultRows = Array.isArray(result) ? result : (result.rows || []);
		if (!resultRows || resultRows.length === 0) {
			throw new Error('No rows returned from insert query');
		}

		console.log(`✅ Created ${memoryType} memory with ID ${(resultRows[0] as any).id}`);
		return resultRows[0] as Memory;
	} catch (error) {
		console.error('Error creating memory:', error);
		throw error;
	}
}

/**
 * Format memories for AI prompt injection
 */
export function formatMemoriesForPrompt(memories: Array<Memory & { similarity?: number }>): string {
	if (memories.length === 0) return '';

	const formattedMemories = memories
		.sort((a, b) => b.priority - a.priority) // Sort by priority
		.map(memory => {
			const type = memory.type.replace('_', ' ').toUpperCase();
			const accessInfo = memory.accessCount > 1 ? ` (erwähnt ${memory.accessCount}x)` : '';
			return `- [${type}] ${memory.value}${accessInfo}`;
		});

	return `Relevante Erinnerungen über diesen Nutzer:\n${formattedMemories.join('\n')}\n`;
}

/**
 * Get all memories for a user
 */
export async function getUserMemories(userId: string, limit: number = 50): Promise<Memory[]> {
	try {
		const results = await db
			.select()
			.from(memories)
			.where(
				and(
					eq(memories.userId, userId),
					sql`(expires_at IS NULL OR expires_at > NOW())`
				)
			)
			.orderBy(desc(memories.priority), desc(memories.accessCount))
			.limit(limit);

		return results as Memory[];
	} catch (error) {
		console.error('Error getting user memories:', error);
		return [];
	}
}

/**
 * Delete a memory
 */
export async function deleteMemory(memoryId: string, userId: string): Promise<boolean> {
	try {
		await db
			.delete(memories)
			.where(and(eq(memories.id, memoryId), eq(memories.userId, userId)));

		console.log(`🗑️ Deleted memory ${memoryId}`);
		return true;
	} catch (error) {
		console.error('Error deleting memory:', error);
		return false;
	}
}
