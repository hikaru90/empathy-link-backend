/**
 * NVC Knowledge Base with vector embeddings for semantic search
 * Supports internationalization (DE/EN) with separate embeddings per language
 */

import { GoogleGenAI, Type } from '@google/genai';
import { db } from './db.js';
import { nvcKnowledge, learnTopics, learnTopicVersions } from '../../drizzle/schema.js';
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
	learnTopicId?: string | null;
	learnTopicVersionId?: string | null;
	learnTopicSlug?: string | null;
	pocketbaseVersionId?: string | null;
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
		const modelName = 'gemini-embedding-001';
		
		const response = await ai.models.embedContent({
			model: modelName,
			contents: formattedText,
			config: {
				outputDimensionality: 768
			},
			// @ts-ignore
			posthogProperties: {
				context: 'nvc_knowledge_embedding',
				language
			}
		});

		// Track token usage for embedding
		// Note: The Google GenAI SDK might not return usage metadata for embeddings in the same way,
		// but if it does or if we can estimate, we should track it.
		// For embeddings, it's usually just input tokens.
		// Assuming ~1.3 tokens per word as rough estimate if not provided, or checking response.
		
		// @ts-ignore - Check if usageMetadata exists on response
		if (response.usageMetadata) {
			// @ts-ignore
			const usage = response.usageMetadata;
			await trackTokenUsage({
				context: 'nvc_knowledge_embedding',
				model: modelName,
				inputTokens: usage.promptTokenCount || 0,
				outputTokens: 0,
			});
		}

		// Check both singular and plural forms (SDK might use either)
		let values: number[] | undefined;
		if (response.embeddings && Array.isArray(response.embeddings) && response.embeddings.length > 0) {
			values = response.embeddings[0].values;
		} else if ((response as any).embedding?.values) {
			values = (response as any).embedding.values;
		}

		if (!values || !Array.isArray(values)) {
			console.error('Response structure:', JSON.stringify(response, null, 2));
			throw new Error('No embeddings returned from API');
		}

		return values;
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
					learn_topic_id, learn_topic_version_id, learn_topic_slug, pocketbase_version_id, is_active, created_by, created, updated
				) VALUES (
					${knowledgeId}::uuid, ${input.language}, ${input.title}, ${input.content},
					${JSON.stringify(embedding)}::vector,
					${input.category}, ${input.subcategory || null}, ${input.source || null},
					${input.tags ? sql.raw(`ARRAY[${input.tags.map(t => `'${t.replace(/'/g, "''")}'`).join(',')}]::text[]`) : sql`NULL`},
					${input.priority || 3},
					${input.learnTopicId || null}::uuid, ${input.learnTopicVersionId || null}::uuid,
					${input.learnTopicSlug || null}, ${input.pocketbaseVersionId || null},
					true, ${input.createdBy || null},
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
					learn_topic_id, learn_topic_version_id, learn_topic_slug, pocketbase_version_id, is_active, created_by, created, updated
				) VALUES (
					${knowledgeId}::uuid, ${input.language}, ${input.title}, ${input.content},
					NULL,
					${input.category}, ${input.subcategory || null}, ${input.source || null},
					${input.tags ? sql.raw(`ARRAY[${input.tags.map(t => `'${t.replace(/'/g, "''")}'`).join(',')}]::text[]`) : sql`NULL`},
					${input.priority || 3},
					${input.learnTopicId || null}::uuid, ${input.learnTopicVersionId || null}::uuid,
					${input.learnTopicSlug || null}, ${input.pocketbaseVersionId || null},
					true, ${input.createdBy || null},
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

		// If content or title changed, or generateEmbedding requested, regenerate embedding
		let embedding: number[] | null = null;
		if (updates.generateEmbedding || updates.content || updates.title) {
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
		if (updates.learnTopicId !== undefined) updateData.learnTopicId = updates.learnTopicId;
		if (updates.learnTopicVersionId !== undefined) updateData.learnTopicVersionId = updates.learnTopicVersionId;
		if (updates.learnTopicSlug !== undefined) updateData.learnTopicSlug = updates.learnTopicSlug;
		if (updates.pocketbaseVersionId !== undefined) updateData.pocketbaseVersionId = updates.pocketbaseVersionId;
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
 * Build learn path for a topic slug. Uses LEARN_PATH_PREFIX env (e.g. "/learn" or "/(protected)/learn" for Expo Router).
 */
export function getLearnPath(slug: string): string {
	const prefix = (process.env.LEARN_PATH_PREFIX || '/learn').replace(/\/$/, '');
	return `${prefix}/${slug}`;
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

		// Build WHERE conditions as SQL fragments (qualify with n. to avoid ambiguity with learn_topics)
		const conditions: any[] = [sql`n.is_active = true`];
		
		if (language) {
			conditions.push(sql`n.language = ${language}`);
		}
		if (options.category) {
			conditions.push(sql`n.category = ${options.category}`);
		}
		if (options.tags && options.tags.length > 0) {
			conditions.push(sql`n.tags && ${JSON.stringify(options.tags)}::text[]`);
		}

		// Search using vector similarity
		const whereClause = conditions.length > 0 
			? sql`${sql.join(conditions, sql` AND `)} AND n.embedding IS NOT NULL`
			: sql`n.embedding IS NOT NULL`;

		const results = await db.execute(sql`
			SELECT n.*,
				   COALESCE(lt.slug, n.learn_topic_slug) as learn_topic_slug,
				   1 - (n.embedding <-> ${JSON.stringify(searchEmbedding)}::vector) as similarity
			FROM nvc_knowledge n
			LEFT JOIN learn_topics lt ON n.learn_topic_id = lt.id
			WHERE ${whereClause}
			  AND (1 - (n.embedding <-> ${JSON.stringify(searchEmbedding)}::vector)) >= ${minSimilarity}
			ORDER BY n.embedding <-> ${JSON.stringify(searchEmbedding)}::vector
			LIMIT ${limit}
		`);

		const resultRows = Array.isArray(results) ? results : (results.rows || []);
		
		console.log(`📝 Found ${resultRows.length} similar entries`);

		return resultRows.map((row: any) => {
			const learnTopicSlug = row.learn_topic_slug || null;
			return {
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
				learnTopicSlug,
				learnPath: learnTopicSlug ? getLearnPath(learnTopicSlug) : null,
				pocketbaseVersionId: row.pocketbase_version_id || null,
				createdBy: row.created_by,
				created: row.created,
				updated: row.updated,
				similarity: row.similarity || 0
			};
		});
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
 * Extract plain text from learn topic version content (JSONB blocks)
 * Handles TipTap/ProseMirror, Slate, and generic block structures
 */
function extractTextFromLearnContent(content: any): string {
	if (!content) return '';
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		return content.map((block: any) => {
			if (typeof block === 'string') return block;
			if (block?.text) return block.text;
			if (block?.content) return extractTextFromLearnContent(block.content);
			if (block?.children) return extractTextFromLearnContent(block.children);
			// TipTap/ProseMirror: { type: 'paragraph', content: [{ type: 'text', text: '...' }] }
			if (Array.isArray(block)) return extractTextFromLearnContent(block);
			// Recurse into object to find text
			if (typeof block === 'object') {
				const parts: string[] = [];
				for (const v of Object.values(block)) {
					if (typeof v === 'string' && v.length > 1) parts.push(v);
					else if (v && typeof v === 'object') parts.push(extractTextFromLearnContent(v));
				}
				return parts.filter(Boolean).join(' ');
			}
			return '';
		}).filter(Boolean).join('\n');
	}
	if (content?.text) return content.text;
	if (content?.content) return extractTextFromLearnContent(content.content);
	if (content?.children) return extractTextFromLearnContent(content.children);
	// TipTap doc: { type: 'doc', content: [...] }
	if (content?.type === 'doc' && content?.content) return extractTextFromLearnContent(content.content);
	// Generic object with nested content
	if (typeof content === 'object') {
		const parts: string[] = [];
		for (const v of Object.values(content)) {
			if (typeof v === 'string' && v.length > 1) parts.push(v);
			else if (v && typeof v === 'object') parts.push(extractTextFromLearnContent(v));
		}
		return parts.filter(Boolean).join(' ');
	}
	return '';
}

function getField(record: Record<string, any>, ...keys: string[]): any {
	for (const key of keys) {
		if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
			return record[key];
		}
	}
	return undefined;
}

function toBoolean(value: any, fallback: boolean): boolean {
	if (value === null || value === undefined) return fallback;
	if (typeof value === 'boolean') return value;
	if (typeof value === 'string') {
		const n = value.trim().toLowerCase();
		if (['true', '1', 'yes', 'y'].includes(n)) return true;
		if (['false', '0', 'no', 'n'].includes(n)) return false;
	}
	return fallback;
}

function slugify(value: string): string {
	return value.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
}

interface GeminiLearnExtraction {
	title: string;
	tags: string[];
	summary: string;
	usedConcepts: string[];
}

import { trackTokenUsage } from './token-usage.js';

/**
 * Call Gemini to extract title, tags, summary, used concepts from learn content
 */
async function extractLearnMetadataWithGemini(rawContent: string, language: 'de' | 'en'): Promise<GeminiLearnExtraction> {
	const ai = getGenAIClient();
	const isGerman = language === 'de';
	const modelName = 'gemini-2.5-flash';

	const systemInstruction = isGerman
		? `Du bist ein Experte für Gewaltfreie Kommunikation (GFK). Analysiere den gegebenen Lerninhalt und extrahiere strukturierte Metadaten.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt im Format:
{
  "title": "Kurzer, prägnanter Titel (max. 80 Zeichen)",
  "tags": ["tag1", "tag2", "tag3"],
  "summary": "Zusammenfassung des Inhalts in 2-4 Sätzen für die Vektorsuche",
  "usedConcepts": ["GFK-Konzept1", "GFK-Konzept2"]
}

- title: Fasse den Inhalt prägnant zusammen
- tags: 3-6 relevante Schlagwörter (GFK-Begriffe, Themen)
- summary: Inhaltliche Zusammenfassung für semantische Suche
- usedConcepts: GFK-Konzepte die im Inhalt vorkommen (z.B. Bedürfnisse, Gefühle, Beobachtung, Bitte, Empathie, Selbstempathie)`
		: `You are an expert in Nonviolent Communication (NVC). Analyze the given learning content and extract structured metadata.

Respond ONLY with a JSON object in the format:
{
  "title": "Short, concise title (max 80 chars)",
  "tags": ["tag1", "tag2", "tag3"],
  "summary": "Summary of the content in 2-4 sentences for vector search",
  "usedConcepts": ["NVC-concept1", "NVC-concept2"]
}

- title: Summarize the content concisely
- tags: 3-6 relevant keywords (NVC terms, topics)
- summary: Content summary for semantic search
- usedConcepts: NVC concepts used in the content (e.g. needs, feelings, observation, request, empathy, self-empathy)`;

	const responseSchema = {
		type: Type.OBJECT,
		properties: {
			title: { type: Type.STRING, description: 'Short title (max 80 chars)' },
			tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: '3-6 keywords' },
			summary: { type: Type.STRING, description: 'Content summary for vector search' },
			usedConcepts: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'NVC concepts used' }
		},
		required: ['title', 'tags', 'summary', 'usedConcepts']
	};

	const chat = ai.chats.create({
		model: modelName,
		config: {
			temperature: 0.3,
			maxOutputTokens: 1024,
			systemInstruction,
			responseMimeType: 'application/json',
			responseSchema
		}
	});

		const result = await chat.sendMessage({ 
			message: `Lerninhalt:\n\n${rawContent.substring(0, 15000)}`,
			posthogProperties: {
				context: 'learn_metadata_extraction',
				language
			}
		});
		
		// Track token usage
	if ((result as any).response?.usageMetadata) {
		const usage = (result as any).response.usageMetadata;
		await trackTokenUsage({
			context: 'learn_metadata_extraction',
			model: modelName,
			inputTokens: usage.promptTokenCount || 0,
			outputTokens: usage.candidatesTokenCount || 0,
		});
	}

	const text = result.text || '{}';
	const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

	let parsed: GeminiLearnExtraction;
	try {
		parsed = JSON.parse(cleaned) as GeminiLearnExtraction;
	} catch {
		// Fallback: try to extract JSON object from response (first { to last })
		const start = cleaned.indexOf('{');
		const end = cleaned.lastIndexOf('}');
		if (start !== -1 && end > start) {
			try {
				parsed = JSON.parse(cleaned.slice(start, end + 1)) as GeminiLearnExtraction;
			} catch {
				parsed = {
					title: cleaned.split('\n')[0]?.trim().slice(0, 80) || 'Untitled',
					tags: [],
					summary: rawContent.substring(0, 500),
					usedConcepts: []
				};
			}
		} else {
			parsed = {
				title: '',
				tags: [],
				summary: rawContent.substring(0, 500),
				usedConcepts: []
			};
		}
	}

	// Reject titles that are JSON fragments or invalid (e.g. "{", "[", empty)
	function isValidTitle(s: string): boolean {
		const t = s?.trim() || '';
		if (!t || t.length < 2) return false;
		const first = t[0];
		if (first === '{' || first === '[' || first === '"') return false;
		return true;
	}

	const title = isValidTitle(parsed.title)
		? (parsed.title ?? '').trim().slice(0, 80)
		: (rawContent.split('\n').find((l) => l.trim().length > 2)?.trim().slice(0, 80) || 'Untitled');

	return {
		title,
		tags: Array.isArray(parsed.tags) ? parsed.tags : [],
		summary: parsed.summary || rawContent.substring(0, 500),
		usedConcepts: Array.isArray(parsed.usedConcepts) ? parsed.usedConcepts : []
	};
}

/**
 * Sync learn section content from PocketBase to nvc_knowledge vector DB.
 * Fetches topics + topicVersions from PocketBase, sends content to Gemini for metadata extraction,
 * then saves to nvc_knowledge with title, tags, summary, used concepts.
 */
export async function syncLearnContentToNVCKnowledge(): Promise<{
	created: number;
	updated: number;
	skipped: number;
	errors: number;
	debug?: { totalFetched: number; publishedCount: number; topicCount: number };
}> {
	const stats = { created: 0, updated: 0, skipped: 0, errors: 0 };

	const pbUrl = process.env.POCKETBASE_URL;
	const pbEmail = process.env.POCKETBASE_ADMIN_EMAIL;
	const pbPassword = process.env.POCKETBASE_ADMIN_PASSWORD;

	if (!pbUrl || !pbEmail || !pbPassword) {
		throw new Error('POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD are required');
	}

	const PocketBase = (await import('pocketbase')).default;
	const pb = new PocketBase(pbUrl.startsWith('http') ? pbUrl : `https://${pbUrl}`);

	try {
		await pb.admins.authWithPassword(pbEmail, pbPassword);
	} catch {
		try {
			await pb.collection('users').authWithPassword(pbEmail, pbPassword);
		} catch (e) {
			throw new Error(`PocketBase auth failed: ${(e as Error).message}`);
		}
	}

	// Fetch topics and topicVersions separately (same as migrate script - no expand, no filter)
	const [topics, topicVersions] = await Promise.all([
		pb.collection('topics').getFullList<Record<string, any>>({ batch: 200, sort: 'created' }),
		pb.collection('topicVersions').getFullList<Record<string, any>>({ batch: 200, sort: 'created' })
	]);

	console.log(`📚 Fetched ${topics.length} topics, ${topicVersions.length} topicVersions`);

	const topicMap = new Map<string, Record<string, any>>();
	for (const t of topics) {
		topicMap.set(t.id, t);
	}

	for (const version of topicVersions) {
		// topicVersions.topic = relation ID; topics.slug = URL slug
		const topicId = getField(version, 'topic');
		const topic = topicId ? topicMap.get(String(topicId)) : null;
		const topicSlug = topic
			? slugify(String(getField(topic, 'slug') || 'unknown')) || 'unknown'
			: 'unknown';

		const rawContent = extractTextFromLearnContent(
			getField(version, 'content', 'body', 'text', 'html')
		);
		const desc = getField(version, 'descriptionDE', 'description_de') || getField(version, 'descriptionEN', 'description_en') || '';
		const summary = getField(version, 'summary');
		const titleFallback = getField(version, 'titleDE', 'title_de') || getField(version, 'titleEN', 'title_en') || '';
		const fullContent = [titleFallback, desc, summary, rawContent].filter(Boolean).join('\n\n');

		if (!fullContent.trim()) {
			const sample = JSON.stringify({
				keys: Object.keys(version),
				titleDE: version.titleDE ?? version.title_de,
				contentType: version.content ? typeof version.content : 'missing',
				contentPreview: typeof version.content === 'string'
					? version.content.slice(0, 100)
					: version.content ? JSON.stringify(version.content).slice(0, 150) : null
			});
			console.warn(`⚠️ Skipping version ${version.id}: no extractable content. Sample: ${sample}`);
			stats.skipped++;
			continue;
		}

		const lang = ((getField(version, 'language') || 'de') as string).toLowerCase().startsWith('de') ? 'de' : 'en';

		try {
			const extracted = await extractLearnMetadataWithGemini(fullContent, lang as 'de' | 'en');
			const allTags = [...new Set([...extracted.tags, ...extracted.usedConcepts, 'learn', topicSlug])].filter(Boolean);

			const input: CreateNVCKnowledgeInput = {
				language: lang as 'de' | 'en',
				title: extracted.title,
				content: extracted.summary,
				category: 'learn',
				source: 'learn',
				tags: allTags,
				learnTopicSlug: topicSlug,
				pocketbaseVersionId: version.id,
				priority: 4
			};

			const existing = await db.execute(sql`
				SELECT id FROM nvc_knowledge
				WHERE pocketbase_version_id = ${version.id}
				LIMIT 1
			`);
			const rows = Array.isArray(existing) ? existing : (existing as any).rows || [];
			const existingId = rows[0]?.id;

			if (existingId) {
				await updateNVCKnowledgeEntry(existingId, { ...input, generateEmbedding: true });
				stats.updated++;
			} else {
				await createNVCKnowledgeEntry(input);
				stats.created++;
			}
		} catch (err) {
			console.error(`❌ Error processing topicVersion ${version.id}:`, err);
			stats.errors++;
		}
	}

	console.log(`📚 Sync learn→nvc_knowledge: ${stats.created} created, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errors} errors`);

	const debug = {
		totalFetched: topicVersions.length,
		publishedCount: topicVersions.length,
		topicCount: topics.length
	};
	return { ...stats, debug };
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

