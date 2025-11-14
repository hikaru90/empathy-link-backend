/**
 * API client for NVC Knowledge Base
 */

const API_BASE = '/api';

async function fetchWithAuth(url, options = {}) {
	const headers = new Headers(options.headers || {});
	headers.set('Content-Type', 'application/json');

	const response = await fetch(`${API_BASE}${url}`, {
		...options,
		headers,
		credentials: 'include'
	});

	if (!response.ok) {
		const error = await response.json().catch(() => ({ error: 'Unknown error' }));
		throw new Error(error.error || `HTTP ${response.status}`);
	}

	return response.json();
}

const nvcKnowledgeApi = {
	async list(options = {}) {
		const params = new URLSearchParams();
		if (options.language) params.set('language', options.language);
		if (options.category) params.set('category', options.category);
		if (options.tags) params.set('tags', options.tags.join(','));
		if (options.isActive !== undefined) params.set('isActive', String(options.isActive));
		if (options.limit) params.set('limit', String(options.limit));
		if (options.offset) params.set('offset', String(options.offset));

		return fetchWithAuth(`/nvc-knowledge?${params.toString()}`);
	},

	async get(id) {
		return fetchWithAuth(`/nvc-knowledge/${id}`);
	},

	async create(data) {
		return fetchWithAuth('/nvc-knowledge', {
			method: 'POST',
			body: JSON.stringify(data)
		});
	},

	async update(id, data) {
		return fetchWithAuth(`/nvc-knowledge/${id}`, {
			method: 'PUT',
			body: JSON.stringify(data)
		});
	},

	async delete(id, hardDelete = false) {
		const url = hardDelete ? `/nvc-knowledge/${id}?hard=true` : `/nvc-knowledge/${id}`;
		return fetchWithAuth(url, {
			method: 'DELETE'
		});
	},

	async duplicate(id) {
		return fetchWithAuth(`/nvc-knowledge/${id}/duplicate`, {
			method: 'POST'
		});
	},

	async search(options) {
		return fetchWithAuth('/nvc-knowledge/search', {
			method: 'POST',
			body: JSON.stringify(options)
		});
	},

	async findSimilar(id, limit = 5) {
		return fetchWithAuth(`/nvc-knowledge/${id}/similar?limit=${limit}`);
	},

	async getTranslations(id) {
		return fetchWithAuth(`/nvc-knowledge/${id}/translations`);
	},

	async getCategories() {
		return fetchWithAuth('/nvc-knowledge/meta/categories');
	},

	async getTags() {
		return fetchWithAuth('/nvc-knowledge/meta/tags');
	},

	async getStats() {
		return fetchWithAuth('/nvc-knowledge/meta/stats');
	}
};

