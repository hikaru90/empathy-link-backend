import { Hono } from 'hono';
import type { Context } from 'hono';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, desc } from 'drizzle-orm';
import { analyses, chats as chatsTable } from '../../drizzle/schema.js';
import { decryptChatHistory } from '../lib/encryption.js';

const db = drizzle(process.env.DATABASE_URL!);
const analysesRouter = new Hono();

// GET /api/analyses - Get all analyses for the authenticated user
analysesRouter.get('/', async (c: Context) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const userAnalyses = await db
      .select()
      .from(analyses)
      .where(eq(analyses.userId, user.id))
      .orderBy(desc(analyses.created));

    // Parse JSON fields
    const parsedAnalyses = userAnalyses.map(analysis => {
      let feelings: string[] = [];
      let needs: string[] = [];

      try {
        if (analysis.feelings) {
          feelings = JSON.parse(analysis.feelings);
        }
      } catch (e) {
        console.error('Failed to parse feelings for analysis:', analysis.id, e);
      }

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

    return c.json({ analyses: parsedAnalyses });
  } catch (error) {
    console.error('Error fetching analyses:', error);
    return c.json({ error: 'Failed to fetch analyses' }, 500);
  }
});

// GET /api/analyses/:id - Get a specific analysis by ID
analysesRouter.get('/:id', async (c: Context) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const analysisId = c.req.param('id');

    // Fetch the analysis
    const analysisRecord = await db
      .select()
      .from(analyses)
      .where(eq(analyses.id, analysisId))
      .limit(1);

    if (!analysisRecord || analysisRecord.length === 0) {
      return c.json({ error: 'Analysis not found' }, 404);
    }

    const analysis = analysisRecord[0];

    // Check authorization
    if (analysis.userId !== user.id) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    // Parse JSON fields
    let feelings: string[] = [];
    let needs: string[] = [];

    try {
      if (analysis.feelings) {
        feelings = JSON.parse(analysis.feelings);
      }
    } catch (e) {
      console.error('Failed to parse feelings:', e);
    }

    try {
      if (analysis.needs) {
        needs = JSON.parse(analysis.needs);
      }
    } catch (e) {
      console.error('Failed to parse needs:', e);
    }

    // Fetch associated chat history if chatId exists
    let chatHistory = [];
    if (analysis.chatId) {
      try {
        const chatRecord = await db
          .select()
          .from(chatsTable)
          .where(eq(chatsTable.id, analysis.chatId))
          .limit(1);

        if (chatRecord && chatRecord.length > 0) {
          const encryptedHistory = JSON.parse(chatRecord[0].history || '[]');
          chatHistory = decryptChatHistory(encryptedHistory);
        }
      } catch (e) {
        console.error('Failed to fetch or decrypt chat history:', e);
        // Don't fail the request if chat history can't be loaded
      }
    }

    return c.json({
      ...analysis,
      feelings,
      needs,
      chatHistory,
    });
  } catch (error) {
    console.error('Error fetching analysis:', error);
    return c.json({ error: 'Failed to fetch analysis' }, 500);
  }
});

// PATCH /api/analyses/:id - Update analysis fields (specifically request_resolved and request_archived)
analysesRouter.patch('/:id', async (c: Context) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const analysisId = c.req.param('id');
    const body = await c.req.json();

    // Fetch the analysis first to verify ownership
    const analysisRecord = await db
      .select()
      .from(analyses)
      .where(eq(analyses.id, analysisId))
      .limit(1);

    if (!analysisRecord || analysisRecord.length === 0) {
      return c.json({ error: 'Analysis not found' }, 404);
    }

    const analysis = analysisRecord[0];

    // Check authorization
    if (analysis.userId !== user.id) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    // Build update object - only allow updating request_resolved and request_archived
    const updateData: any = {
      updated: new Date().toISOString(),
    };

    if (body.requestResolved !== undefined) {
      updateData.requestResolved = body.requestResolved;
    }

    if (body.requestArchived !== undefined) {
      updateData.requestArchived = body.requestArchived;
    }

    // Update the analysis
    await db
      .update(analyses)
      .set(updateData)
      .where(eq(analyses.id, analysisId));

    // Fetch updated analysis
    const updatedRecord = await db
      .select()
      .from(analyses)
      .where(eq(analyses.id, analysisId))
      .limit(1);

    const updatedAnalysis = updatedRecord[0];

    // Parse JSON fields
    let feelings: string[] = [];
    let needs: string[] = [];

    try {
      if (updatedAnalysis.feelings) {
        feelings = JSON.parse(updatedAnalysis.feelings);
      }
    } catch (e) {
      console.error('Failed to parse feelings:', e);
    }

    try {
      if (updatedAnalysis.needs) {
        needs = JSON.parse(updatedAnalysis.needs);
      }
    } catch (e) {
      console.error('Failed to parse needs:', e);
    }

    return c.json({
      ...updatedAnalysis,
      feelings,
      needs,
    });
  } catch (error) {
    console.error('Error updating analysis:', error);
    return c.json({ error: 'Failed to update analysis' }, 500);
  }
});

export default analysesRouter;
