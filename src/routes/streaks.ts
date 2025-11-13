import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  getStreakForUser,
  updateStreakOnChatCompletion,
  backfillStreakData
} from '../lib/streaks.js';

const streaks = new Hono();

// GET /api/streaks - Get current streak data for the authenticated user
streaks.get('/', async (c: Context) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const streakData = await getStreakForUser(user.id);

    if (!streakData) {
      // No streak data exists yet, return empty streak
      return c.json({
        currentStreak: 0,
        longestStreak: 0,
        lastChatDate: null,
        totalChatsCompleted: 0,
        chatDates: [],
      });
    }

    return c.json(streakData);
  } catch (error) {
    console.error('Error fetching streak data:', error);
    return c.json({ error: 'Failed to fetch streak data' }, 500);
  }
});

// POST /api/streaks/update - Update streak (called after chat completion)
// This endpoint is called internally after a chat analysis is completed
streaks.post('/update', async (c: Context) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = await c.req.json().catch(() => ({}));
    const completionDate = body.completionDate
      ? new Date(body.completionDate)
      : new Date();

    const updatedStreak = await updateStreakOnChatCompletion(user.id, completionDate);

    return c.json(updatedStreak);
  } catch (error) {
    console.error('Error updating streak:', error);
    return c.json({ error: 'Failed to update streak' }, 500);
  }
});

// POST /api/streaks/backfill - Backfill streak data from existing chats
// This endpoint can be called to populate historical streak data
streaks.post('/backfill', async (c: Context) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const backfilledStreak = await backfillStreakData(user.id);

    return c.json({
      message: 'Streak data backfilled successfully',
      streak: backfilledStreak,
    });
  } catch (error) {
    console.error('Error backfilling streak data:', error);
    return c.json({ error: 'Failed to backfill streak data' }, 500);
  }
});

export default streaks;
