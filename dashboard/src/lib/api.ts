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
	},
	syncLearn() {
		return fetchWithAuth<{ created: number; updated: number; skipped: number; errors: number }>(
			'/nvc-knowledge/sync-learn',
			{ method: 'POST' }
		);
	}
};

export const safetyApi = {
	getStatus() {
		return fetchWithAuth<{
			level: number;
			suspended: boolean;
			showResources: boolean;
			limits?: { dailyMessages: number; cooldownMinutes: number };
		}>('/safety/status');
	},
	getResources(lang = 'de') {
		return fetchWithAuth<{ resources: { name: string; description?: string; phone?: string; url?: string }[] }>(
			'/safety/resources',
			{ searchParams: { lang } }
		);
	},
	requestAppeal() {
		return fetchWithAuth<{ success: boolean; message: string }>('/safety/appeal', {
			method: 'POST',
		});
	},
	getFlaggedUsers() {
		return fetchWithAuth<{
			flagged: {
				userId: string;
				level: number;
				reason: string;
				detectedAt: string;
				expiresAt?: string;
				appealRequestedAt?: string;
				appealStatus?: string;
				appealReviewedAt?: string;
				appealReviewedBy?: string;
				summary: string;
			}[];
		}>('/safety/admin/list');
	},
	reviewAppeal(userId: string, approved: boolean) {
		return fetchWithAuth<{ success: boolean; message: string }>('/safety/admin/review-appeal', {
			method: 'POST',
			body: JSON.stringify({ userId, approved }),
		});
	},
};

export const analyticsApi = {
	get(days = 30) {
		return fetchWithAuth<{
			totalUsers: number;
			totalChats: number;
			loginsPerDay: { date: string; count: number }[];
			chatsPerDay: { date: string; count: number }[];
			days: number;
		}>('/analytics', {
			searchParams: { days }
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
