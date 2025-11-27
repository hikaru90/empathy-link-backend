import { Hono } from 'hono';
import type { Context } from 'hono';

const testRuns = new Hono();

// POST /api/test-runs - Create a test run
testRuns.post('/', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const testRunData = await c.req.json();

		console.log('📥 Received test run data:', testRunData);
		console.log('🔍 Required fields check:', {
			test_type: testRunData.test_type,
			total_tests: testRunData.total_tests,
			hasTestType: !!testRunData.test_type,
			hasTotalTests: !!testRunData.total_tests
		});

		// Validate required fields
		if (!testRunData.test_type || testRunData.total_tests === undefined || testRunData.total_tests === null) {
			console.log('❌ Validation failed - missing required fields');
			return c.json({ error: 'Missing required fields' }, 400);
		}

		// Map test types to valid values
		let validTestType = testRunData.test_type;
		if (testRunData.test_type === 'multi_turn') {
			validTestType = 'quality';
		}

		// Extract unique paths from detailed results if available
		let uniquePathsUsed = testRunData.unique_paths_used || [];
		if (testRunData.detailed_results && testRunData.detailed_results.length > 0) {
			const pathsFromResults = testRunData.detailed_results.flatMap((result: any) =>
				result.pathResults ? result.pathResults.map((pr: any) => pr.pathId) : []
			);
			if (pathsFromResults.length > 0) {
				uniquePathsUsed = [...new Set(pathsFromResults)];
			}
		}

		const dataToSave = {
			test_type: String(validTestType),
			test_scenarios: testRunData.test_scenarios || [],
			prompt_versions_tested: testRunData.prompt_versions_tested || [],
			debug_mode: Boolean(testRunData.debug_mode),
			notes: testRunData.notes || `Multi-turn conversation test: ${testRunData.test_type}`,
			total_tests: Number(testRunData.total_tests),
			passed: Number(testRunData.passed || 0),
			pass_rate: Number(testRunData.pass_rate || 0),
			average_score: Number(testRunData.average_score || 0),
			total_conversations: Number(testRunData.total_conversations || testRunData.total_tests || 0),
			unique_paths_used: uniquePathsUsed,
			path_switching_quality: Number(testRunData.path_switching_quality || 0),
			detailed_results: testRunData.detailed_results || [],
			user_id: user.id,
			duration_ms: Number(testRunData.duration_ms || 0),
			export_url: testRunData.export_url || ''
		};

		console.log('💾 Data to save (with proper types):', {
			...dataToSave,
			detailed_results: `[${dataToSave.detailed_results.length} items]`
		});

		// TODO: Save to database using Drizzle ORM
		// const record = await db.insert(testRunsTable).values(dataToSave).returning();

		return c.json({
			id: 'placeholder-id', // TODO: Use actual record.id
			message: 'Test run saved successfully'
		});

	} catch (error: any) {
		console.error('Error saving test run:', error);
		console.error('Error details:', {
			message: error.message,
		});

		return c.json({
			error: 'Failed to save test run',
			details: error.message,
		}, 500);
	}
});

// GET /api/test-runs - Get test runs
testRuns.get('/', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const latestOnly = c.req.query('latest') === 'true';
		const limit = parseInt(c.req.query('limit') || '50');
		const testType = c.req.query('test_type');

		if (latestOnly) {
			// TODO: Get only the latest test run from database
			// const records = await db.select().from(testRunsTable)
			//   .where(eq(testRunsTable.user_id, user.id))
			//   .orderBy(desc(testRunsTable.created))
			//   .limit(1);

			const latestTestRun = null; // TODO: Use records[0] or null

			return c.json({
				latestTestRun,
				hasTestRuns: false // TODO: records.length > 0
			});
		} else {
			// TODO: Get test runs for the current user
			// let query = db.select().from(testRunsTable)
			//   .where(eq(testRunsTable.user_id, user.id));
			// if (testType) {
			//   query = query.where(eq(testRunsTable.test_type, testType));
			// }
			// const records = await query.orderBy(desc(testRunsTable.created))
			//   .limit(Math.min(limit, 100));

			return c.json({
				testRuns: [] // TODO: Use records
			});
		}

	} catch (error: any) {
		console.error('Error fetching test runs:', error);
		return c.json({
			error: 'Failed to fetch test runs',
			details: error.message
		}, 500);
	}
});

// GET /api/test-runs/latest - Get latest test run
testRuns.get('/latest', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		// TODO: Get the latest test run for the current user
		// const records = await db.select().from(testRunsTable)
		//   .where(eq(testRunsTable.user_id, user.id))
		//   .orderBy(desc(testRunsTable.created))
		//   .limit(1);

		const latestTestRun = null; // TODO: Use records[0] or null

		return c.json({
			latestTestRun,
			hasTestRuns: false // TODO: records.length > 0
		});

	} catch (error: any) {
		console.error('Error fetching latest test run:', error);
		return c.json({
			error: 'Failed to fetch latest test run',
			details: error.message
		}, 500);
	}
});

export default testRuns;
