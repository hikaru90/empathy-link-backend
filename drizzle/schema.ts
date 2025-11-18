import { boolean, foreignKey, index, integer, jsonb, pgTable, real, text, timestamp, unique, uuid, vector } from "drizzle-orm/pg-core";



export const memories = pgTable("memories", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	confidence: text().notNull(),
	type: text().notNull(),
	priority: real().default(1).notNull(),
	key: text(),
	value: text().notNull(),
	personName: text("person_name"),
	embedding: vector({ dimensions: 768 }),
	chatId: text("chat_id"),
	relevanceScore: real("relevance_score").default(1).notNull(),
	accessCount: integer("access_count").default(0).notNull(),
	lastAccessed: timestamp("last_accessed", { mode: 'string' }).defaultNow(),
	expiresAt: timestamp("expires_at", { mode: 'string' }),
	created: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updated: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	// Foreign key commented out due to existing data with non-existent user IDs
	// Uncomment after cleaning up orphaned records or migrating data
	// foreignKey({
	// 		columns: [table.userId],
	// 		foreignColumns: [user.id],
	// 		name: "memories_user_id_user_id_fk"
	// 	}).onDelete("cascade"),
	index("embedding_idx").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")),
	index("expiry_idx").using("btree", table.expiresAt.asc().nullsLast().op("timestamp_ops")),
	index("user_relevance_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.relevanceScore.asc().nullsLast().op("text_ops")),
	index("user_type_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.type.asc().nullsLast().op("text_ops")),
]);

export const verification = pgTable("verification", {
	id: text().primaryKey().notNull(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const user = pgTable("user", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	email: text().notNull(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	// Extended fields from PocketBase users collection
	emailVisibility: boolean("email_visibility").default(true),
	verified: boolean("verified").default(false).notNull(),
	username: text("username"),
	firstName: text("first_name"),
	lastName: text("last_name"),
	role: text("role").default('user'),
	aiAnswerLength: text("ai_answer_length"),
	toneOfVoice: text("tone_of_voice"),
	nvcKnowledge: text("nvc_knowledge"),
	inspirationalQuote: text("inspirational_quote"),
}, (table) => [
	unique("user_email_unique").on(table.email),
]);

export const account = pgTable("account", {
	id: text().primaryKey().notNull(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id").notNull(),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at", { mode: 'string' }),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { mode: 'string' }),
	scope: text(),
	password: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "account_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const session = pgTable("session", {
	id: text().primaryKey().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	token: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "session_user_id_user_id_fk"
		}).onDelete("cascade"),
	unique("session_token_unique").on(table.token),
]);

export const analyses = pgTable("analyses", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	chatId: text("chat_id"),
	title: text().notNull(),
	observation: text(),
	feelings: text(), // JSON stored as text
	needs: text(), // JSON stored as text
	request: text(),
	requestResolved: boolean("request_resolved").default(false).notNull(),
	requestArchived: boolean("request_archived").default(false).notNull(),
	sentimentPolarity: real("sentiment_polarity"),
	intensityRatio: real("intensity_ratio"),
	emotionalBalance: real("emotional_balance"),
	triggerCount: integer("trigger_count"),
	resolutionCount: integer("resolution_count"),
	escalationRate: real("escalation_rate"),
	empathyRate: real("empathy_rate"),
	messageLength: real("message_length"),
	readabilityScore: real("readability_score"),
	emotionalShift: text("emotional_shift"),
	iStatementMuscle: real("i_statement_muscle"),
	clarityOfAsk: text("clarity_of_ask"),
	empathyAttempt: boolean("empathy_attempt"),
	feelingVocabulary: integer("feeling_vocabulary"),
	dailyWin: text("daily_win"),
	created: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updated: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "analyses_user_id_user_id_fk"
		}).onDelete("cascade"),
	index("analyses_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("analyses_chat_idx").using("btree", table.chatId.asc().nullsLast().op("text_ops")),
]);

export const chatEvals = pgTable("chat_evals", {
	id: text().primaryKey().notNull(),
	chatId: text("chat_id").notNull(),
	userId: text("user_id").notNull(),
	evaluation: text().notNull(), // JSON stored as text
	created: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updated: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "chat_evals_user_id_user_id_fk"
		}).onDelete("cascade"),
	index("chat_evals_chat_idx").using("btree", table.chatId.asc().nullsLast().op("text_ops")),
	index("chat_evals_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const chatFeedback = pgTable("chat_feedback", {
	id: text().primaryKey().notNull(),
	chatId: text("chat_id").notNull(),
	userId: text("user_id").notNull(),
	helpfulness: integer(),
	understanding: boolean(),
	newInsights: boolean("new_insights"),
	wouldRecommend: boolean("would_recommend"),
	bestAspects: text("best_aspects"),
	improvements: text(),
	additionalComments: text("additional_comments"),
	automaticAnalysis: text("automatic_analysis"), // JSON stored as text
	conversationQuality: integer("conversation_quality"),
	nvcCompliance: integer("nvc_compliance"),
	orchestratorEffectiveness: integer("orchestrator_effectiveness"),
	pathSwitches: integer("path_switches"),
	totalMessages: integer("total_messages"),
	created: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updated: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "chat_feedback_user_id_user_id_fk"
		}).onDelete("cascade"),
	index("chat_feedback_chat_idx").using("btree", table.chatId.asc().nullsLast().op("text_ops")),
	index("chat_feedback_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const chats = pgTable("chats", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	module: text().default('selfempathy').notNull(),
	history: text(), // JSON stored as text
	feelings: text(), // JSON stored as text
	needs: text(), // JSON stored as text
	memoryProcessed: boolean("memory_processed").default(false),
	analyzed: boolean().default(false),
	analysisId: text("analysis_id"), // relation to analyses
	pathState: text("path_state"), // JSON stored as text
	feedbackReceived: boolean("feedback_received").default(false),
	feedbackReceivedAt: timestamp("feedback_received_at", { mode: 'string' }),
	feedbackId: text("feedback_id"), // relation to chatFeedback
	created: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updated: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "chats_user_id_user_id_fk"
		}).onDelete("cascade"),
	index("chats_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("chats_module_idx").using("btree", table.module.asc().nullsLast().op("text_ops")),
]);

export const errors = pgTable("errors", {
	id: text().primaryKey().notNull(),
	message: text(),
	trace: text(),
	userId: text("user_id"), // nullable - errors can occur before authentication
	name: text(),
	stack: text(),
	url: text(),
	pathname: text(),
	searchParams: text("search_params"),
	userAgent: text("user_agent"),
	language: text(),
	platform: text(),
	source: text(),
	type: text(),
	severity: text(),
	errorString: text("error_string"),
	errorConstructor: text("error_constructor"),
	viewportWidth: integer("viewport_width"),
	viewportHeight: integer("viewport_height"),
	timezoneOffset: integer("timezone_offset"),
	cookieEnabled: boolean("cookie_enabled"),
	online: boolean(),
	created: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updated: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "errors_user_id_user_id_fk"
		}).onDelete("set null"), // Set to null instead of cascade delete
	index("errors_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("errors_severity_idx").using("btree", table.severity.asc().nullsLast().op("text_ops")),
	index("errors_created_idx").using("btree", table.created.asc().nullsLast().op("timestamp_ops")),
]);

export const feedback = pgTable("feedback", {
	id: text().primaryKey().notNull(),
	description: text(),
	expectedBehavior: text("expected_behavior"),
	actualBehavior: text("actual_behavior"),
	reproducableSteps: text("reproducable_steps"),
	screenshots: text(), // JSON array stored as text
	created: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updated: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("feedback_created_idx").using("btree", table.created.asc().nullsLast().op("timestamp_ops")),
]);

export const feelings = pgTable("feelings", {
	id: text().primaryKey().notNull(),
	nameDE: text("name_de").notNull(),
	nameEN: text("name_en").notNull(),
	category: text(),
	positive: boolean().default(false).notNull(),
	sort: integer().default(0),
	created: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updated: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("feelings_category_idx").using("btree", table.category.asc().nullsLast().op("text_ops")),
	index("feelings_positive_idx").using("btree", table.positive.asc().nullsLast().op("bool_ops")),
	index("feelings_sort_idx").using("btree", table.sort.asc().nullsLast().op("int4_ops")),
]);

export const needs = pgTable("needs", {
	id: text().primaryKey().notNull(),
	nameDE: text("name_de").notNull(),
	nameEN: text("name_en").notNull(),
	category: text(),
	categoryDE: text("category_de"),
	sort: integer().default(0),
	created: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updated: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("needs_category_idx").using("btree", table.category.asc().nullsLast().op("text_ops")),
	index("needs_sort_idx").using("btree", table.sort.asc().nullsLast().op("int4_ops")),
]);

export const gardens = pgTable("gardens", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	name: text(),
	currentWeather: text("current_weather").default('sunny'),
	gridData: text("grid_data"), // JSON stored as text
	lastWeatherUpdate: timestamp("last_weather_update", { mode: 'string' }),
	totalPlants: integer("total_plants").default(0),
	gardenLevel: integer("garden_level").default(1),
	isPublic: boolean("is_public").default(false),
	created: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updated: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "gardens_user_id_user_id_fk"
		}).onDelete("cascade"),
	index("gardens_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("gardens_public_idx").using("btree", table.isPublic.asc().nullsLast().op("bool_ops")),
]);

export const items = pgTable("items", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	category: text().default('flower'),
	terraformType: text("terraform_type"),
	seedCost: integer("seed_cost").default(0),
	description: text(),
	rarity: text(),
	isActive: boolean("is_active").default(true),
	sprite: text(),
	created: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updated: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("items_category_idx").using("btree", table.category.asc().nullsLast().op("text_ops")),
	index("items_active_idx").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("items_rarity_idx").using("btree", table.rarity.asc().nullsLast().op("text_ops")),
]);

export const learnSessions = pgTable("learn_sessions", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	topicId: text("topic_id").notNull(),
	topicVersionId: text("topic_version_id").notNull(),
	currentPage: integer("current_page").default(0),
	responses: text(), // JSON stored as text
	completed: boolean().default(false),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	feedback: text(), // JSON stored as text
	created: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updated: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "learn_sessions_user_id_user_id_fk"
		}).onDelete("cascade"),
	index("learn_sessions_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("learn_sessions_topic_idx").using("btree", table.topicId.asc().nullsLast().op("text_ops")),
	index("learn_sessions_completed_idx").using("btree", table.completed.asc().nullsLast().op("bool_ops")),
]);

export const memoryExtractionQueue = pgTable("memory_extraction_queue", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	status: text().default('pending').notNull(),
	created: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updated: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "memory_extraction_queue_user_id_user_id_fk"
		}).onDelete("cascade"),
	index("memory_extraction_queue_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("memory_extraction_queue_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);

export const messages = pgTable("messages", {
	id: text().primaryKey().notNull(),
	userId: text("user_id"), // nullable for public announcements
	fromUserId: text("from_user_id"),
	type: text().default('status').notNull(),
	title: text().notNull(),
	content: text().notNull(),
	read: boolean().default(false).notNull(),
	scheduledFor: timestamp("scheduled_for", { mode: 'string' }),
	sentAt: timestamp("sent_at", { mode: 'string' }),
	priority: integer().default(1),
	reminderData: text("reminder_data"), // JSON stored as text
	created: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updated: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "messages_user_id_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.fromUserId],
			foreignColumns: [user.id],
			name: "messages_from_user_id_user_id_fk"
		}).onDelete("set null"),
	index("messages_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("messages_type_idx").using("btree", table.type.asc().nullsLast().op("text_ops")),
	index("messages_read_idx").using("btree", table.read.asc().nullsLast().op("bool_ops")),
	index("messages_scheduled_idx").using("btree", table.scheduledFor.asc().nullsLast().op("timestamp_ops")),
]);

export const streaks = pgTable("streaks", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	currentStreak: integer("current_streak").default(0).notNull(),
	longestStreak: integer("longest_streak").default(0).notNull(),
	lastChatDate: timestamp("last_chat_date", { mode: 'string' }),
	totalChatsCompleted: integer("total_chats_completed").default(0).notNull(),
	chatDates: text("chat_dates"), // JSON array of completion dates
	created: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updated: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "streaks_user_id_user_id_fk"
		}).onDelete("cascade"),
	index("streaks_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	unique("streaks_user_unique").on(table.userId),
]);

export const trackedNeeds = pgTable("tracked_needs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	needId: text("need_id").notNull(),
	needName: text("need_name").notNull(),
	deleted: boolean().default(false).notNull(), // Soft delete flag
	created: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updated: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "tracked_needs_user_id_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.needId],
			foreignColumns: [needs.id],
			name: "tracked_needs_need_id_needs_id_fk"
		}).onDelete("cascade"),
	index("tracked_needs_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("tracked_needs_deleted_idx").using("btree", table.deleted.asc().nullsLast().op("bool_ops")),
	unique("tracked_needs_user_need_unique").on(table.userId, table.needId),
]);

export const needFillLevels = pgTable("need_fill_levels", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	trackedNeedId: uuid("tracked_need_id").notNull(),
	fillLevel: integer("fill_level").notNull(), // 0-100
	strategies: text(), // JSON stored as text
	date: timestamp({ mode: 'string' }).defaultNow().notNull(),
	created: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.trackedNeedId],
			foreignColumns: [trackedNeeds.id],
			name: "need_fill_levels_tracked_need_id_tracked_needs_id_fk"
		}).onDelete("cascade"),
	index("need_fill_levels_tracked_need_idx").using("btree", table.trackedNeedId.asc().nullsLast().op("uuid_ops")),
	index("need_fill_levels_date_idx").using("btree", table.date.asc().nullsLast().op("timestamp_ops")),
	unique("need_fill_levels_tracked_need_date_unique").on(table.trackedNeedId, table.date),
]);

export const blindSpots = pgTable("blind_spots", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	analysis: text().notNull(),
	patterns: text(), // JSON stored as text
	situations: text(), // JSON stored as text
	advice: text(),
	lastChatCreatedDate: timestamp("last_chat_created_date", { mode: 'string' }).notNull(),
	created: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updated: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "blind_spots_user_id_user_id_fk"
		}).onDelete("cascade"),
	index("blind_spots_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const nvcKnowledge = pgTable("nvc_knowledge", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	knowledgeId: uuid("knowledge_id"), // Links DE/EN versions together
	language: text().notNull(), // 'de' | 'en'
	title: text().notNull(),
	content: text().notNull(),
	embedding: vector({ dimensions: 768 }),
	category: text().notNull(), // e.g., "principles", "examples", "techniques"
	subcategory: text(), // optional, e.g., "observation", "feelings", "needs"
	source: text(), // e.g., "Marshall Rosenberg", "NVC Foundation"
	tags: text().array(), // language-agnostic tags
	priority: integer().default(3).notNull(), // 1-5 for relevance ranking
	isActive: boolean("is_active").default(true).notNull(), // for soft deletion/archiving
	createdBy: text("created_by"), // user_id, nullable for system entries
	created: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updated: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("nvc_knowledge_embedding_idx").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")),
	index("nvc_knowledge_category_idx").using("btree", table.category.asc().nullsLast().op("text_ops")),
	index("nvc_knowledge_language_idx").using("btree", table.language.asc().nullsLast().op("text_ops")),
	index("nvc_knowledge_knowledge_id_idx").using("btree", table.knowledgeId.asc().nullsLast().op("uuid_ops")),
	index("nvc_knowledge_is_active_idx").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
]);

export const learnCategories = pgTable("learn_categories", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	slug: text().notNull(),
	nameDE: text("name_de").notNull(),
	nameEN: text("name_en"),
	descriptionDE: text("description_de"),
	descriptionEN: text("description_en"),
	color: text(),
	icon: text(),
	sortOrder: integer("sort_order").default(0).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	created: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updated: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("learn_categories_slug_unique").on(table.slug),
	index("learn_categories_order_idx").using("btree", table.sortOrder.asc().nullsLast().op("int4_ops")),
]);

export const learnTopics = pgTable("learn_topics", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	slug: text().notNull(),
	categoryId: uuid("category_id").references(() => learnCategories.id, { onDelete: "set null" }),
	order: integer("sort_order").default(0).notNull(),
	difficulty: text(),
	level: text(),
	estimatedMinutes: integer("estimated_minutes"),
	summaryDE: text("summary_de"),
	summaryEN: text("summary_en"),
	coverImage: text("cover_image"),
	currentVersionId: uuid("current_version_id"),
	isActive: boolean("is_active").default(true).notNull(),
	isFeatured: boolean("is_featured").default(false).notNull(),
	tags: text(),
	created: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updated: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("learn_topics_slug_unique").on(table.slug),
	index("learn_topics_category_idx").using("btree", table.categoryId.asc().nullsLast().op("uuid_ops")),
	index("learn_topics_order_idx").using("btree", table.order.asc().nullsLast().op("int4_ops")),
]);

export const learnTopicVersions = pgTable("learn_topic_versions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	topicId: uuid("topic_id").notNull().references(() => learnTopics.id, { onDelete: "cascade" }),
	categoryId: uuid("category_id").references(() => learnCategories.id, { onDelete: "set null" }),
	versionLabel: text("version_label"),
	titleDE: text("title_de").notNull(),
	titleEN: text("title_en"),
	descriptionDE: text("description_de"),
	descriptionEN: text("description_en"),
	language: text().default('de').notNull(),
	image: text(),
	content: jsonb("content").$type<any>(),
	status: text().default('draft').notNull(),
	isPublished: boolean("is_published").default(false).notNull(),
	publishedAt: timestamp("published_at", { mode: 'string' }),
	createdBy: text("created_by"),
	notes: text(),
	metadata: jsonb("metadata").$type<any>(),
	created: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updated: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("learn_topic_versions_topic_idx").using("btree", table.topicId.asc().nullsLast().op("uuid_ops")),
	index("learn_topic_versions_category_idx").using("btree", table.categoryId.asc().nullsLast().op("uuid_ops")),
]);
