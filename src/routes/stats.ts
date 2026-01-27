import { Hono } from 'hono';
import type { Context } from 'hono';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, desc, and, gte, lte, or, sql } from 'drizzle-orm';
import { analyses, memories, user as userTable, trackedNeeds, needFillLevels, needs, blindSpots, chats } from '../../drizzle/schema.js';
import { getAiClient } from '../lib/gemini.js';

const db = drizzle(process.env.DATABASE_URL!);
const stats = new Hono();

// Cache for checking if deleted column exists
let deletedColumnExists: boolean | null = null;

// Helper function to check if deleted column exists
async function checkDeletedColumnExists(): Promise<boolean> {
	if (deletedColumnExists !== null) {
		return deletedColumnExists;
	}

	try {
		// Use raw SQL to check if the column exists without triggering Drizzle errors
		const result = await db.execute(sql`
			SELECT column_name 
			FROM information_schema.columns 
			WHERE table_name = 'tracked_needs' 
			AND column_name = 'deleted'
			LIMIT 1
		`);
		
		// Check if result has rows (different Drizzle versions return different formats)
		let exists = false;
		if (Array.isArray(result)) {
			exists = result.length > 0;
		} else if (result.rows && Array.isArray(result.rows)) {
			exists = result.rows.length > 0;
		} else if (result && typeof result === 'object' && 'length' in result) {
			exists = (result as any).length > 0;
		}
		
		deletedColumnExists = exists;
		console.log('Deleted column exists check:', exists);
		return exists;
	} catch (error: any) {
		// If we can't check, assume it doesn't exist to be safe
		console.warn('Could not check if deleted column exists, assuming it does not:', error?.message);
		deletedColumnExists = false;
		return false;
	}
}

// GET /api/stats - Get stats data (analyses and memories)
stats.get('/', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		// Fetch analyses for the user
		const userAnalyses = await db
			.select()
			.from(analyses)
			.where(eq(analyses.userId, user.id))
			.orderBy(desc(analyses.created));

		// Fetch memories for the user
		const userMemories = await db
			.select()
			.from(memories)
			.where(eq(memories.userId, user.id))
			.orderBy(desc(memories.created));

		// Parse JSON fields in analyses (feelings and needs are stored as text)
		const parsedAnalyses = userAnalyses.map(analysis => {
			let feelings: string[] = [];
			let needs: string[] = [];

			// Safely parse feelings
			try {
				if (analysis.feelings) {
					feelings = JSON.parse(analysis.feelings);
				}
			} catch (e) {
				console.error('Failed to parse feelings for analysis:', analysis.id, e);
			}

			// Safely parse needs
			try {
				if (analysis.needs) {
					needs = JSON.parse(analysis.needs);
				}
			} catch (e) {
				console.error('Failed to parse needs for analysis:', analysis.id, e);
			}

			return {
				...analysis,
				feelings,
				needs,
			};
		});

		return c.json({
			analyses: parsedAnalyses,
			memories: userMemories,
		});
	} catch (error) {
		console.error('Error fetching stats:', error);
		return c.json({ error: 'Failed to fetch stats' }, 500);
	}
});

// GET /api/stats/inspirational-quote - Get stored inspirational quote
stats.get('/inspirational-quote', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		// Fetch user record to get stored quote
		const userRecord = await db
			.select()
			.from(userTable)
			.where(eq(userTable.id, user.id))
			.limit(1);

		if (!userRecord || userRecord.length === 0) {
			return c.json({ error: 'User not found' }, 404);
		}

		const quoteData = userRecord[0].inspirationalQuote;

		if (!quoteData) {
			// Return a default quote if none is stored yet
			return c.json({
				quote: 'Jeder Schritt auf deinem Weg zählt. Du hast bereits Mut bewiesen, indem du dich entschieden hast, dir selbst Raum zu geben.',
				author: 'Empathy Link',
				source: 'default'
			});
		}

		// Parse JSON if it's stored as JSON, otherwise treat as plain string (backward compatibility)
		try {
			const parsed = JSON.parse(quoteData);
			if (parsed && typeof parsed === 'object' && parsed.quote) {
				// New JSON format with quote and author
				return c.json({
					quote: parsed.quote,
					author: parsed.author || 'Unknown',
					source: 'personalized'
				});
			}
		} catch (e) {
			// Not JSON, treat as plain string (old format)
		}

		// Backward compatibility: if it's a plain string, return it as quote
		return c.json({
			quote: quoteData,
			author: 'Unknown',
			source: 'personalized'
		});

	} catch (error) {
		console.error('Error fetching inspirational quote:', error);
		return c.json({ error: 'Failed to fetch quote' }, 500);
	}
});

// GET /api/stats/tracked-needs - Get user's tracked needs (only non-deleted)
stats.get('/tracked-needs', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		// Check if deleted column exists before using it
		const hasDeletedColumn = await checkDeletedColumnExists();
		
		let userTrackedNeeds;
		if (hasDeletedColumn) {
			userTrackedNeeds = await db
				.select()
				.from(trackedNeeds)
				.where(and(
					eq(trackedNeeds.userId, user.id),
					eq(trackedNeeds.deleted, false)
				))
				.orderBy(desc(trackedNeeds.created));
		} else {
			console.warn('deleted column not found, querying without filter');
			userTrackedNeeds = await db
				.select()
				.from(trackedNeeds)
				.where(eq(trackedNeeds.userId, user.id))
				.orderBy(desc(trackedNeeds.created));
		}

		return c.json(userTrackedNeeds);
	} catch (error: any) {
		console.error('Error fetching tracked needs:', error);
		console.error('Error details:', {
			message: error?.message,
			code: error?.code,
			errno: error?.errno,
			sqlState: error?.sqlState,
			stack: error?.stack
		});
		
		// Last resort: try querying without deleted column
		try {
			console.warn('Attempting fallback query without deleted column');
			const fallbackNeeds = await db
				.select()
				.from(trackedNeeds)
				.where(eq(trackedNeeds.userId, user.id))
				.orderBy(desc(trackedNeeds.created));
			return c.json(fallbackNeeds);
		} catch (fallbackError: any) {
			console.error('Fallback query also failed:', fallbackError);
			return c.json({ error: 'Failed to fetch tracked needs' }, 500);
		}
	}
});

// POST /api/stats/tracked-needs - Save or update tracked needs (max 3)
// This now preserves existing tracked needs and only adds/updates/deletes individually
stats.post('/tracked-needs', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const body = await c.req.json();
		const { needIds } = body;

		if (!Array.isArray(needIds)) {
			return c.json({ error: 'needIds must be an array' }, 400);
		}

		if (needIds.length > 3) {
			return c.json({ error: 'Cannot track more than 3 needs' }, 400);
		}

		// Get all existing tracked needs for this user (including deleted ones for reactivation)
		const existingTrackedNeeds = await db
			.select()
			.from(trackedNeeds)
			.where(eq(trackedNeeds.userId, user.id));

		const existingByNeedId = new Map(existingTrackedNeeds.map(tn => [tn.needId, tn]));
		const needIdsSet = new Set(needIds);

		// Check if deleted column exists
		const hasDeletedColumn = await checkDeletedColumnExists();

		// Soft delete tracked needs that are not in the new list (only if deleted column exists)
		if (hasDeletedColumn) {
			const toDelete = existingTrackedNeeds.filter(tn => !needIdsSet.has(tn.needId) && !(tn as any).deleted);
			if (toDelete.length > 0) {
				const toDeleteIds = toDelete.map(tn => tn.id);
				for (const id of toDeleteIds) {
					try {
						await db
							.update(trackedNeeds)
							.set({ deleted: true, updated: sql`now()` })
							.where(eq(trackedNeeds.id, id));
					} catch (error: any) {
						// If deleted column doesn't exist, skip soft delete
						const errorMessage = error?.message || String(error || '');
						const errorCode = error?.code || error?.errno || '';
						const isColumnError = errorMessage.includes('deleted') || 
						                     errorMessage.includes('column') || 
						                     errorCode === '42703' ||
						                     errorMessage.includes('does not exist');
						
						if (isColumnError) {
							console.warn('deleted column not found, skipping soft delete. Error:', errorMessage);
							break;
						}
						throw error;
					}
				}
			}
		}

		// Insert or reactivate tracked needs
		const resultTrackedNeeds = [];
		for (const needId of needIds) {
			// Fetch need details
			const needRecord = await db
				.select()
				.from(needs)
				.where(eq(needs.id, needId))
				.limit(1);

			if (needRecord.length === 0) {
				console.warn(`Need with id ${needId} not found`);
				continue;
			}

			const need = needRecord[0];
			const existing = existingByNeedId.get(needId);

			if (existing) {
				// Check if deleted column exists
				const hasDeletedColumn = await checkDeletedColumnExists();
				const isDeleted = hasDeletedColumn && (existing as any).deleted ? (existing as any).deleted : false;
				
				// Reactivate if deleted, or update if name changed
				if (isDeleted || existing.needName !== need.nameDE) {
					try {
						const updateValues: any = {
							needName: need.nameDE,
							updated: sql`now()`
						};
						if (hasDeletedColumn) {
							updateValues.deleted = false;
						}
						
						const [updated] = await db
							.update(trackedNeeds)
							.set(updateValues)
							.where(eq(trackedNeeds.id, existing.id))
							.returning();
						if (updated) {
							resultTrackedNeeds.push(updated);
						}
					} catch (error: any) {
						// If deleted column doesn't exist, try without it
						const errorMessage = error?.message || String(error || '');
						const errorCode = error?.code || error?.errno || '';
						const isColumnError = errorMessage.includes('deleted') || 
						                     errorMessage.includes('column') || 
						                     errorCode === '42703' ||
						                     errorMessage.includes('does not exist');
						
						if (isColumnError) {
							console.warn('deleted column not found, updating without it. Error:', errorMessage);
							const [updated] = await db
								.update(trackedNeeds)
								.set({
									needName: need.nameDE,
									updated: sql`now()`
								})
								.where(eq(trackedNeeds.id, existing.id))
								.returning();
							if (updated) {
								resultTrackedNeeds.push(updated);
							}
						} else {
							throw error;
						}
					}
				} else {
					resultTrackedNeeds.push(existing);
				}
			} else {
				// Create new tracked need
				// Check if deleted column exists before inserting
				const hasDeletedColumnForInsert = await checkDeletedColumnExists();
				
				try {
					if (hasDeletedColumnForInsert) {
						// Column exists, use normal insert
						const [inserted] = await db
							.insert(trackedNeeds)
							.values({
								userId: user.id,
								needId: need.id,
								needName: need.nameDE,
								deleted: false,
							})
							.returning();

						if (inserted) {
							resultTrackedNeeds.push(inserted);
						}
					} else {
						// Column doesn't exist, use raw SQL to insert without it
						console.warn('deleted column not found, using raw SQL insert');
						const inserted = await db.execute(sql`
							INSERT INTO tracked_needs (user_id, need_id, need_name, created, updated)
							VALUES (${user.id}, ${need.id}, ${need.nameDE}, NOW(), NOW())
							RETURNING *
						`);
						
						// Extract the inserted row (Drizzle returns different formats)
						let insertedRow: any = null;
						if (Array.isArray(inserted)) {
							insertedRow = inserted[0];
						} else if (inserted.rows && Array.isArray(inserted.rows)) {
							insertedRow = inserted.rows[0];
						} else if (inserted && typeof inserted === 'object' && 'length' in inserted) {
							insertedRow = (inserted as any)[0];
						}
						
						if (insertedRow) {
							resultTrackedNeeds.push({
								id: insertedRow.id,
								userId: insertedRow.user_id,
								needId: insertedRow.need_id,
								needName: insertedRow.need_name,
								created: insertedRow.created,
								updated: insertedRow.updated,
							});
						}
					}
				} catch (error: any) {
					// If insert still fails, try raw SQL as fallback
					const errorMessage = error?.message || String(error || '');
					console.error('Insert failed, trying raw SQL fallback:', errorMessage);
					
					try {
						const inserted = await db.execute(sql`
							INSERT INTO tracked_needs (user_id, need_id, need_name, created, updated)
							VALUES (${user.id}, ${need.id}, ${need.nameDE}, NOW(), NOW())
							RETURNING *
						`);
						
						let insertedRow: any = null;
						if (Array.isArray(inserted)) {
							insertedRow = inserted[0];
						} else if (inserted.rows && Array.isArray(inserted.rows)) {
							insertedRow = inserted.rows[0];
						} else if (inserted && typeof inserted === 'object' && 'length' in inserted) {
							insertedRow = (inserted as any)[0];
						}
						
						if (insertedRow) {
							resultTrackedNeeds.push({
								id: insertedRow.id,
								userId: insertedRow.user_id,
								needId: insertedRow.need_id,
								needName: insertedRow.need_name,
								created: insertedRow.created,
								updated: insertedRow.updated,
							});
						}
					} catch (fallbackError: any) {
						console.error('Raw SQL insert also failed:', fallbackError);
						throw fallbackError;
					}
				}
			}
		}

		return c.json(resultTrackedNeeds);
	} catch (error: any) {
		console.error('Error saving tracked needs:', error);
		console.error('Error details:', {
			message: error?.message,
			code: error?.code,
			errno: error?.errno,
			sqlState: error?.sqlState,
			stack: error?.stack
		});
		return c.json({ error: 'Failed to save tracked needs' }, 500);
	}
});

// POST /api/stats/need-fill-level - Save a fill level for a tracked need
stats.post('/need-fill-level', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const body = await c.req.json();
		const { trackedNeedId, fillLevel, date } = body;

		if (!trackedNeedId || fillLevel === undefined) {
			return c.json({ error: 'trackedNeedId and fillLevel are required' }, 400);
		}

		if (fillLevel < 0 || fillLevel > 100) {
			return c.json({ error: 'fillLevel must be between 0 and 100' }, 400);
		}

		// Verify the tracked need belongs to the user (check all, including deleted for historical data)
		const trackedNeed = await db
			.select()
			.from(trackedNeeds)
			.where(and(
				eq(trackedNeeds.id, trackedNeedId),
				eq(trackedNeeds.userId, user.id)
			))
			.limit(1);

		if (trackedNeed.length === 0) {
			return c.json({ error: 'Tracked need not found or access denied' }, 404);
		}

		// Use provided date or current date
		const fillDate = date ? new Date(date) : new Date();
		// Set to start of day for uniqueness constraint
		fillDate.setHours(0, 0, 0, 0);

		// Use upsert to handle same-day updates
		const [inserted] = await db
			.insert(needFillLevels)
			.values({
				trackedNeedId,
				fillLevel: Math.round(fillLevel),
				date: fillDate.toISOString(),
			})
			.onConflictDoUpdate({
				target: [needFillLevels.trackedNeedId, needFillLevels.date],
				set: {
					fillLevel: Math.round(fillLevel),
				},
			})
			.returning();

		return c.json(inserted);
	} catch (error) {
		console.error('Error saving fill level:', error);
		return c.json({ error: 'Failed to save fill level' }, 500);
	}
});

// POST /api/stats/need-fill-levels/snapshot - Save all fill levels as a snapshot for today
stats.post('/need-fill-levels/snapshot', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const body = await c.req.json();
		const { fillLevels } = body; // { trackedNeedId: fillLevel, ... }

		if (!fillLevels || typeof fillLevels !== 'object') {
			return c.json({ error: 'fillLevels must be an object mapping trackedNeedId to fillLevel' }, 400);
		}

		// Get all non-deleted tracked needs for the user to verify ownership
		const hasDeletedColumn = await checkDeletedColumnExists();
		let userTrackedNeeds;
		if (hasDeletedColumn) {
			userTrackedNeeds = await db
				.select()
				.from(trackedNeeds)
				.where(and(
					eq(trackedNeeds.userId, user.id),
					eq(trackedNeeds.deleted, false)
				));
		} else {
			userTrackedNeeds = await db
				.select()
				.from(trackedNeeds)
				.where(eq(trackedNeeds.userId, user.id));
		}

		const trackedNeedIds = new Set(userTrackedNeeds.map(tn => tn.id));

		// Use today's date (start of day) for the snapshot
		// Normalize to UTC start of day to ensure consistent comparison
		const today = new Date();
		today.setUTCHours(0, 0, 0, 0);
		const todayISO = today.toISOString();

		// Save all fill levels for today
		const savedLevels = [];
		for (const [trackedNeedId, fillLevel] of Object.entries(fillLevels)) {
			// Verify the tracked need belongs to the user
			if (!trackedNeedIds.has(trackedNeedId)) {
				console.warn(`Tracked need ${trackedNeedId} does not belong to user ${user.id}`);
				continue;
			}

			const level = Number(fillLevel);
			if (isNaN(level) || level < 0 || level > 100) {
				console.warn(`Invalid fill level for ${trackedNeedId}: ${fillLevel}`);
				continue;
			}

			// First, check if there's an existing entry for today
			// We need to normalize the date comparison to match entries that are on the same day
			// even if they have different times
			const existingToday = await db
				.select()
				.from(needFillLevels)
				.where(
					and(
						eq(needFillLevels.trackedNeedId, trackedNeedId),
						// Use SQL to compare dates (normalize to start of day)
						sql`DATE(${needFillLevels.date}) = DATE(${todayISO})`
					)
				)
				.limit(1);

			if (existingToday.length > 0) {
				// Update existing entry for today
				const [updated] = await db
					.update(needFillLevels)
					.set({
						fillLevel: Math.round(level),
					})
					.where(eq(needFillLevels.id, existingToday[0].id))
					.returning();
				
				if (updated) {
					savedLevels.push(updated);
				}
			} else {
				// Insert new entry for today
				const [inserted] = await db
					.insert(needFillLevels)
					.values({
						trackedNeedId,
						fillLevel: Math.round(level),
						date: todayISO,
					})
					.returning();

				if (inserted) {
					savedLevels.push(inserted);
				}
			}
		}

		return c.json({
			date: todayISO,
			saved: savedLevels,
			count: savedLevels.length,
		});
	} catch (error) {
		console.error('Error saving fill level snapshot:', error);
		return c.json({ error: 'Failed to save fill level snapshot' }, 500);
	}
});

// GET /api/stats/need-fill-levels/current - Get current fill levels for all tracked needs
stats.get('/need-fill-levels/current', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		// Get all non-deleted tracked needs for user
		let userTrackedNeeds;
		try {
			userTrackedNeeds = await db
				.select()
				.from(trackedNeeds)
				.where(and(
					eq(trackedNeeds.userId, user.id),
					eq(trackedNeeds.deleted, false)
				));
		} catch (error: any) {
			// If deleted column doesn't exist, fall back to query without filter
			const errorMessage = error?.message || String(error || '');
			const errorCode = error?.code || error?.errno || '';
			const isColumnError = errorMessage.includes('deleted') || 
			                     errorMessage.includes('column') || 
			                     errorCode === '42703' ||
			                     errorMessage.includes('does not exist');
			
			if (isColumnError) {
				console.warn('deleted column not found, falling back to query without filter. Error:', errorMessage);
				userTrackedNeeds = await db
					.select()
					.from(trackedNeeds)
					.where(eq(trackedNeeds.userId, user.id));
			} else {
				throw error;
			}
		}

		// Get the most recent fill level for each tracked need
		const fillLevelsMap: Record<string, number> = {};

		for (const trackedNeed of userTrackedNeeds) {
			const latestFillLevel = await db
				.select()
				.from(needFillLevels)
				.where(eq(needFillLevels.trackedNeedId, trackedNeed.id))
				.orderBy(desc(needFillLevels.date))
				.limit(1);

			if (latestFillLevel.length > 0) {
				fillLevelsMap[trackedNeed.id] = latestFillLevel[0].fillLevel;
			}
			// Don't set to 0 if no fill level - let it be undefined (frontend will treat as null)
		}

		return c.json(fillLevelsMap);
	} catch (error) {
		console.error('Error fetching current fill levels:', error);
		return c.json({ error: 'Failed to fetch current fill levels' }, 500);
	}
});

// GET /api/stats/need-fill-levels/current-with-timestamps - Get current fill levels with timestamps
stats.get('/need-fill-levels/current-with-timestamps', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		// Get all non-deleted tracked needs for user
		let userTrackedNeeds;
		try {
			userTrackedNeeds = await db
				.select()
				.from(trackedNeeds)
				.where(and(
					eq(trackedNeeds.userId, user.id),
					eq(trackedNeeds.deleted, false)
				));
		} catch (error: any) {
			// If deleted column doesn't exist, fall back to query without filter
			const errorMessage = error?.message || String(error || '');
			const errorCode = error?.code || error?.errno || '';
			const isColumnError = errorMessage.includes('deleted') || 
			                     errorMessage.includes('column') || 
			                     errorCode === '42703' ||
			                     errorMessage.includes('does not exist');
			
			if (isColumnError) {
				console.warn('deleted column not found, falling back to query without filter. Error:', errorMessage);
				userTrackedNeeds = await db
					.select()
					.from(trackedNeeds)
					.where(eq(trackedNeeds.userId, user.id));
			} else {
				throw error;
			}
		}

		// Get the most recent fill level for each tracked need with timestamp
		const fillLevelsMap: Record<string, { fillLevel: number; lastUpdated: string | null }> = {};

		for (const trackedNeed of userTrackedNeeds) {
			const latestFillLevel = await db
				.select()
				.from(needFillLevels)
				.where(eq(needFillLevels.trackedNeedId, trackedNeed.id))
				.orderBy(desc(needFillLevels.date))
				.limit(1);

			if (latestFillLevel.length > 0) {
				fillLevelsMap[trackedNeed.id] = {
					fillLevel: latestFillLevel[0].fillLevel,
					lastUpdated: latestFillLevel[0].date
				};
			}
			// Don't include in map if no fill level exists (frontend will treat as null)
		}

		return c.json(fillLevelsMap);
	} catch (error) {
		console.error('Error fetching current fill levels with timestamps:', error);
		return c.json({ error: 'Failed to fetch current fill levels' }, 500);
	}
});

// GET /api/stats/need-timeseries/:trackedNeedId - Get timeseries data for a tracked need
stats.get('/need-timeseries/:trackedNeedId', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const trackedNeedId = c.req.param('trackedNeedId');
		const startDate = c.req.query('startDate');
		const endDate = c.req.query('endDate');

		// Verify the tracked need belongs to the user (check all, including deleted for historical data)
		const trackedNeed = await db
			.select()
			.from(trackedNeeds)
			.where(and(
				eq(trackedNeeds.id, trackedNeedId),
				eq(trackedNeeds.userId, user.id)
			))
			.limit(1);

		if (trackedNeed.length === 0) {
			return c.json({ error: 'Tracked need not found or access denied' }, 404);
		}

		// Build query conditions
		const conditions = [eq(needFillLevels.trackedNeedId, trackedNeedId)];

		if (startDate) {
			conditions.push(gte(needFillLevels.date, new Date(startDate).toISOString()));
		}

		if (endDate) {
			conditions.push(lte(needFillLevels.date, new Date(endDate).toISOString()));
		}

		const timeseriesData = await db
			.select()
			.from(needFillLevels)
			.where(and(...conditions))
			.orderBy(needFillLevels.date);

		return c.json(timeseriesData.map(item => {
			let strategies: string[] = [];
			if (item.strategies) {
				try {
					strategies = JSON.parse(item.strategies);
				} catch {
					strategies = [];
				}
			}
			return {
				id: item.id,
				date: item.date,
				fillLevel: item.fillLevel,
				strategies: strategies,
			};
		}));
	} catch (error) {
		console.error('Error fetching timeseries data:', error);
		return c.json({ error: 'Failed to fetch timeseries data' }, 500);
	}
});

// PUT /api/stats/need-fill-levels/:id/strategies - Update strategies for a fill level entry
stats.put('/need-fill-levels/:id/strategies', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const fillLevelId = c.req.param('id');
		const body = await c.req.json();
		const { strategies } = body; // Array of strings

		if (!Array.isArray(strategies)) {
			return c.json({ error: 'strategies must be an array of strings' }, 400);
		}

		// Verify the fill level entry belongs to a tracked need owned by the user
		const fillLevelEntry = await db
			.select({
				id: needFillLevels.id,
				trackedNeedId: needFillLevels.trackedNeedId,
				userId: trackedNeeds.userId,
			})
			.from(needFillLevels)
			.innerJoin(trackedNeeds, eq(needFillLevels.trackedNeedId, trackedNeeds.id))
			.where(eq(needFillLevels.id, fillLevelId))
			.limit(1);

		if (fillLevelEntry.length === 0) {
			return c.json({ error: 'Fill level entry not found' }, 404);
		}

		if (fillLevelEntry[0].userId !== user.id) {
			return c.json({ error: 'Access denied' }, 403);
		}

		// Update strategies (store as JSON string)
		const [updated] = await db
			.update(needFillLevels)
			.set({
				strategies: JSON.stringify(strategies),
			})
			.where(eq(needFillLevels.id, fillLevelId))
			.returning();

		// Parse strategies for response
		let parsedStrategies: string[] = [];
		if (updated.strategies) {
			try {
				parsedStrategies = JSON.parse(updated.strategies);
			} catch {
				parsedStrategies = [];
			}
		}

		return c.json({
			id: updated.id,
			strategies: parsedStrategies,
		});
	} catch (error) {
		console.error('Error updating strategies:', error);
		return c.json({ error: 'Failed to update strategies' }, 500);
	}
});

// Level definitions for Super Communicator
const SUPER_COMMUNICATOR_LEVELS = [
	{ id: 1, name: 'Beginner', minPoints: 0, maxPoints: 100 },
	{ id: 2, name: 'Aware', minPoints: 101, maxPoints: 250 },
	{ id: 3, name: 'Observer', minPoints: 251, maxPoints: 500 },
	{ id: 4, name: 'Feeling Explorer', minPoints: 501, maxPoints: 750 },
	{ id: 5, name: 'Need Navigator', minPoints: 751, maxPoints: 1000 },
	{ id: 6, name: 'Request Maker', minPoints: 1001, maxPoints: 1500 },
	{ id: 7, name: 'Empathy Builder', minPoints: 1501, maxPoints: 2000 },
	{ id: 8, name: 'Balanced Communicator', minPoints: 2001, maxPoints: 3000 },
	{ id: 9, name: 'Master Communicator', minPoints: 3001, maxPoints: 5000 },
	{ id: 10, name: 'Super Communicator', minPoints: 5001, maxPoints: Infinity },
];

/**
 * Calculate points for a single chat analysis
 */
function calculateChatPoints(analysis: any): number {
	let points = 10; // Base completion bonus

	// I-Statement Muscle (0-1 scale)
	if (analysis.iStatementMuscle !== undefined && analysis.iStatementMuscle !== null) {
		if (analysis.iStatementMuscle >= 0.7) points += 15;
		else if (analysis.iStatementMuscle >= 0.4) points += 10;
		else if (analysis.iStatementMuscle >= 0.1) points += 5;
	}

	// Empathy Rate (0-1 scale)
	if (analysis.empathyRate !== undefined && analysis.empathyRate !== null) {
		if (analysis.empathyRate >= 0.7) points += 15;
		else if (analysis.empathyRate >= 0.4) points += 10;
		else if (analysis.empathyRate >= 0.1) points += 5;
	}

	// Feeling Vocabulary (number of unique feelings)
	let feelingCount = 0;
	try {
		if (analysis.feelings) {
			const feelings = typeof analysis.feelings === 'string' 
				? JSON.parse(analysis.feelings) 
				: analysis.feelings;
			feelingCount = Array.isArray(feelings) ? feelings.length : 0;
		}
	} catch (e) {
		// Ignore parse errors
	}

	if (feelingCount >= 5) points += 10;
	else if (feelingCount >= 3) points += 7;
	else if (feelingCount >= 1) points += 5;

	// Clarity of Ask
	if (analysis.clarityOfAsk === 'clear') points += 10;
	else if (analysis.clarityOfAsk === 'moderate') points += 5;

	// Emotional Balance (0-1 scale, ideal is 0.4-0.6)
	if (analysis.emotionalBalance !== undefined && analysis.emotionalBalance !== null) {
		if (analysis.emotionalBalance >= 0.4 && analysis.emotionalBalance <= 0.6) {
			points += 10;
		} else if (
			(analysis.emotionalBalance >= 0.3 && analysis.emotionalBalance < 0.4) ||
			(analysis.emotionalBalance > 0.6 && analysis.emotionalBalance <= 0.7)
		) {
			points += 5;
		}
	}

	// Conflict Resolution Bonus
	if (analysis.requestResolved) points += 25;
	else if (analysis.request && analysis.request.trim().length > 0) {
		points += 10; // Active resolution attempt
	}

	return points;
}

/**
 * Get level information based on total points
 */
function getLevelInfo(totalPoints: number): {
	currentLevel: number;
	levelName: string;
	pointsInCurrentLevel: number;
	pointsNeededForNextLevel: number;
	progressPercentage: number;
} {
	// Find current level
	const currentLevel = SUPER_COMMUNICATOR_LEVELS.find(
		(level) => totalPoints >= level.minPoints && totalPoints <= level.maxPoints
	) || SUPER_COMMUNICATOR_LEVELS[0];

	const nextLevel = SUPER_COMMUNICATOR_LEVELS.find((level) => level.id === currentLevel.id + 1);

	const pointsInCurrentLevel = totalPoints - currentLevel.minPoints;
	const levelRange = currentLevel.maxPoints === Infinity 
		? 1000 // Use a reasonable range for max level
		: currentLevel.maxPoints - currentLevel.minPoints;
	const progressPercentage = nextLevel
		? (pointsInCurrentLevel / levelRange) * 100
		: 100;

	const pointsNeededForNextLevel = nextLevel
		? nextLevel.minPoints - totalPoints
		: 0;

	return {
		currentLevel: currentLevel.id,
		levelName: currentLevel.name,
		pointsInCurrentLevel,
		pointsNeededForNextLevel,
		progressPercentage: Math.min(100, Math.max(0, progressPercentage)),
	};
}

// GET /api/stats/super-communicator - Get Super Communicator progress data
stats.get('/super-communicator', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		// Fetch all analyses for the user
		const userAnalyses = await db
			.select()
			.from(analyses)
			.where(eq(analyses.userId, user.id))
			.orderBy(desc(analyses.created));

		// Parse JSON fields in analyses
		const parsedAnalyses = userAnalyses.map(analysis => {
			let feelings: string[] = [];
			let needs: string[] = [];

			try {
				if (analysis.feelings) {
					feelings = JSON.parse(analysis.feelings);
				}
			} catch (e) {
				// Ignore parse errors
			}

			try {
				if (analysis.needs) {
					needs = JSON.parse(analysis.needs);
				}
			} catch (e) {
				// Ignore parse errors
			}

			return {
				...analysis,
				feelings,
				needs,
			};
		});

		// Calculate total points and recent points
		let totalPoints = 0;
		const recentPoints: Array<{ date: string; points: number; source: 'chat' | 'learning' | 'resolution' }> = [];

		// Sort analyses by date (newest first)
		const sortedAnalyses = [...parsedAnalyses].sort(
			(a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()
		);

		// Calculate points for each analysis
		sortedAnalyses.forEach((analysis) => {
			const points = calculateChatPoints(analysis);
			totalPoints += points;

			// Track recent points (last 10)
			if (recentPoints.length < 10) {
				recentPoints.push({
					date: analysis.created,
					points,
					source: analysis.requestResolved ? 'resolution' : 'chat',
				});
			}
		});

		// Get level information
		const levelInfo = getLevelInfo(totalPoints);

		return c.json({
			totalPoints,
			...levelInfo,
			recentPoints: recentPoints.slice(0, 5), // Show last 5 activities
		});
	} catch (error) {
		console.error('Error calculating super communicator data:', error);
		return c.json({ error: 'Failed to calculate super communicator data' }, 500);
	}
});

// Helper function to check if user is admin
function isAdmin(user: any): boolean {
	return user.role === 'admin';
}

// GET /api/stats/blind-spots - Get blind spots analysis
stats.get('/blind-spots', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	console.log('👤 User object in blind-spots endpoint:', {
		id: user.id,
		email: user.email,
		role: user.role,
		fullUser: user
	});

	try {
		// Check if user is admin
		const userIsAdmin = isAdmin(user);
		console.log('🔐 Is admin?', userIsAdmin);

		// Get the most recent chat creation date
		const mostRecentChat = await db
			.select()
			.from(chats)
			.where(eq(chats.userId, user.id))
			.orderBy(desc(chats.created))
			.limit(1);

		if (!mostRecentChat || mostRecentChat.length === 0) {
			// No chats yet - return empty response
			return c.json({
				message: 'Starte deine erste Konversation, um Muster und Blind Spots zu erkennen.',
				hasInsight: false,
				isAdmin: userIsAdmin
			});
		}

		const newestChatDate = new Date(mostRecentChat[0].created);

		// Check if we have existing blind spot analyses (get last 4 for duplicate detection)
		const existingBlindSpots = await db
			.select()
			.from(blindSpots)
			.where(eq(blindSpots.userId, user.id))
			.orderBy(desc(blindSpots.created))
			.limit(4);

		// Get the most recent analysis
		const mostRecentBlindSpot = existingBlindSpots.length > 0 ? existingBlindSpots[0] : null;

		// If we have an existing analysis, check weekly limit and new chat condition
		if (mostRecentBlindSpot) {
			const lastAnalysisDate = new Date(mostRecentBlindSpot.created);
			const lastAnalyzedChatDate = new Date(mostRecentBlindSpot.lastChatCreatedDate);
			const now = new Date();

			// Calculate next available date (7 days from last analysis)
			const nextAvailableDate = new Date(lastAnalysisDate);
			nextAvailableDate.setDate(nextAvailableDate.getDate() + 7);
			
			// Calculate days since last analysis
			const daysSinceLastAnalysis = Math.floor((now.getTime() - lastAnalysisDate.getTime()) / (1000 * 60 * 60 * 24));
			
			// Calculate days until next analysis based on the actual next available date
			const daysUntilNextAnalysis = Math.max(0, Math.ceil((nextAvailableDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

			console.log('📊 Blind Spots - Analysis check:');
			console.log('   Days since last analysis:', daysSinceLastAnalysis);
			console.log('   Days until next analysis:', daysUntilNextAnalysis);
			console.log('   Newest chat date:', newestChatDate.toISOString());
			console.log('   Last analyzed chat date:', lastAnalyzedChatDate.toISOString());

			// Parse existing analysis data
			let patterns: string[] = [];
			let situations: string[] = [];

			try {
				if (mostRecentBlindSpot.patterns) {
					patterns = JSON.parse(mostRecentBlindSpot.patterns);
				}
			} catch (e) {
				console.error('Failed to parse patterns:', e);
			}

			try {
				if (mostRecentBlindSpot.situations) {
					situations = JSON.parse(mostRecentBlindSpot.situations);
				}
			} catch (e) {
				console.error('Failed to parse situations:', e);
			}

			// Check if weekly limit is active
			if (daysSinceLastAnalysis < 7) {
				console.log('⏳ Weekly limit active, returning existing analysis');

				return c.json({
					id: mostRecentBlindSpot.id,
					analysis: mostRecentBlindSpot.analysis,
					patterns,
					situations,
					advice: mostRecentBlindSpot.advice,
					created: mostRecentBlindSpot.created,
					hasInsight: true,
					canGenerateNew: userIsAdmin, // Admins can always generate
					isAdmin: userIsAdmin,
					nextAvailableDate: nextAvailableDate.toISOString(),
					daysUntilNext: daysUntilNextAnalysis
				});
			}

			// Check if new chat was created since last analysis
			if (newestChatDate.getTime() <= lastAnalyzedChatDate.getTime()) {
				console.log('✅ Returning existing analysis (no new chats since last analysis)');

				return c.json({
					id: mostRecentBlindSpot.id,
					analysis: mostRecentBlindSpot.analysis,
					patterns,
					situations,
					advice: mostRecentBlindSpot.advice,
					created: mostRecentBlindSpot.created,
					hasInsight: true,
					canGenerateNew: true,
					isAdmin: userIsAdmin,
					message: 'Führe ein neues Gespräch, um eine aktualisierte Analyse zu erhalten.'
				});
			}

			// New chat detected but weekly limit not passed - return existing analysis
			console.log('🔄 New chat detected but returning existing analysis (manual generation required)');
			
			return c.json({
				id: mostRecentBlindSpot.id,
				analysis: mostRecentBlindSpot.analysis,
				patterns,
				situations,
				advice: mostRecentBlindSpot.advice,
				created: mostRecentBlindSpot.created,
				hasInsight: true,
				canGenerateNew: daysSinceLastAnalysis >= 7,
				isAdmin: userIsAdmin,
				nextAvailableDate: nextAvailableDate.toISOString(),
				daysUntilNext: daysUntilNextAnalysis,
				message: daysSinceLastAnalysis >= 7 
					? 'Neue Analyse verfügbar - klicke auf "Neu generieren" um eine aktualisierte Analyse zu erstellen.'
					: `Nächste Analyse in ${daysUntilNextAnalysis} ${daysUntilNextAnalysis === 1 ? 'Tag' : 'Tagen'} verfügbar.`
			});
		} else {
			// No existing analysis - return empty state
			console.log('🆕 No existing blind spot analysis found');
			
			return c.json({
				message: 'Klicke auf "Neu generieren" um deine erste Analyse zu erstellen.',
				hasInsight: false,
				canGenerateNew: true,
				isAdmin: userIsAdmin
			});
		}

		// Fetch all chats and analyses for context
		const userChats = await db
			.select()
			.from(chats)
			.where(eq(chats.userId, user.id))
			.orderBy(desc(chats.created))
			.limit(10); // Last 10 chats for analysis

		const userAnalyses = await db
			.select()
			.from(analyses)
			.where(eq(analyses.userId, user.id))
			.orderBy(desc(analyses.created))
			.limit(10); // Last 10 analyses

		const userMemories = await db
			.select()
			.from(memories)
			.where(eq(memories.userId, user.id))
			.orderBy(desc(memories.created))
			.limit(20); // Last 20 memories

		// Build context for AI analysis
		const analysesContext = userAnalyses.map(a => {
			let feelings: string[] = [];
			let needs: string[] = [];

			try {
				if (a.feelings) feelings = JSON.parse(a.feelings);
				if (a.needs) needs = JSON.parse(a.needs);
			} catch (e) {
				// Ignore parse errors
			}

			return {
				title: a.title,
				observation: a.observation,
				feelings,
				needs,
				request: a.request,
				created: a.created
			};
		});

		const memoriesContext = userMemories.map(m => ({
			type: m.type,
			key: m.key,
			value: m.value,
			confidence: m.confidence
		}));

		// Get user's name for personalized addressing
		const userName = user.name || 'du';
		const userFirstName = user.firstName || userName.split(' ')[0] || 'du';

		// Build context of previous analyses to avoid duplicates
		const previousAnalyses = existingBlindSpots.map(bs => {
			let prevPatterns: string[] = [];
			let prevAdvice = '';

			try {
				if (bs.patterns) prevPatterns = JSON.parse(bs.patterns);
				prevAdvice = bs.advice || '';
			} catch (e) {
				// Ignore parse errors
			}

			return {
				patterns: prevPatterns,
				advice: prevAdvice,
				created: bs.created
			};
		});

		// Generate AI analysis using Gemini
		const ai = getAiClient();

		const systemPrompt = `Du bist ein einfühlsamer Coach für Gewaltfreie Kommunikation und Selbstreflexion.

Analysiere die Chats, Reflexionen und Erinnerungen von ${userFirstName}, um wiederkehrende Muster und Blind Spots zu erkennen.

WICHTIG - Personalisierung:
- Sprich ${userFirstName} DIREKT an (verwende "${userFirstName}" oder "du/dich/dir")
- Sage NIEMALS "der Nutzer", "die Person" oder ähnliche unpersönliche Formulierungen
- Beispiel RICHTIG: "${userFirstName}, du zeigst ein Muster von..." oder "Du neigst dazu..."
- Beispiel FALSCH: "Der Nutzer zeigt ein Muster von..."

WICHTIG - Vermeidung von Duplikaten:
- Vermeide Ratschläge und Muster, die bereits in früheren Analysen gegeben wurden
- Finde NEUE Perspektiven und Erkenntnisse
- Baue auf früheren Analysen auf, wiederhole sie aber nicht

WICHTIG - Inhalt:
- Fokussiere auf konstruktive, unterstützende Beobachtungen
- Identifiziere wiederkehrende emotionale Muster
- Erkenne Situationen, in denen diese Muster auftreten
- Gib konkrete, umsetzbare Ratschläge für mehr Selbstbewusstsein
- Sei empathisch und wertschätzend, nie verurteilend
- Verwende eine warme, persönliche Sprache (du-Form)

WICHTIG - Länge und Stil:
- Halte ALLES kurz und prägnant
- Analysis: Maximal 2 kurze Sätze
- Patterns: Jeweils maximal 8-10 Wörter pro Muster
- Situations: Jeweils maximal 6-8 Wörter pro Situation
- Advice: Maximal 1-2 kurze, klare Sätze

WICHTIG - Formatierung:
- Verwende NUR reinen Text, KEIN Markdown
- KEINE Sternchen (*), KEINE Unterstriche (_), KEINE #-Zeichen
- Nur einfacher, gut lesbarer Text

Antworte ausschließlich mit einem JSON-Objekt in diesem Format:
{
  "analysis": "Eine SEHR kurze Zusammenfassung (maximal 2 Sätze), DIREKT an ${userFirstName} gerichtet",
  "patterns": ["Kurzes Muster 1 (max 10 Wörter)", "Kurzes Muster 2", "Kurzes Muster 3"],
  "situations": ["Kurze Situation 1 (max 8 Wörter)", "Kurze Situation 2"],
  "advice": "Ein prägnanter Ratschlag (1-2 kurze Sätze) für ${userFirstName}"
}`;

		let contextMessage = `Analysiere folgende Daten von ${userFirstName}:

REFLEXIONEN (letzte ${analysesContext.length} Analysen):
${JSON.stringify(analysesContext, null, 2)}

ERINNERUNGEN (letzte ${memoriesContext.length}):
${JSON.stringify(memoriesContext, null, 2)}`;

		// Add previous analyses context if available
		if (previousAnalyses.length > 0) {
			contextMessage += `

FRÜHERE ANALYSEN (letzte ${previousAnalyses.length}, NICHT WIEDERHOLEN):
${JSON.stringify(previousAnalyses, null, 2)}

WICHTIG: Vermeide diese bereits gegebenen Muster und Ratschläge. Finde NEUE Erkenntnisse!`;
		}

		contextMessage += `

Identifiziere wiederkehrende Muster, Blind Spots und gib hilfreiche Ratschläge für ${userFirstName}.
Sprich ${userFirstName} DIREKT an - sage NIEMALS "der Nutzer" oder ähnliches!`;

		const model = ai.chats.create({
			model: 'gemini-2.5-flash',
			config: {
				temperature: 0.7,
				systemInstruction: systemPrompt
			}
		});

		const result = await model.sendMessage({ message: contextMessage });
		const responseText = result.text || '{}';

		// Clean the response text
		let cleanedResponseText = responseText.trim();
		if (cleanedResponseText.startsWith('```json')) {
			cleanedResponseText = cleanedResponseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
		} else if (cleanedResponseText.startsWith('```')) {
			cleanedResponseText = cleanedResponseText.replace(/^```\s*/, '').replace(/\s*```$/, '');
		}

		const aiAnalysis = JSON.parse(cleanedResponseText);

		// Store the new analysis in the database
		const [newBlindSpot] = await db
			.insert(blindSpots)
			.values({
				userId: user.id,
				analysis: aiAnalysis.analysis,
				patterns: JSON.stringify(aiAnalysis.patterns || []),
				situations: JSON.stringify(aiAnalysis.situations || []),
				advice: aiAnalysis.advice,
				lastChatCreatedDate: newestChatDate.toISOString()
			})
			.returning();

		console.log('Created new blind spot analysis:', newBlindSpot.id);

		return c.json({
			id: newBlindSpot.id,
			analysis: aiAnalysis.analysis,
			patterns: aiAnalysis.patterns || [],
			situations: aiAnalysis.situations || [],
			advice: aiAnalysis.advice,
			created: newBlindSpot.created,
			hasInsight: true,
			isAdmin: userIsAdmin,
			canGenerateNew: false
		});

	} catch (error) {
		console.error('Error fetching blind spots:', error);
		return c.json({ error: 'Failed to fetch blind spots analysis' }, 500);
	}
});

// POST /api/stats/blind-spots/generate - Force generate a new blind spots analysis
stats.post('/blind-spots/generate', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const userIsAdmin = isAdmin(user);

		// Get the most recent chat creation date
		const mostRecentChat = await db
			.select()
			.from(chats)
			.where(eq(chats.userId, user.id))
			.orderBy(desc(chats.created))
			.limit(1);

		if (!mostRecentChat || mostRecentChat.length === 0) {
			return c.json({
				error: 'Keine Chats gefunden',
				message: 'Starte deine erste Konversation, um Muster und Blind Spots zu erkennen.',
				hasInsight: false
			}, 400);
		}

		const newestChatDate = new Date(mostRecentChat[0].created);

		// Check if we have existing blind spot analyses (for duplicate detection)
		const existingBlindSpots = await db
			.select()
			.from(blindSpots)
			.where(eq(blindSpots.userId, user.id))
			.orderBy(desc(blindSpots.created))
			.limit(4);

		const mostRecentBlindSpot = existingBlindSpots.length > 0 ? existingBlindSpots[0] : null;

		// Check weekly limit for non-admins
		if (mostRecentBlindSpot && !userIsAdmin) {
			const lastAnalysisDate = new Date(mostRecentBlindSpot.created);
			const now = new Date();
			
			// Calculate next available date (7 days from last analysis)
			const nextAvailableDate = new Date(lastAnalysisDate);
			nextAvailableDate.setDate(nextAvailableDate.getDate() + 7);
			
			const daysSinceLastAnalysis = Math.floor((now.getTime() - lastAnalysisDate.getTime()) / (1000 * 60 * 60 * 24));

			if (daysSinceLastAnalysis < 7) {
				// Calculate days until next analysis based on the actual next available date
				const daysUntilNextAnalysis = Math.max(0, Math.ceil((nextAvailableDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
				return c.json({
					error: 'Weekly limit active',
					message: `Du kannst in ${daysUntilNextAnalysis} ${daysUntilNextAnalysis === 1 ? 'Tag' : 'Tagen'} eine neue Analyse erstellen.`,
					canGenerateNew: false
				}, 429); // 429 Too Many Requests
			}
		}

		console.log(`🔄 Force generating new blind spot analysis (Admin: ${userIsAdmin})`);

		// Fetch data for analysis
		const userAnalyses = await db
			.select()
			.from(analyses)
			.where(eq(analyses.userId, user.id))
			.orderBy(desc(analyses.created))
			.limit(10);

		const userMemories = await db
			.select()
			.from(memories)
			.where(eq(memories.userId, user.id))
			.orderBy(desc(memories.created))
			.limit(20);

		// Build context for AI analysis
		const analysesContext = userAnalyses.map(a => {
			let feelings: string[] = [];
			let needs: string[] = [];

			try {
				if (a.feelings) feelings = JSON.parse(a.feelings);
				if (a.needs) needs = JSON.parse(a.needs);
			} catch (e) {
				// Ignore parse errors
			}

			return {
				title: a.title,
				observation: a.observation,
				feelings,
				needs,
				request: a.request,
				created: a.created
			};
		});

		const memoriesContext = userMemories.map(m => ({
			type: m.type,
			key: m.key,
			value: m.value,
			confidence: m.confidence
		}));

		// Get user's name for personalized addressing
		const userName = user.name || 'du';
		const userFirstName = user.firstName || userName.split(' ')[0] || 'du';

		// Build context of previous analyses to avoid duplicates
		const previousAnalyses = existingBlindSpots.map(bs => {
			let prevPatterns: string[] = [];
			let prevAdvice = '';

			try {
				if (bs.patterns) prevPatterns = JSON.parse(bs.patterns);
				prevAdvice = bs.advice || '';
			} catch (e) {
				// Ignore parse errors
			}

			return {
				patterns: prevPatterns,
				advice: prevAdvice,
				created: bs.created
			};
		});

		// Generate AI analysis using Gemini
		const ai = getAiClient();

		const systemPrompt = `Du bist ein einfühlsamer Coach für Gewaltfreie Kommunikation und Selbstreflexion.

Analysiere die Chats, Reflexionen und Erinnerungen von ${userFirstName}, um wiederkehrende Muster und Blind Spots zu erkennen.

WICHTIG - Personalisierung:
- Sprich ${userFirstName} DIREKT an (verwende "${userFirstName}" oder "du/dich/dir")
- Sage NIEMALS "der Nutzer", "die Person" oder ähnliche unpersönliche Formulierungen
- Beispiel RICHTIG: "${userFirstName}, du zeigst ein Muster von..." oder "Du neigst dazu..."
- Beispiel FALSCH: "Der Nutzer zeigt ein Muster von..."

WICHTIG - Vermeidung von Duplikaten:
- Vermeide Ratschläge und Muster, die bereits in früheren Analysen gegeben wurden
- Finde NEUE Perspektiven und Erkenntnisse
- Baue auf früheren Analysen auf, wiederhole sie aber nicht

WICHTIG - Inhalt:
- Fokussiere auf konstruktive, unterstützende Beobachtungen
- Identifiziere wiederkehrende emotionale Muster
- Erkenne Situationen, in denen diese Muster auftreten
- Gib konkrete, umsetzbare Ratschläge für mehr Selbstbewusstsein
- Sei empathisch und wertschätzend, nie verurteilend
- Verwende eine warme, persönliche Sprache (du-Form)

WICHTIG - Länge und Stil:
- Halte ALLES kurz und prägnant
- Analysis: Maximal 2 kurze Sätze
- Patterns: Jeweils maximal 8-10 Wörter pro Muster
- Situations: Jeweils maximal 6-8 Wörter pro Situation
- Advice: Maximal 1-2 kurze, klare Sätze

WICHTIG - Formatierung:
- Verwende NUR reinen Text, KEIN Markdown
- KEINE Sternchen (*), KEINE Unterstriche (_), KEINE #-Zeichen
- Nur einfacher, gut lesbarer Text

Antworte ausschließlich mit einem JSON-Objekt in diesem Format:
{
  "analysis": "Eine SEHR kurze Zusammenfassung (maximal 2 Sätze), DIREKT an ${userFirstName} gerichtet",
  "patterns": ["Kurzes Muster 1 (max 10 Wörter)", "Kurzes Muster 2", "Kurzes Muster 3"],
  "situations": ["Kurze Situation 1 (max 8 Wörter)", "Kurze Situation 2"],
  "advice": "Ein prägnanter Ratschlag (1-2 kurze Sätze) für ${userFirstName}"
}`;

		let contextMessage = `Analysiere folgende Daten von ${userFirstName}:

REFLEXIONEN (letzte ${analysesContext.length} Analysen):
${JSON.stringify(analysesContext, null, 2)}

ERINNERUNGEN (letzte ${memoriesContext.length}):
${JSON.stringify(memoriesContext, null, 2)}`;

		if (previousAnalyses.length > 0) {
			contextMessage += `

FRÜHERE ANALYSEN (letzte ${previousAnalyses.length}, NICHT WIEDERHOLEN):
${JSON.stringify(previousAnalyses, null, 2)}

WICHTIG: Vermeide diese bereits gegebenen Muster und Ratschläge. Finde NEUE Erkenntnisse!`;
		}

		contextMessage += `

Identifiziere wiederkehrende Muster, Blind Spots und gib hilfreiche Ratschläge für ${userFirstName}.
Sprich ${userFirstName} DIREKT an - sage NIEMALS "der Nutzer" oder ähnliches!`;

		const model = ai.chats.create({
			model: 'gemini-2.5-flash',
			config: {
				temperature: 0.7,
				systemInstruction: systemPrompt
			}
		});

		const result = await model.sendMessage({ message: contextMessage });
		const responseText = result.text || '{}';

		// Clean the response text
		let cleanedResponseText = responseText.trim();
		if (cleanedResponseText.startsWith('```json')) {
			cleanedResponseText = cleanedResponseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
		} else if (cleanedResponseText.startsWith('```')) {
			cleanedResponseText = cleanedResponseText.replace(/^```\s*/, '').replace(/\s*```$/, '');
		}

		const aiAnalysis = JSON.parse(cleanedResponseText);

		// Store the new analysis in the database
		const [newBlindSpot] = await db
			.insert(blindSpots)
			.values({
				userId: user.id,
				analysis: aiAnalysis.analysis,
				patterns: JSON.stringify(aiAnalysis.patterns || []),
				situations: JSON.stringify(aiAnalysis.situations || []),
				advice: aiAnalysis.advice,
				lastChatCreatedDate: newestChatDate.toISOString()
			})
			.returning();

		console.log('✅ Force generated new blind spot analysis:', newBlindSpot.id);

		return c.json({
			id: newBlindSpot.id,
			analysis: aiAnalysis.analysis,
			patterns: aiAnalysis.patterns || [],
			situations: aiAnalysis.situations || [],
			advice: aiAnalysis.advice,
			created: newBlindSpot.created,
			hasInsight: true,
			isAdmin: userIsAdmin,
			canGenerateNew: false
		});

	} catch (error) {
		console.error('Error generating blind spots:', error);
		return c.json({ error: 'Failed to generate blind spots analysis' }, 500);
	}
});

// DELETE /api/stats/tracked-needs/:trackedNeedId - Soft delete a tracked need
stats.delete('/tracked-needs/:trackedNeedId', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const trackedNeedId = c.req.param('trackedNeedId');

		// Verify the tracked need belongs to the user
		const trackedNeed = await db
			.select()
			.from(trackedNeeds)
			.where(and(
				eq(trackedNeeds.id, trackedNeedId),
				eq(trackedNeeds.userId, user.id)
			))
			.limit(1);

		if (trackedNeed.length === 0) {
			return c.json({ error: 'Tracked need not found or access denied' }, 404);
		}

		// Soft delete: set deleted flag to true (don't actually delete the record)
		try {
			await db
				.update(trackedNeeds)
				.set({ deleted: true, updated: sql`now()` })
				.where(eq(trackedNeeds.id, trackedNeedId));
		} catch (error: any) {
			// If deleted column doesn't exist, return error asking to run migration
			const errorMessage = error?.message || String(error || '');
			const errorCode = error?.code || error?.errno || '';
			const isColumnError = errorMessage.includes('deleted') || 
			                     errorMessage.includes('column') || 
			                     errorCode === '42703' ||
			                     errorMessage.includes('does not exist');
			
			if (isColumnError) {
				console.warn('deleted column not found in DELETE endpoint. Error:', errorMessage);
				return c.json({ 
					error: 'Soft delete not available. Please run database migration to add deleted column.' 
				}, 500);
			}
			throw error;
		}

		return c.json({ success: true });
	} catch (error) {
		console.error('Error deleting tracked need:', error);
		return c.json({ error: 'Failed to delete tracked need' }, 500);
	}
});

// GET /api/stats/tracked-needs/:trackedNeedId/strategies - Get strategies for a tracked need
stats.get('/tracked-needs/:trackedNeedId/strategies', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const trackedNeedId = c.req.param('trackedNeedId');

		// Verify the tracked need belongs to the user
		const trackedNeed = await db
			.select()
			.from(trackedNeeds)
			.where(and(
				eq(trackedNeeds.id, trackedNeedId),
				eq(trackedNeeds.userId, user.id)
			))
			.limit(1);

		if (trackedNeed.length === 0) {
			return c.json({ error: 'Tracked need not found or access denied' }, 404);
		}

		// Parse strategies from JSON string
		let strategies: string[] = [];
		if (trackedNeed[0].strategies) {
			try {
				strategies = JSON.parse(trackedNeed[0].strategies);
			} catch (e) {
				console.error('Failed to parse strategies:', e);
				strategies = [];
			}
		}

		// Parse doneStrategies from JSON string
		let doneStrategies: number[] = [];
		if ((trackedNeed[0] as any).doneStrategies) {
			try {
				doneStrategies = JSON.parse((trackedNeed[0] as any).doneStrategies);
			} catch (e) {
				console.error('Failed to parse doneStrategies:', e);
				doneStrategies = [];
			}
		}

		return c.json({ strategies, doneStrategies });
	} catch (error) {
		console.error('Error fetching strategies:', error);
		return c.json({ error: 'Failed to fetch strategies' }, 500);
	}
});

// PUT /api/stats/tracked-needs/:trackedNeedId/strategies - Update strategies for a tracked need
stats.put('/tracked-needs/:trackedNeedId/strategies', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const trackedNeedId = c.req.param('trackedNeedId');
		const body = await c.req.json();
		const { strategies, doneStrategies } = body; // strategies: Array of strings, doneStrategies: Array of numbers (indices)

		if (!Array.isArray(strategies)) {
			return c.json({ error: 'strategies must be an array of strings' }, 400);
		}

		// Verify the tracked need belongs to the user
		const trackedNeed = await db
			.select()
			.from(trackedNeeds)
			.where(and(
				eq(trackedNeeds.id, trackedNeedId),
				eq(trackedNeeds.userId, user.id)
			))
			.limit(1);

		if (trackedNeed.length === 0) {
			return c.json({ error: 'Tracked need not found or access denied' }, 404);
		}

		// Prepare update object
		const updateData: any = {
			strategies: JSON.stringify(strategies),
			updated: sql`now()`,
		};

		// Update doneStrategies if provided
		if (doneStrategies !== undefined) {
			if (!Array.isArray(doneStrategies)) {
				return c.json({ error: 'doneStrategies must be an array of numbers' }, 400);
			}
			updateData.doneStrategies = JSON.stringify(doneStrategies);
		}

		// Update strategies (store as JSON string)
		const [updated] = await db
			.update(trackedNeeds)
			.set(updateData)
			.where(eq(trackedNeeds.id, trackedNeedId))
			.returning();

		// Parse strategies for response
		let parsedStrategies: string[] = [];
		if (updated.strategies) {
			try {
				parsedStrategies = JSON.parse(updated.strategies);
			} catch {
				parsedStrategies = [];
			}
		}

		// Parse doneStrategies for response
		let parsedDoneStrategies: number[] = [];
		if ((updated as any).doneStrategies) {
			try {
				parsedDoneStrategies = JSON.parse((updated as any).doneStrategies);
			} catch {
				parsedDoneStrategies = [];
			}
		}

		return c.json({
			id: updated.id,
			strategies: parsedStrategies,
			doneStrategies: parsedDoneStrategies,
		});
	} catch (error) {
		console.error('Error updating strategies:', error);
		return c.json({ error: 'Failed to update strategies' }, 500);
	}
});

export default stats;
