const API_BASE = '/api';

interface FetchOptions extends RequestInit {
	searchParams?: Record<string, string | number | boolean | undefined | null>;
}

async function fetchWithAuth<T>(url: string, options: FetchOptions = {}): Promise<T> {
	const headers = new Headers(options.headers || {});
	if (!(options.body instanceof FormData)) {
		headers.set('Content-Type', 'application/json');
	}

	const requestUrl =
		options.searchParams && Object.keys(options.searchParams).length > 0
			? `${API_BASE}${url}?${new URLSearchParams(
					Object.entries(options.searchParams).reduce<Record<string, string>>((acc, [key, value]) => {
						if (value === undefined || value === null) return acc;
						acc[key] = String(value);
						return acc;
					}, {})
				).toString()}`
			: `${API_BASE}${url}`;

	const response = await fetch(requestUrl, {
		...options,
		headers,
		credentials: 'include'
	});

	if (!response.ok) {
		let message = `HTTP ${response.status}`;
		try {
			const error = await response.json();
			if (error?.error) {
				message = error.error;
			}
		} catch {
			// ignore
		}
		throw new Error(message);
	}

	if (response.status === 204) {
		return undefined as T;
	}

	return response.json() as Promise<T>;
}

export const nvcKnowledgeApi = {
	list(options: { language?: string; category?: string; tags?: string[]; isActive?: boolean; limit?: number } = {}) {
		return fetchWithAuth<{
			entries: KnowledgeEntry[];
		}>('/nvc-knowledge', {
			searchParams: {
				language: options.language,
				category: options.category,
				tags: options.tags?.join(','),
				isActive: options.isActive,
				limit: options.limit
			}
		});
	},
	get(id: string) {
		return fetchWithAuth<KnowledgeEntry>(`/nvc-knowledge/${id}`);
	},
	create(data: KnowledgePayload) {
		return fetchWithAuth<KnowledgeEntry>('/nvc-knowledge', {
			method: 'POST',
			body: JSON.stringify(data)
		});
	},
	update(id: string, data: KnowledgePayload) {
		return fetchWithAuth<KnowledgeEntry>(`/nvc-knowledge/${id}`, {
			method: 'PUT',
			body: JSON.stringify(data)
		});
	},
	delete(id: string) {
		return fetchWithAuth<{ success: boolean }>(`/nvc-knowledge/${id}`, {
			method: 'DELETE'
		});
	},
	search(options: { query: string; language?: string; category?: string }) {
		return fetchWithAuth<{ results: KnowledgeEntry[] }>('/nvc-knowledge/search', {
			method: 'POST',
			body: JSON.stringify(options)
		});
	},
	getCategories() {
		return fetchWithAuth<{ categories: string[] }>('/nvc-knowledge/meta/categories');
	},
	getTags() {
		return fetchWithAuth<{ tags: string[] }>('/nvc-knowledge/meta/tags');
	}
};

export const learnApi = {
	listCategories() {
		return fetchWithAuth<{ categories: LearnCategory[] }>('/learn/categories');
	},
	createCategory(payload: CategoryPayload) {
		return fetchWithAuth('/learn/categories', {
			method: 'POST',
			body: JSON.stringify(payload)
		});
	},
	updateCategory(id: string, payload: CategoryPayload) {
		return fetchWithAuth(`/learn/categories/${id}`, {
			method: 'PUT',
			body: JSON.stringify(payload)
		});
	},
	deleteCategory(id: string) {
		return fetchWithAuth(`/learn/categories/${id}`, {
			method: 'DELETE'
		});
	},
	listTopics(options: { includeInactive?: boolean; includeVersions?: boolean } = {}) {
		return fetchWithAuth<{ topics: LearnTopic[] }>('/learn/topics', {
			searchParams: {
				includeInactive: options.includeInactive ? 'true' : undefined,
				includeVersions: options.includeVersions ? 'true' : undefined
			}
		});
	},
	getTopic(id: string) {
		return fetchWithAuth<{ topic: LearnTopic & { versions: LearnTopicVersion[] } }>(`/learn/topics/${id}`);
	},
	createTopic(payload: TopicPayload) {
		return fetchWithAuth('/learn/topics', {
			method: 'POST',
			body: JSON.stringify(payload)
		});
	},
	updateTopic(id: string, payload: TopicPayload) {
		return fetchWithAuth(`/learn/topics/${id}`, {
			method: 'PUT',
			body: JSON.stringify(payload)
		});
	},
	deleteTopic(id: string) {
		return fetchWithAuth(`/learn/topics/${id}`, {
			method: 'DELETE'
		});
	},
	createVersion(topicId: string, payload: VersionPayload) {
		return fetchWithAuth(`/learn/topics/${topicId}/versions`, {
			method: 'POST',
			body: JSON.stringify(payload)
		});
	},
	updateVersion(versionId: string, payload: VersionPayload) {
		return fetchWithAuth(`/learn/topic-versions/${versionId}`, {
			method: 'PUT',
			body: JSON.stringify(payload)
		});
	},
	deleteVersion(versionId: string) {
		return fetchWithAuth(`/learn/topic-versions/${versionId}`, {
			method: 'DELETE'
		});
	},
	setCurrentVersion(topicId: string, versionId: string) {
		return fetchWithAuth(`/learn/topics/${topicId}/current-version`, {
			method: 'POST',
			body: JSON.stringify({ versionId })
		});
	}
};

export interface KnowledgeEntry {
	id: string;
	language: string;
	title: string;
	content: string;
	category: string;
	subcategory?: string | null;
	source?: string | null;
	tags?: string[] | null;
	priority: number;
	created: string;
	updated: string;
}

export interface KnowledgePayload {
	language: string;
	title: string;
	content: string;
	category: string;
	subcategory?: string | null;
	source?: string | null;
	tags?: string[] | null;
	priority: number;
}

export interface LearnCategory {
	id: string;
	nameDE: string;
	nameEN?: string | null;
	slug: string;
	color?: string | null;
	descriptionDE?: string | null;
	descriptionEN?: string | null;
	sortOrder: number;
	isActive: boolean;
	created: string;
	updated: string;
}

export interface LearnTopic {
	id: string;
	slug: string;
	categoryId?: string | null;
	category?: LearnCategory | null;
	order: number;
	difficulty?: string | null;
	level?: string | null;
	estimatedMinutes?: number | null;
	summaryDE?: string | null;
	summaryEN?: string | null;
	coverImage?: string | null;
	currentVersionId?: string | null;
	isActive: boolean;
	isFeatured: boolean;
	tags?: string | null;
	created: string;
	updated: string;
	versions?: LearnTopicVersion[];
}

export interface LearnTopicVersion {
	id: string;
	topicId: string;
	categoryId?: string | null;
	versionLabel?: string | null;
	titleDE: string;
	titleEN?: string | null;
	descriptionDE?: string | null;
	descriptionEN?: string | null;
	language: string;
	content: any;
	image?: string | null;
	status: string;
	isPublished: boolean;
	publishedAt?: string | null;
	created: string;
	updated: string;
	notes?: string | null;
}

export interface CategoryPayload {
	nameDE: string;
	nameEN?: string | null;
	slug?: string;
	sortOrder?: number;
	color?: string | null;
	descriptionDE?: string | null;
	descriptionEN?: string | null;
	isActive?: boolean;
}

export interface TopicPayload {
	slug: string;
	categoryId?: string | null;
	order?: number;
	estimatedMinutes?: number | null;
	difficulty?: string | null;
	level?: string | null;
	summaryDE?: string | null;
	summaryEN?: string | null;
	coverImage?: string | null;
	isActive?: boolean;
	isFeatured?: boolean;
	tags?: string | null;
}

export interface VersionPayload {
	versionLabel?: string | null;
	titleDE: string;
	titleEN?: string | null;
	language?: string;
	descriptionDE?: string | null;
	descriptionEN?: string | null;
	status?: string;
	content?: unknown;
	notes?: string | null;
	isPublished?: boolean;
	categoryId?: string | null;
	image?: string | null;
	metadata?: Record<string, unknown> | null;
}

