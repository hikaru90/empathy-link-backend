/**
 * NVC Knowledge Base with vector embeddings for semantic search
 * Supports internationalization (DE/EN) with separate embeddings per language
 */

import { GoogleGenAI } from '@google/genai';
import { db } from './db.js';
import { nvcKnowledge } from '../../drizzle/schema.js';
import { sql, desc, and, eq, or, inArray, like } from 'drizzle-orm';
import 'dotenv/config';
import { randomUUID } from 'crypto';

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

export interface NVCKnowledgeEntry {
	id: string;
	knowledgeId: string | null;
	language: 'de' | 'en';
	title: string;
	content: string;
	embedding: number[] | null;
	category: string;
	subcategory: string | null;
	source: string | null;
	tags: string[] | null;
	priority: number;
	isActive: boolean;
	createdBy: string | null;
	created: string;
	updated: string;
}

export interface CreateNVCKnowledgeInput {
	knowledgeId?: string | null; // For linking translations
	language: 'de' | 'en';
	title: string;
	content: string;
	category: string;
	subcategory?: string | null;
	source?: string | null;
	tags?: string[] | null;
	priority?: number;
	createdBy?: string | null;
	generateEmbedding?: boolean; // Default true
}

export interface SearchOptions {
	language?: 'de' | 'en';
	category?: string;
	limit?: number;
	minSimilarity?: number;
	tags?: string[];
}

/**
 * Generate embedding for NVC knowledge text
 */
export async function generateNVCEmbedding(
	text: string,
	language: 'de' | 'en' = 'de'
): Promise<number[]> {
	try {
		const ai = getGenAIClient();
		
		// Format text for better embedding quality
		const formattedText = `[NVC Knowledge ${language.toUpperCase()}] ${text}`;
		
		const response = await ai.models.embedContent({
			model: 'text-embedding-001',
			contents: formattedText
		});

		if (!response.embeddings || response.embeddings.length === 0 || !response.embeddings[0].values) {
			throw new Error('No embeddings returned from API');
		}

		return response.embeddings[0].values;
	} catch (error) {
		console.error('Embedding generation failed:', error);
		throw new Error('Failed to generate embedding');
	}
}

/**
 * Create a new NVC knowledge entry
 */
export async function createNVCKnowledgeEntry(
	input: CreateNVCKnowledgeInput
): Promise<NVCKnowledgeEntry> {
	try {
		console.log(`📝 Creating NVC knowledge entry: "${input.title}" (${input.language})`);

		// Generate embedding if requested (default true)
		const shouldGenerateEmbedding = input.generateEmbedding !== false;
		let embedding: number[] | null = null;

		if (shouldGenerateEmbedding) {
			const embeddingText = `${input.title}: ${input.content}`;
			embedding = await generateNVCEmbedding(embeddingText, input.language);
		}

		// Generate knowledgeId if not provided (for linking translations)
		const knowledgeId = input.knowledgeId || randomUUID();

		// Use raw SQL to insert with proper vector conversion
		// Handle embedding and tags with proper SQL formatting
		if (embedding) {
			const result = await db.execute(sql`
				INSERT INTO nvc_knowledge (
					knowledge_id, language, title, content, embedding,
					category, subcategory, source, tags, priority,
					is_active, created_by, created, updated
				) VALUES (
					${knowledgeId}::uuid, ${input.language}, ${input.title}, ${input.content},
					${JSON.stringify(embedding)}::vector,
					${input.category}, ${input.subcategory || null}, ${input.source || null},
					${input.tags ? sql.raw(`ARRAY[${input.tags.map(t => `'${t.replace(/'/g, "''")}'`).join(',')}]::text[]`) : sql`NULL`},
					${input.priority || 3}, true, ${input.createdBy || null},
					NOW(), NOW()
				) RETURNING *
			`);
			const resultRows = Array.isArray(result) ? result : (result.rows || []);
			if (!resultRows || resultRows.length === 0) {
				throw new Error('No rows returned from insert query');
			}
			const entry = resultRows[0] as any;
			console.log(`✅ Created NVC knowledge entry with ID ${entry.id}`);
			return {
				id: entry.id,
				knowledgeId: entry.knowledge_id,
				language: entry.language,
				title: entry.title,
				content: entry.content,
				embedding: entry.embedding,
				category: entry.category,
				subcategory: entry.subcategory,
				source: entry.source,
				tags: entry.tags,
				priority: entry.priority,
				isActive: entry.is_active,
				createdBy: entry.created_by,
				created: entry.created,
				updated: entry.updated
			};
		} else {
			// No embedding - use NULL
			const result = await db.execute(sql`
				INSERT INTO nvc_knowledge (
					knowledge_id, language, title, content, embedding,
					category, subcategory, source, tags, priority,
					is_active, created_by, created, updated
				) VALUES (
					${knowledgeId}::uuid, ${input.language}, ${input.title}, ${input.content},
					NULL,
					${input.category}, ${input.subcategory || null}, ${input.source || null},
					${input.tags ? sql.raw(`ARRAY[${input.tags.map(t => `'${t.replace(/'/g, "''")}'`).join(',')}]::text[]`) : sql`NULL`},
					${input.priority || 3}, true, ${input.createdBy || null},
					NOW(), NOW()
				) RETURNING *
			`);
			const resultRows = Array.isArray(result) ? result : (result.rows || []);
			if (!resultRows || resultRows.length === 0) {
				throw new Error('No rows returned from insert query');
			}
			const entry = resultRows[0] as any;
			return {
				id: entry.id,
				knowledgeId: entry.knowledge_id,
				language: entry.language,
				title: entry.title,
				content: entry.content,
				embedding: entry.embedding,
				category: entry.category,
				subcategory: entry.subcategory,
				source: entry.source,
				tags: entry.tags,
				priority: entry.priority,
				isActive: entry.is_active,
				createdBy: entry.created_by,
				created: entry.created,
				updated: entry.updated
			};
		}
	} catch (error) {
		console.error('Error creating NVC knowledge entry:', error);
		throw error;
	}
}

/**
 * Update an existing NVC knowledge entry
 */
export async function updateNVCKnowledgeEntry(
	id: string,
	updates: Partial<CreateNVCKnowledgeInput & { isActive?: boolean }>
): Promise<NVCKnowledgeEntry> {
	try {
		console.log(`📝 Updating NVC knowledge entry: ${id}`);

		// If content or title changed, regenerate embedding
		let embedding: number[] | null = null;
		if (updates.content || updates.title) {
			const existing = await getNVCKnowledgeEntry(id);
			if (!existing) {
				throw new Error('Entry not found');
			}
			const title = updates.title || existing.title;
			const content = updates.content || existing.content;
			const language = updates.language || existing.language;
			const embeddingText = `${title}: ${content}`;
			embedding = await generateNVCEmbedding(embeddingText, language);
		}

		// Build update object for drizzle
		const updateData: any = {
			updated: new Date().toISOString()
		};

		if (updates.title !== undefined) updateData.title = updates.title;
		if (updates.content !== undefined) updateData.content = updates.content;
		if (updates.category !== undefined) updateData.category = updates.category;
		if (updates.subcategory !== undefined) updateData.subcategory = updates.subcategory;
		if (updates.source !== undefined) updateData.source = updates.source;
		if (updates.tags !== undefined) updateData.tags = updates.tags;
		if (updates.priority !== undefined) updateData.priority = updates.priority;
		if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
		if (embedding) {
			// Use raw SQL for vector update
			await db.execute(sql`
				UPDATE nvc_knowledge
				SET embedding = ${JSON.stringify(embedding)}::vector
				WHERE id = ${id}::uuid
			`);
		}

		// Update other fields using drizzle
		const result = await db
			.update(nvcKnowledge)
			.set(updateData)
			.where(eq(nvcKnowledge.id, id))
			.returning();

		if (!result || result.length === 0) {
			throw new Error('Entry not found or update failed');
		}

		const entry = result[0];
		console.log(`✅ Updated NVC knowledge entry ${id}`);
		
		return {
			id: entry.id,
			knowledgeId: entry.knowledgeId,
			language: entry.language as 'de' | 'en',
			title: entry.title,
			content: entry.content,
			embedding: entry.embedding as number[] | null,
			category: entry.category,
			subcategory: entry.subcategory,
			source: entry.source,
			tags: entry.tags,
			priority: entry.priority,
			isActive: entry.isActive,
			createdBy: entry.createdBy,
			created: entry.created,
			updated: entry.updated
		};
	} catch (error) {
		console.error('Error updating NVC knowledge entry:', error);
		throw error;
	}
}

/**
 * Get a single NVC knowledge entry by ID
 */
export async function getNVCKnowledgeEntry(id: string): Promise<NVCKnowledgeEntry | null> {
	try {
		const result = await db
			.select()
			.from(nvcKnowledge)
			.where(eq(nvcKnowledge.id, id))
			.limit(1);

		if (result.length === 0) {
			return null;
		}

		const entry = result[0];
		return {
			id: entry.id,
			knowledgeId: entry.knowledgeId,
			language: entry.language as 'de' | 'en',
			title: entry.title,
			content: entry.content,
			embedding: entry.embedding as number[] | null,
			category: entry.category,
			subcategory: entry.subcategory,
			source: entry.source,
			tags: entry.tags,
			priority: entry.priority,
			isActive: entry.isActive,
			createdBy: entry.createdBy,
			created: entry.created,
			updated: entry.updated
		};
	} catch (error) {
		console.error('Error getting NVC knowledge entry:', error);
		throw error;
	}
}

/**
 * Semantic search for NVC knowledge
 */
export async function searchNVCKnowledge(
	query: string,
	options: SearchOptions = {}
): Promise<Array<NVCKnowledgeEntry & { similarity: number }>> {
	try {
		console.log(`🔍 Searching NVC knowledge: "${query}" (${options.language || 'any'})`);

		const language = options.language;
		const limit = options.limit || 10;
		const minSimilarity = options.minSimilarity || 0.7;

		// Generate embedding for the search query
		const searchEmbedding = await generateNVCEmbedding(query, language || 'de');

		// Build WHERE conditions as SQL fragments
		const conditions: any[] = [sql`is_active = true`];
		
		if (language) {
			conditions.push(sql`language = ${language}`);
		}
		if (options.category) {
			conditions.push(sql`category = ${options.category}`);
		}
		if (options.tags && options.tags.length > 0) {
			conditions.push(sql`tags && ${JSON.stringify(options.tags)}::text[]`);
		}

		// Search using vector similarity
		const whereClause = conditions.length > 0 
			? sql`${sql.join(conditions, sql` AND `)} AND embedding IS NOT NULL`
			: sql`embedding IS NOT NULL`;

		const results = await db.execute(sql`
			SELECT *,
				   1 - (embedding <-> ${JSON.stringify(searchEmbedding)}::vector) as similarity
			FROM nvc_knowledge
			WHERE ${whereClause}
			  AND (1 - (embedding <-> ${JSON.stringify(searchEmbedding)}::vector)) >= ${minSimilarity}
			ORDER BY embedding <-> ${JSON.stringify(searchEmbedding)}::vector
			LIMIT ${limit}
		`);

		const resultRows = Array.isArray(results) ? results : (results.rows || []);
		
		console.log(`📝 Found ${resultRows.length} similar entries`);

		return resultRows.map((row: any) => ({
			id: row.id,
			knowledgeId: row.knowledge_id,
			language: row.language,
			title: row.title,
			content: row.content,
			embedding: row.embedding,
			category: row.category,
			subcategory: row.subcategory,
			source: row.source,
			tags: row.tags,
			priority: row.priority,
			isActive: row.is_active,
			createdBy: row.created_by,
			created: row.created,
			updated: row.updated,
			similarity: row.similarity || 0
		}));
	} catch (error) {
		console.error('Error searching NVC knowledge:', error);
		throw error;
	}
}

/**
 * Find similar NVC knowledge entries to a given entry
 */
export async function findSimilarNVCKnowledge(
	id: string,
	limit: number = 5
): Promise<Array<NVCKnowledgeEntry & { similarity: number }>> {
	try {
		const entry = await getNVCKnowledgeEntry(id);
		if (!entry || !entry.embedding) {
			return [];
		}

		const results = await db.execute(sql`
			SELECT *,
				   1 - (embedding <-> ${JSON.stringify(entry.embedding)}::vector) as similarity
			FROM nvc_knowledge
			WHERE id != ${id}::uuid
			  AND language = ${entry.language}
			  AND is_active = true
			  AND embedding IS NOT NULL
			ORDER BY embedding <-> ${JSON.stringify(entry.embedding)}::vector
			LIMIT ${limit}
		`);

		const resultRows = Array.isArray(results) ? results : (results.rows || []);
		
		return resultRows.map((row: any) => ({
			id: row.id,
			knowledgeId: row.knowledge_id,
			language: row.language,
			title: row.title,
			content: row.content,
			embedding: row.embedding,
			category: row.category,
			subcategory: row.subcategory,
			source: row.source,
			tags: row.tags,
			priority: row.priority,
			isActive: row.is_active,
			createdBy: row.created_by,
			created: row.created,
			updated: row.updated,
			similarity: row.similarity || 0
		}));
	} catch (error) {
		console.error('Error finding similar NVC knowledge:', error);
		throw error;
	}
}

/**
 * Get all entries linked by knowledgeId (translations)
 */
export async function getNVCKnowledgeTranslations(
	knowledgeId: string
): Promise<NVCKnowledgeEntry[]> {
	try {
		const results = await db
			.select()
			.from(nvcKnowledge)
			.where(and(
				eq(nvcKnowledge.knowledgeId, knowledgeId),
				eq(nvcKnowledge.isActive, true)
			))
			.orderBy(desc(nvcKnowledge.created));

		return results.map(entry => ({
			id: entry.id,
			knowledgeId: entry.knowledgeId,
			language: entry.language as 'de' | 'en',
			title: entry.title,
			content: entry.content,
			embedding: entry.embedding as number[] | null,
			category: entry.category,
			subcategory: entry.subcategory,
			source: entry.source,
			tags: entry.tags,
			priority: entry.priority,
			isActive: entry.isActive,
			createdBy: entry.createdBy,
			created: entry.created,
			updated: entry.updated
		}));
	} catch (error) {
		console.error('Error getting NVC knowledge translations:', error);
		throw error;
	}
}

/**
 * List NVC knowledge entries with filters
 */
export async function listNVCKnowledge(
	options: {
		language?: 'de' | 'en';
		category?: string;
		tags?: string[];
		isActive?: boolean;
		limit?: number;
		offset?: number;
	} = {}
): Promise<{ entries: NVCKnowledgeEntry[]; total: number }> {
	try {
		const conditions: any[] = [];
		
		if (options.language) {
			conditions.push(eq(nvcKnowledge.language, options.language));
		}
		if (options.category) {
			conditions.push(eq(nvcKnowledge.category, options.category));
		}
		if (options.tags && options.tags.length > 0) {
			conditions.push(sql`tags && ${JSON.stringify(options.tags)}::text[]`);
		}
		if (options.isActive !== undefined) {
			conditions.push(eq(nvcKnowledge.isActive, options.isActive));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const entries = await db
			.select()
			.from(nvcKnowledge)
			.where(whereClause)
			.orderBy(desc(nvcKnowledge.created))
			.limit(options.limit || 50)
			.offset(options.offset || 0);

		// Get total count
		const countWhereClause = conditions.length > 0 
			? sql`${sql.join(conditions, sql` AND `)}`
			: sql`1=1`;
		
		const countResult = await db.execute(sql`
			SELECT COUNT(*) as total
			FROM nvc_knowledge
			WHERE ${countWhereClause}
		`);
		const total = parseInt((countResult as any).rows?.[0]?.total || (countResult as any)[0]?.total || '0');

		return {
			entries: entries.map(entry => ({
				id: entry.id,
				knowledgeId: entry.knowledgeId,
				language: entry.language as 'de' | 'en',
				title: entry.title,
				content: entry.content,
				embedding: entry.embedding as number[] | null,
				category: entry.category,
				subcategory: entry.subcategory,
				source: entry.source,
				tags: entry.tags,
				priority: entry.priority,
				isActive: entry.isActive,
				createdBy: entry.createdBy,
				created: entry.created,
				updated: entry.updated
			})),
			total
		};
	} catch (error) {
		console.error('Error listing NVC knowledge:', error);
		throw error;
	}
}

/**
 * Get all unique categories
 */
export async function getNVCCategories(): Promise<string[]> {
	try {
		const result = await db.execute(sql`
			SELECT DISTINCT category
			FROM nvc_knowledge
			WHERE is_active = true
			ORDER BY category
		`);
		
		const rows = Array.isArray(result) ? result : (result.rows || []);
		return rows.map((row: any) => row.category).filter(Boolean);
	} catch (error) {
		console.error('Error getting NVC categories:', error);
		return [];
	}
}

/**
 * Get all unique tags
 */
export async function getNVCTags(): Promise<string[]> {
	try {
		const result = await db.execute(sql`
			SELECT DISTINCT unnest(tags) as tag
			FROM nvc_knowledge
			WHERE is_active = true AND tags IS NOT NULL
			ORDER BY tag
		`);
		
		const rows = Array.isArray(result) ? result : (result.rows || []);
		return rows.map((row: any) => row.tag).filter(Boolean);
	} catch (error) {
		console.error('Error getting NVC tags:', error);
		return [];
	}
}

/**
 * Delete NVC knowledge entry (soft delete by default)
 */
export async function deleteNVCKnowledgeEntry(
	id: string,
	hardDelete: boolean = false
): Promise<void> {
	try {
		if (hardDelete) {
			await db.delete(nvcKnowledge).where(eq(nvcKnowledge.id, id));
			console.log(`🗑️ Hard deleted NVC knowledge entry ${id}`);
		} else {
			await db
				.update(nvcKnowledge)
				.set({ isActive: false, updated: new Date().toISOString() })
				.where(eq(nvcKnowledge.id, id));
			console.log(`🗑️ Soft deleted NVC knowledge entry ${id}`);
		}
	} catch (error) {
		console.error('Error deleting NVC knowledge entry:', error);
		throw error;
	}
}

