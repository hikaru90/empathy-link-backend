/**
 * Safety detection and flag management.
 * NO human ever reads chat content. Only programmatic AI analysis.
 * Stores only: level, reason code, timestamp - never message content.
 */

import { desc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq, gte } from 'drizzle-orm';
import { userSafetyFlags, safetyDetectionEvents } from '../../drizzle/schema.js';
import { classifySafetyRisk } from './gemini.js';

const db = drizzle(process.env.DATABASE_URL!);

export type SafetyLevel = 0 | 1 | 2 | 3 | 4;

export const SAFETY_LIMITS = {
	level2: { dailyMessages: 30, cooldownMinutes: 30 },
	level3: { dailyMessages: 15, cooldownMinutes: 60 },
} as const;

const ESCALATION = {
	detectionsForLevel2: 2,
	detectionsForLevel3: 5,
	detectionsForLevel4: 8,
	windowDays: 7,
	deescalationDays: 30,
	appealCooldownDays: 7,
} as const;

/**
 * Process a user message for safety detection. Uses AI (no keywords).
 * Call this before sending to AI. If detection triggers: records event, updates flag.
 * Never stores message content.
 */
export async function processSafetyDetection(
	userId: string,
	message: string
): Promise<{ level: SafetyLevel; triggered: boolean }> {
	const severity = await classifySafetyRisk(message);
	if (severity === 'none') {
		const current = await getSafetyLevel(userId);
		return { level: current, triggered: false };
	}

	const reason = severity === 'severe' ? 'ai_score_severe' : 'ai_score';

	await db.insert(safetyDetectionEvents).values({
		userId,
		reason,
	});

	const windowStart = new Date();
	windowStart.setDate(windowStart.getDate() - ESCALATION.windowDays);

	const recentEvents = await db
		.select({ reason: safetyDetectionEvents.reason })
		.from(safetyDetectionEvents)
		.where(
			and(
				eq(safetyDetectionEvents.userId, userId),
				gte(safetyDetectionEvents.detectedAt, windowStart.toISOString())
			)
		);

	const severeCount = recentEvents.filter((e) => e.reason === 'ai_score_severe').length;
	const totalCount = recentEvents.length;

	let newLevel: SafetyLevel = 1;
	if (severity === 'severe' || severeCount >= 1) {
		newLevel = 4;
	} else if (totalCount >= ESCALATION.detectionsForLevel4) {
		newLevel = 4;
	} else if (totalCount >= ESCALATION.detectionsForLevel3) {
		newLevel = 3;
	} else if (totalCount >= ESCALATION.detectionsForLevel2) {
		newLevel = 2;
	}

	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + ESCALATION.deescalationDays);

	const existing = await db
		.select()
		.from(userSafetyFlags)
		.where(eq(userSafetyFlags.userId, userId))
		.limit(1);

	if (existing.length > 0) {
		await db
			.update(userSafetyFlags)
			.set({
				level: newLevel,
				reason,
				detectedAt: new Date().toISOString(),
				expiresAt: expiresAt.toISOString(),
			})
			.where(eq(userSafetyFlags.userId, userId));
	} else {
		await db.insert(userSafetyFlags).values({
			userId,
			level: newLevel,
			reason,
			expiresAt: expiresAt.toISOString(),
		});
	}

	return { level: newLevel, triggered: true };
}

/** Get current safety level for user. Applies de-escalation if expired (not when appeal pending). */
export async function getSafetyLevel(userId: string): Promise<SafetyLevel> {
	const [flag] = await db
		.select()
		.from(userSafetyFlags)
		.where(eq(userSafetyFlags.userId, userId))
		.limit(1);

	if (!flag) return 0;

	// If appeal was approved, level is already 0
	if (flag.appealStatus === 'approved') return 0;

	// Do not auto-de-escalate while appeal is pending (human must decide)
	if (flag.appealStatus === 'pending') return flag.level as SafetyLevel;

	const now = new Date();
	if (flag.expiresAt && new Date(flag.expiresAt) < now) {
		const newLevel = Math.max(0, (flag.level as number) - 1) as SafetyLevel;
		await db
			.update(userSafetyFlags)
			.set({
				level: newLevel,
				expiresAt: new Date(now.getTime() + ESCALATION.deescalationDays * 24 * 60 * 60 * 1000).toISOString(),
			})
			.where(eq(userSafetyFlags.userId, userId));
		return newLevel;
	}

	return flag.level as SafetyLevel;
}

/** Check if user can send messages (not suspended, within limits). */
export async function canSendMessage(
	userId: string,
	messagesToday: number,
	lastMessageAt: Date | null
): Promise<{ allowed: boolean; reason?: string; level: SafetyLevel }> {
	const level = await getSafetyLevel(userId);

	if (level >= 4) {
		return {
			allowed: false,
			reason: 'suspended',
			level,
		};
	}

	if (level === 3) {
		const limit = SAFETY_LIMITS.level3.dailyMessages;
		const cooldownMs = SAFETY_LIMITS.level3.cooldownMinutes * 60 * 1000;
		if (messagesToday >= limit) {
			return { allowed: false, reason: 'daily_limit', level };
		}
		if (lastMessageAt && Date.now() - lastMessageAt.getTime() < cooldownMs) {
			return { allowed: false, reason: 'cooldown', level };
		}
	}

	if (level === 2) {
		const limit = SAFETY_LIMITS.level2.dailyMessages;
		const cooldownMs = SAFETY_LIMITS.level2.cooldownMinutes * 60 * 1000;
		if (messagesToday >= limit) {
			return { allowed: false, reason: 'daily_limit', level };
		}
		if (lastMessageAt && Date.now() - lastMessageAt.getTime() < cooldownMs) {
			return { allowed: false, reason: 'cooldown', level };
		}
	}

	return { allowed: true, level };
}

/** Request appeal. Sets status to pending – requires human review to restore access. */
export async function requestAppeal(userId: string): Promise<{ success: boolean; message: string }> {
	const [flag] = await db
		.select()
		.from(userSafetyFlags)
		.where(eq(userSafetyFlags.userId, userId))
		.limit(1);

	if (!flag || flag.level < 2) {
		return { success: true, message: 'No restriction to appeal.' };
	}

	if (flag.appealStatus === 'approved') {
		return { success: true, message: 'Access already restored.' };
	}

	if (flag.appealStatus === 'pending') {
		return {
			success: false,
			message: 'Your appeal is pending. A staff member will review it shortly.',
		};
	}

	// Denied or first appeal: set to pending
	await db
		.update(userSafetyFlags)
		.set({
			appealRequestedAt: new Date().toISOString(),
			appealStatus: 'pending',
			appealReviewedAt: null,
			appealReviewedBy: null,
		})
		.where(eq(userSafetyFlags.userId, userId));

	return {
		success: true,
		message: 'Appeal received. A staff member will review your request and restore access if appropriate.',
	};
}

/** Human review: approve (restore access) or deny appeal. Admin can restore any suspended user. */
export async function reviewAppeal(
	userId: string,
	approved: boolean,
	adminUserId: string
): Promise<{ success: boolean; message: string }> {
	const [flag] = await db
		.select()
		.from(userSafetyFlags)
		.where(eq(userSafetyFlags.userId, userId))
		.limit(1);

	if (!flag) {
		return { success: false, message: 'User not found.' };
	}

	const now = new Date().toISOString();

	// Approve: admin can restore any suspended/restricted user (level >= 2)
	if (approved) {
		if (flag.level < 2) {
			return { success: false, message: 'User is not restricted.' };
		}
		await db
			.update(userSafetyFlags)
			.set({
				level: 0,
				appealStatus: 'approved',
				appealReviewedAt: now,
				appealReviewedBy: adminUserId,
				expiresAt: null,
			})
			.where(eq(userSafetyFlags.userId, userId));
		return { success: true, message: 'Access restored.' };
	}

	// Deny: only when appeal is pending
	if (flag.appealStatus !== 'pending') {
		return { success: false, message: 'No pending appeal to deny.' };
	}
	await db
		.update(userSafetyFlags)
		.set({
			appealStatus: 'denied',
			appealReviewedAt: now,
			appealReviewedBy: adminUserId,
		})
		.where(eq(userSafetyFlags.userId, userId));
	return { success: true, message: 'Appeal denied.' };
}

/** Build a summary of why the user was flagged (for admin display). No chat content. */
export async function getFlagSummary(userId: string): Promise<string> {
	const [flag] = await db
		.select()
		.from(userSafetyFlags)
		.where(eq(userSafetyFlags.userId, userId))
		.limit(1);

	if (!flag) return 'No flag record.';

	const windowStart = new Date();
	windowStart.setDate(windowStart.getDate() - ESCALATION.windowDays);

	const events = await db
		.select({ reason: safetyDetectionEvents.reason, detectedAt: safetyDetectionEvents.detectedAt })
		.from(safetyDetectionEvents)
		.where(
			and(
				eq(safetyDetectionEvents.userId, userId),
				gte(safetyDetectionEvents.detectedAt, windowStart.toISOString())
			)
		)
		.orderBy(desc(safetyDetectionEvents.detectedAt));

	const severeCount = events.filter((e) => e.reason === 'ai_score_severe').length;
	const moderateCount = events.filter((e) => e.reason === 'ai_score').length;
	const lastEvent = events[0];

	const reasonLabels: Record<string, string> = {
		ai_score_severe: 'AI classification (severe – self-harm/suicidal ideation)',
		ai_score: 'AI classification (moderate – distress/hopelessness)',
	};

	const parts: string[] = [
		`Level ${flag.level} (${flag.reason}).`,
		`${events.length} detection event(s) in last ${ESCALATION.windowDays} days: ${severeCount} severe, ${moderateCount} moderate.`,
	];

	if (lastEvent) {
		parts.push(`Last detection: ${new Date(lastEvent.detectedAt).toLocaleString()} (${reasonLabels[lastEvent.reason] || lastEvent.reason}).`);
	}

	if (flag.appealRequestedAt) {
		parts.push(`Appeal requested: ${new Date(flag.appealRequestedAt).toLocaleString()}.`);
	}
	if (flag.appealStatus) {
		parts.push(`Appeal status: ${flag.appealStatus}.`);
	}
	if (flag.appealReviewedAt) {
		parts.push(`Reviewed: ${new Date(flag.appealReviewedAt).toLocaleString()} by ${flag.appealReviewedBy || 'admin'}.`);
	}

	return parts.join(' ');
}
