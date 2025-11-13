import { drizzle } from 'drizzle-orm/node-postgres';
import { streaks, chats, analyses } from '../../drizzle/schema.js';
import { eq, and, desc } from 'drizzle-orm';

const db = drizzle(process.env.DATABASE_URL!);

/**
 * Streak utility functions for tracking consecutive chat completions
 */

export interface StreakData {
  id: string;
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastChatDate: string | null;
  totalChatsCompleted: number;
  chatDates: string[];
  created: string;
  updated: string;
}

/**
 * Checks if two dates are consecutive days
 */
function areConsecutiveDays(date1: Date, date2: Date): boolean {
  const day1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
  const day2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
  const diffTime = Math.abs(day2.getTime() - day1.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays === 1;
}

/**
 * Checks if two dates are on the same day
 */
function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Normalizes a date to midnight UTC for consistent comparison
 */
function normalizeDate(date: Date): string {
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return normalized.toISOString().split('T')[0]; // Returns YYYY-MM-DD
}

/**
 * Gets or creates streak data for a user
 */
export async function getOrCreateStreak(userId: string): Promise<StreakData> {
  // Try to get existing streak
  const existingStreak = await db
    .select()
    .from(streaks)
    .where(eq(streaks.userId, userId))
    .limit(1);

  if (existingStreak.length > 0) {
    const streak = existingStreak[0];
    return {
      ...streak,
      chatDates: streak.chatDates ? JSON.parse(streak.chatDates) : [],
    };
  }

  // Create new streak record
  const newStreak = await db
    .insert(streaks)
    .values({
      id: crypto.randomUUID(),
      userId,
      currentStreak: 0,
      longestStreak: 0,
      lastChatDate: null,
      totalChatsCompleted: 0,
      chatDates: JSON.stringify([]),
    })
    .returning();

  return {
    ...newStreak[0],
    chatDates: [],
  };
}

/**
 * Updates streak data when a chat is completed
 */
export async function updateStreakOnChatCompletion(
  userId: string,
  completionDate: Date = new Date()
): Promise<StreakData> {
  // Get or create streak data
  const streakData = await getOrCreateStreak(userId);

  // Parse chat dates
  const chatDates = streakData.chatDates || [];
  const normalizedDate = normalizeDate(completionDate);

  // Check if chat was already counted today
  if (chatDates.includes(normalizedDate)) {
    // Already completed a chat today, no streak update needed
    return streakData;
  }

  // Add this date to chat dates array
  const updatedChatDates = [...chatDates, normalizedDate];

  let newCurrentStreak = streakData.currentStreak;
  let newLongestStreak = streakData.longestStreak;

  if (!streakData.lastChatDate) {
    // First chat ever
    newCurrentStreak = 1;
    newLongestStreak = 1;
  } else {
    const lastDate = new Date(streakData.lastChatDate);

    if (isSameDay(lastDate, completionDate)) {
      // Same day as last chat - shouldn't happen due to check above, but handle it
      return streakData;
    } else if (areConsecutiveDays(lastDate, completionDate)) {
      // Consecutive day - increment streak
      newCurrentStreak = streakData.currentStreak + 1;
      newLongestStreak = Math.max(newCurrentStreak, streakData.longestStreak);
    } else {
      // Gap in streak - reset to 1
      newCurrentStreak = 1;
      // Keep longest streak as is
      newLongestStreak = streakData.longestStreak;
    }
  }

  // Update database
  const updated = await db
    .update(streaks)
    .set({
      currentStreak: newCurrentStreak,
      longestStreak: newLongestStreak,
      lastChatDate: completionDate.toISOString(),
      totalChatsCompleted: streakData.totalChatsCompleted + 1,
      chatDates: JSON.stringify(updatedChatDates),
      updated: new Date().toISOString(),
    })
    .where(eq(streaks.id, streakData.id))
    .returning();

  return {
    ...updated[0],
    chatDates: updatedChatDates,
  };
}

/**
 * Checks if the streak should be reset based on missed days
 */
function shouldResetStreak(lastChatDate: string | null): boolean {
  if (!lastChatDate) return false;

  const lastDate = new Date(lastChatDate);
  const today = new Date();

  // Normalize both dates to start of day for comparison
  const lastDay = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
  const currentDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const diffTime = currentDay.getTime() - lastDay.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // If more than 1 day has passed since last chat, streak is broken
  return diffDays > 1;
}

/**
 * Gets current streak data for a user
 * Automatically resets streak if it's been broken
 */
export async function getStreakForUser(userId: string): Promise<StreakData | null> {
  const result = await db
    .select()
    .from(streaks)
    .where(eq(streaks.userId, userId))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const streakData = {
    ...result[0],
    chatDates: result[0].chatDates ? JSON.parse(result[0].chatDates) : [],
  };

  // Check if streak should be reset
  if (shouldResetStreak(streakData.lastChatDate)) {
    console.log(`🔄 Streak broken for user ${userId}, resetting currentStreak to 0`);

    // Update the streak to 0 in database
    const updated = await db
      .update(streaks)
      .set({
        currentStreak: 0,
        updated: new Date().toISOString(),
      })
      .where(eq(streaks.id, streakData.id))
      .returning();

    return {
      ...updated[0],
      chatDates: streakData.chatDates,
    };
  }

  return streakData;
}

/**
 * Backfills streak data from existing chat history
 * This is useful for populating historical streak data
 */
export async function backfillStreakData(userId: string): Promise<StreakData> {
  // Get all completed chats for the user (where analyzed = true)
  const completedChats = await db
    .select({
      chatId: chats.id,
      created: chats.created,
      analysisId: chats.analysisId,
    })
    .from(chats)
    .where(
      and(
        eq(chats.userId, userId),
        eq(chats.analyzed, true)
      )
    )
    .orderBy(chats.created);

  if (completedChats.length === 0) {
    // No completed chats, return empty streak
    return getOrCreateStreak(userId);
  }

  // Delete existing streak data to start fresh
  await db.delete(streaks).where(eq(streaks.userId, userId));

  // Process each chat in chronological order
  let currentStreak = 0;
  let longestStreak = 0;
  let lastChatDate: Date | null = null;
  const chatDates: string[] = [];

  for (const chat of completedChats) {
    const chatDate = new Date(chat.created);
    const normalizedDate = normalizeDate(chatDate);

    // Skip if we already counted a chat on this day
    if (chatDates.includes(normalizedDate)) {
      continue;
    }

    chatDates.push(normalizedDate);

    if (!lastChatDate) {
      // First chat
      currentStreak = 1;
      longestStreak = 1;
    } else if (areConsecutiveDays(lastChatDate, chatDate)) {
      // Consecutive day
      currentStreak++;
      longestStreak = Math.max(currentStreak, longestStreak);
    } else {
      // Gap in streak
      currentStreak = 1;
    }

    lastChatDate = chatDate;
  }

  // Create streak record with calculated values
  const streakRecord = await db
    .insert(streaks)
    .values({
      id: crypto.randomUUID(),
      userId,
      currentStreak,
      longestStreak,
      lastChatDate: lastChatDate?.toISOString() || null,
      totalChatsCompleted: chatDates.length,
      chatDates: JSON.stringify(chatDates),
    })
    .returning();

  return {
    ...streakRecord[0],
    chatDates,
  };
}
