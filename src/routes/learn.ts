import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { learnSessions, learnTopicVersions, learnTopics } from '../../drizzle/schema.js';
import { ensureAdmin } from '../lib/auth.js';
import { db } from '../lib/db.js';

const learn = new Hono();

/**
 * Topic Management Routes (Admin only)
 */

learn.put('/topic-versions/:versionId', async (c) => {
  const guard = ensureAdmin(c);
  if (guard) return guard;

  const { versionId } = c.req.param();
  const body = await c.req.json();

  const updates: any = {
    updated: new Date().toISOString()
  };

  const fields = [
    'titleDE',
    'titleEN',
    'descriptionDE',
    'descriptionEN',
    'language',
    'image',
    'status',
    'versionLabel',
    'notes'
  ];

  for (const field of fields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (body.content !== undefined) {
    updates.content = body.content;
  }
  if (body.metadata !== undefined) {
    updates.metadata = body.metadata;
  }
  if (body.categoryId !== undefined) {
    updates.categoryId = body.categoryId || null;
  }
  if (body.isPublished !== undefined) {
    updates.isPublished = Boolean(body.isPublished);
    updates.publishedAt = body.isPublished ? new Date().toISOString() : null;
  }

  const [version] = await db
    .update(learnTopicVersions)
    .set(updates)
    .where(eq(learnTopicVersions.id, versionId))
    .returning();

  if (!version) {
    return c.json({ error: 'Version not found' }, 404);
  }

  return c.json({ version });
});

learn.delete('/topic-versions/:versionId', async (c) => {
  const guard = ensureAdmin(c);
  if (guard) return guard;

  const { versionId } = c.req.param();

  const [version] = await db
    .delete(learnTopicVersions)
    .where(eq(learnTopicVersions.id, versionId))
    .returning();

  if (!version) {
    return c.json({ error: 'Version not found' }, 404);
  }

  // Remove current version reference if needed
  await db
    .update(learnTopics)
    .set({ currentVersionId: null })
    .where(eq(learnTopics.currentVersionId, versionId));

  return c.json({ success: true });
});

/**
 * Learning Session Routes
 */

// Get completion status for all topics
// MOVED UP to avoid shadowing by :topicId
learn.get('/sessions/completion-status', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const completedSessions = await db
    .select({ topicId: learnSessions.topicId })
    .from(learnSessions)
    .where(
      and(
        eq(learnSessions.userId, user.id),
        eq(learnSessions.completed, true)
      )
    );

  const completionStatus: Record<string, boolean> = {};
  completedSessions.forEach((session) => {
    completionStatus[session.topicId] = true;
  });

  return c.json({ completionStatus });
});

// Get a learning session by ID
learn.get('/sessions/by-id/:id', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { id } = c.req.param();

  const [session] = await db
    .select()
    .from(learnSessions)
    .where(and(eq(learnSessions.id, id), eq(learnSessions.userId, user.id)));

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  return c.json({
    session: {
      ...session,
      responses: session.responses ? JSON.parse(session.responses) : [],
      feedback: session.feedback ? JSON.parse(session.feedback) : null
    }
  });
});

// Get or create a learning session for a topic
learn.get('/sessions/:topicId', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { topicId } = c.req.param();
  const topicVersionId = c.req.query('topicVersionId');

  if (!topicVersionId) {
    return c.json({ error: 'topicVersionId query parameter is required' }, 400);
  }

  // Check for existing incomplete session
  const existingSessions = await db
    .select()
    .from(learnSessions)
    .where(
      and(
        eq(learnSessions.userId, user.id),
        eq(learnSessions.topicId, topicId),
        eq(learnSessions.completed, false)
      )
    )
    .orderBy(desc(learnSessions.created))
    .limit(1);

  if (existingSessions.length > 0) {
    const session = existingSessions[0];
    // Parse JSON fields
    return c.json({
      session: {
        ...session,
        responses: session.responses ? JSON.parse(session.responses) : [],
        feedback: session.feedback ? JSON.parse(session.feedback) : null
      }
    });
  }

  // Create new session
  const [newSession] = await db
    .insert(learnSessions)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      topicId,
      topicVersionId,
      currentPage: 0,
      completed: false,
      responses: JSON.stringify([])
    })
    .returning();

  return c.json({
    session: {
      ...newSession,
      responses: [],
      feedback: null
    }
  });
});

// Update learning session
learn.patch('/sessions/:id', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { id } = c.req.param();
  const body = await c.req.json();

  // Verify session belongs to user
  const [existingSession] = await db
    .select()
    .from(learnSessions)
    .where(and(eq(learnSessions.id, id), eq(learnSessions.userId, user.id)));

  if (!existingSession) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const updates: any = {
    updated: new Date().toISOString()
  };

  if (body.currentPage !== undefined) {
    updates.currentPage = Number(body.currentPage);
  }
  if (body.responses !== undefined) {
    updates.responses = JSON.stringify(body.responses);
  }
  if (body.completed !== undefined) {
    updates.completed = Boolean(body.completed);
    if (body.completed) {
      updates.completedAt = new Date().toISOString();
    }
  }
  if (body.feedback !== undefined) {
    updates.feedback = JSON.stringify(body.feedback);
  }

  const [updatedSession] = await db
    .update(learnSessions)
    .set(updates)
    .where(eq(learnSessions.id, id))
    .returning();

  return c.json({
    session: {
      ...updatedSession,
      responses: updatedSession.responses ? JSON.parse(updatedSession.responses) : [],
      feedback: updatedSession.feedback ? JSON.parse(updatedSession.feedback) : null
    }
  });
});

export default learn;
