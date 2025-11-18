/**
 * Migrate PocketBase Learn content (categories, topics, versions) into Postgres.
 *
 * Run with:
 *   npx tsx scripts/migrate-pocketbase-topics.ts
 *
 * Required environment variables (defaults pulled from ../empathy-link/.env if available):
 *   DATABASE_URL
 *   POCKETBASE_URL
 *   POCKETBASE_ADMIN_EMAIL
 *   POCKETBASE_ADMIN_PASSWORD
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { db } from '../src/lib/db.js';
import {
	learnCategories,
	learnTopics,
	learnTopicVersions
} from '../drizzle/schema.js';
import { eq, sql } from 'drizzle-orm';
import PocketBase from 'pocketbase';

// Load local .env first
loadEnv();

// Override with PocketBase settings used in ../empathy-link if present
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const empathyEnvPath = path.resolve(__dirname, '../empathy-link/.env');
if (fs.existsSync(empathyEnvPath)) {
	loadEnv({ path: empathyEnvPath, override: true });
}

type PocketBaseRecord = Record<string, any> & {
	id: string;
	created?: string;
	updated?: string;
};

async function migratePocketBaseTopics() {
	const {
		DATABASE_URL,
		POCKETBASE_URL,
		POCKETBASE_ADMIN_EMAIL,
		POCKETBASE_ADMIN_PASSWORD
	} = process.env;

	if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
	if (!POCKETBASE_URL) throw new Error('POCKETBASE_URL is required');
	if (!POCKETBASE_ADMIN_EMAIL) throw new Error('POCKETBASE_ADMIN_EMAIL is required');
	if (!POCKETBASE_ADMIN_PASSWORD) {
		throw new Error('POCKETBASE_ADMIN_PASSWORD is required');
	}

	const pocketbaseUrl = normalizePocketBaseUrl(POCKETBASE_URL);

	const pb = new PocketBase(pocketbaseUrl);

	console.log('🔐 Authenticating with PocketBase...');
	await authenticatePocketBase(pb, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD);

	console.log('⬇️  Fetching PocketBase collections...');
	const [categories, topics, topicVersions] = await Promise.all([
		pb.collection('topicCategory').getFullList<PocketBaseRecord>({
			batch: 200,
			sort: 'created'
		}),
		pb.collection('topics').getFullList<PocketBaseRecord>({
			batch: 200,
			sort: 'created'
		}),
		pb.collection('topicVersions').getFullList<PocketBaseRecord>({
			batch: 200,
			sort: 'created'
		})
	]);
	console.log(
		`📦 Retrieved ${categories.length} categories, ${topics.length} topics, ${topicVersions.length} versions`
	);

	const categoryIdMap = await migrateCategories(categories);
	const topicIdMap = await migrateTopics(topics, categoryIdMap);
	const versionIdMap = await migrateTopicVersions(
		topicVersions,
		topicIdMap,
		categoryIdMap
	);
	await updateCurrentVersions(topics, topicIdMap, versionIdMap);

	console.log('✨ Migration complete');
}

async function migrateCategories(records: PocketBaseRecord[]) {
	console.log('🗂️  Migrating categories...');
	const map = new Map<string, string>();
	let success = 0;

	for (const record of records) {
		const slugSource =
			getField(record, 'slug') ??
			getField(record, 'name_de') ??
			getField(record, 'nameDE') ??
			getField(record, 'name');
		const nameDE =
			getField(record, 'name_de') ?? getField(record, 'nameDE') ?? slugSource;

		if (!slugSource || !nameDE) {
			console.warn(
				`⚠️  Skipping category ${record.id} - missing slug/name`
			);
			continue;
		}

		const slug = slugify(String(slugSource));
		const insertValues = {
			slug,
			nameDE: String(nameDE),
			nameEN:
				getField(record, 'name_en') ??
				getField(record, 'nameEN') ??
				null,
			descriptionDE:
				getField(record, 'description_de') ??
				getField(record, 'descriptionDE') ??
				null,
			descriptionEN:
				getField(record, 'description_en') ??
				getField(record, 'descriptionEN') ??
				null,
			color: getField(record, 'color') ?? null,
			icon: getField(record, 'icon') ?? null,
			sortOrder: toNumber(
				getField(record, 'sort_order', 'sortOrder', 'order'),
				0
			),
			isActive: toBoolean(getField(record, 'is_active', 'isActive'), true),
			created: parseDate(record.created),
			updated: parseDate(record.updated)
		};

		const updateValues = {
			nameDE: insertValues.nameDE,
			nameEN: insertValues.nameEN,
			descriptionDE: insertValues.descriptionDE,
			descriptionEN: insertValues.descriptionEN,
			color: insertValues.color,
			icon: insertValues.icon,
			sortOrder: insertValues.sortOrder,
			isActive: insertValues.isActive,
			updated: insertValues.updated
		};

		const [row] = await db
			.insert(learnCategories)
			.values(insertValues)
			.onConflictDoUpdate({
				target: learnCategories.slug,
				set: updateValues
			})
			.returning();

		if (row) {
			map.set(record.id, row.id);
			success += 1;
		}
	}

	console.log(`✅ Migrated ${success} categories`);
	return map;
}

async function migrateTopics(
	records: PocketBaseRecord[],
	categoryMap: Map<string, string>
) {
	console.log('📚 Migrating topics...');
	const map = new Map<string, string>();
	let success = 0;

	for (const record of records) {
		const slugSource =
			getField(record, 'slug') ??
			getField(record, 'summary_de') ??
			getField(record, 'summaryDE') ??
			getField(record, 'title');

		if (!slugSource) {
			console.warn(`⚠️  Skipping topic ${record.id} - missing slug/title`);
			continue;
		}

		const categoryKey =
			getField(record, 'category', 'categoryId', 'topicCategory') ?? null;
		const categoryId = categoryKey ? categoryMap.get(String(categoryKey)) ?? null : null;

		const tagsRaw = getField(record, 'tags');
		const tags = Array.isArray(tagsRaw)
			? tagsRaw.map((tag) => String(tag)).join(',')
			: typeof tagsRaw === 'string'
				? tagsRaw
				: null;

		const insertValues = {
			slug: slugify(String(slugSource)),
			categoryId,
			order: toNumber(
				getField(record, 'order', 'sort_order', 'sortOrder'),
				0
			),
			difficulty: getField(record, 'difficulty') ?? null,
			level: getField(record, 'level') ?? null,
			estimatedMinutes: toNumber(
				getField(record, 'estimated_minutes', 'estimatedMinutes'),
				null
			),
			summaryDE:
				getField(record, 'summary_de') ?? getField(record, 'summaryDE') ?? null,
			summaryEN:
				getField(record, 'summary_en') ?? getField(record, 'summaryEN') ?? null,
			coverImage:
				getField(record, 'cover_image') ?? getField(record, 'coverImage') ?? null,
			currentVersionId: null,
			isActive: toBoolean(getField(record, 'is_active', 'isActive'), true),
			isFeatured: toBoolean(
				getField(record, 'is_featured', 'isFeatured'),
				false
			),
			tags,
			created: parseDate(record.created),
			updated: parseDate(record.updated)
		};

		const updateValues = {
			categoryId: insertValues.categoryId,
			order: insertValues.order,
			difficulty: insertValues.difficulty,
			level: insertValues.level,
			estimatedMinutes: insertValues.estimatedMinutes,
			summaryDE: insertValues.summaryDE,
			summaryEN: insertValues.summaryEN,
			coverImage: insertValues.coverImage,
			isActive: insertValues.isActive,
			isFeatured: insertValues.isFeatured,
			tags: insertValues.tags,
			updated: insertValues.updated
		};

		const [row] = await db
			.insert(learnTopics)
			.values(insertValues)
			.onConflictDoUpdate({
				target: learnTopics.slug,
				set: updateValues
			})
			.returning();

		if (row) {
			map.set(record.id, row.id);
			success += 1;
		}
	}

	console.log(`✅ Migrated ${success} topics`);
	return map;
}

async function migrateTopicVersions(
	records: PocketBaseRecord[],
	topicMap: Map<string, string>,
	categoryMap: Map<string, string>
) {
	console.log('📄 Migrating topic versions...');
	const map = new Map<string, string>();
	let created = 0;
	let skipped = 0;

	for (const record of records) {
		const pbTopicId = getField(record, 'topic', 'topicId');
		if (!pbTopicId) {
			console.warn(
				`⚠️  Skipping topicVersion ${record.id} - missing topic reference`
			);
			skipped += 1;
			continue;
		}

		const topicId = topicMap.get(String(pbTopicId));
		if (!topicId) {
			console.warn(
				`⚠️  Skipping topicVersion ${record.id} - topic ${pbTopicId} not migrated`
			);
			skipped += 1;
			continue;
		}

		const existing = await db
			.select({ id: learnTopicVersions.id })
			.from(learnTopicVersions)
			.where(
				sql`${learnTopicVersions.metadata} ->> 'pocketbaseId' = ${record.id}`
			);

		if (existing.length > 0) {
			map.set(record.id, existing[0].id);
			continue;
		}

		const categoryRef =
			getField(record, 'category', 'categoryId', 'topicCategory') ?? null;
		const categoryId = categoryRef
			? categoryMap.get(String(categoryRef)) ?? null
			: null;

		const insertValues = {
			topicId,
			categoryId,
			versionLabel: getField(record, 'version_label', 'versionLabel') ?? null,
			titleDE:
				getField(record, 'title_de') ??
				getField(record, 'titleDE') ??
				getField(record, 'title') ??
				'Untitled',
			titleEN:
				getField(record, 'title_en') ?? getField(record, 'titleEN') ?? null,
			descriptionDE:
				getField(record, 'description_de') ??
				getField(record, 'descriptionDE') ??
				null,
			descriptionEN:
				getField(record, 'description_en') ??
				getField(record, 'descriptionEN') ??
				null,
			language: (getField(record, 'language') ?? 'de') as string,
			image: getField(record, 'image') ?? null,
			content: parseJsonMaybe(getField(record, 'content')),
			status: (getField(record, 'status') ?? 'draft') as string,
			isPublished: toBoolean(
				getField(record, 'is_published', 'isPublished', 'published'),
				false
			),
			publishedAt:
				getField(record, 'published_at', 'publishedAt') ??
				(toBoolean(
					getField(record, 'is_published', 'isPublished', 'published'),
					false
				)
					? parseDate(record.updated)
					: null),
			createdBy: getField(record, 'created_by', 'createdBy', 'author') ?? null,
			notes: getField(record, 'notes') ?? null,
			metadata: mergeMetadata(record),
			created: parseDate(record.created),
			updated: parseDate(record.updated)
		};

		const [row] = await db
			.insert(learnTopicVersions)
			.values(insertValues)
			.returning();

		if (row) {
			map.set(record.id, row.id);
			created += 1;
		}
	}

	console.log(`✅ Migrated ${created} topic versions (${skipped} skipped)`);
	return map;
}

async function updateCurrentVersions(
	records: PocketBaseRecord[],
	topicMap: Map<string, string>,
	versionMap: Map<string, string>
) {
	console.log('🔁 Syncing current version pointers...');
	let updated = 0;

	for (const record of records) {
		const pbTopicId = record.id;
		const topicId = topicMap.get(pbTopicId);
		if (!topicId) continue;

		const pbCurrent =
			getField(record, 'current_version', 'currentVersion') ?? null;
		if (!pbCurrent) continue;

		const versionId = versionMap.get(String(pbCurrent));
		if (!versionId) continue;

		const [topic] = await db
			.select({ currentVersionId: learnTopics.currentVersionId })
			.from(learnTopics)
			.where(eq(learnTopics.id, topicId));

		if (topic?.currentVersionId === versionId) {
			continue;
		}

		await db
			.update(learnTopics)
			.set({
				currentVersionId: versionId,
				updated: new Date().toISOString()
			})
			.where(eq(learnTopics.id, topicId));

		updated += 1;
	}

	console.log(`✅ Updated ${updated} topics with current versions`);
}

function getField(record: PocketBaseRecord, ...keys: string[]) {
	for (const key of keys) {
		if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
			return record[key];
		}
	}
	return undefined;
}

function slugify(value: string) {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-');
}

function toNumber(value: any, fallback: number | null) {
	if (value === null || value === undefined || value === '') {
		return fallback;
	}
	const num = Number(value);
	return Number.isFinite(num) ? num : fallback;
}

function toBoolean(value: any, fallback: boolean) {
	if (value === null || value === undefined) return fallback;
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value !== 0;
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
		if (['false', '0', 'no', 'n'].includes(normalized)) return false;
	}
	return fallback;
}

function parseDate(value: any) {
	if (!value) {
		return new Date().toISOString();
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return new Date().toISOString();
	}
	return date.toISOString();
}

function parseJsonMaybe(value: any) {
	if (value === null || value === undefined || value === '') {
		return null;
	}
	if (typeof value === 'object') {
		return value;
	}
	if (typeof value === 'string') {
		try {
			return JSON.parse(value);
		} catch {
			return value;
		}
	}
	return value;
}

function mergeMetadata(record: PocketBaseRecord) {
	const source = getField(record, 'metadata');
	const parsed = parseJsonMaybe(source);
	const base =
		parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
	return {
		...base,
		pocketbaseId: record.id
	};
}

function normalizePocketBaseUrl(value: string) {
	const trimmed = value.trim();
	if (!/^https?:\/\//i.test(trimmed)) {
		return `https://${trimmed}`;
	}
	return trimmed;
}

async function authenticatePocketBase(
	pb: PocketBase,
	email: string,
	password: string
) {
	try {
		await pb.admins.authWithPassword(email, password);
		console.log('✅ Authenticated as admin');
		return;
	} catch (adminError) {
		console.warn(
			`⚠️ Admin authentication failed (${(adminError as Error).message}). Trying user auth...`
		);
	}

	try {
		await pb.collection('users').authWithPassword(email, password);
		console.log('✅ Authenticated as regular user');
	} catch (userError) {
		throw new Error(
			`PocketBase authentication failed for both admin and user accounts: ${(userError as Error).message}`
		);
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	migratePocketBaseTopics().catch((error) => {
		console.error('❌ Migration failed:', error);
		process.exit(1);
	});
}

export { migratePocketBaseTopics };


