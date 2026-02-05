const API_BASE = '/api';
async function fetchWithAuth(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (!(options.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
    }
    const requestUrl = options.searchParams && Object.keys(options.searchParams).length > 0
        ? `${API_BASE}${url}?${new URLSearchParams(Object.entries(options.searchParams).reduce((acc, [key, value]) => {
            if (value === undefined || value === null)
                return acc;
            acc[key] = String(value);
            return acc;
        }, {})).toString()}`
        : `${API_BASE}${url}`;
    const response = await fetch(requestUrl, Object.assign(Object.assign({}, options), { headers, credentials: 'include' }));
    if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
            const error = await response.json();
            if (error === null || error === void 0 ? void 0 : error.error) {
                message = error.error;
            }
        }
        catch (_a) {
            // ignore
        }
        throw new Error(message);
    }
    if (response.status === 204) {
        return undefined;
    }
    return response.json();
}
export const nvcKnowledgeApi = {
    list(options = {}) {
        var _a;
        return fetchWithAuth('/nvc-knowledge', {
            searchParams: {
                language: options.language,
                category: options.category,
                tags: (_a = options.tags) === null || _a === void 0 ? void 0 : _a.join(','),
                isActive: options.isActive,
                limit: options.limit
            }
        });
    },
    get(id) {
        return fetchWithAuth(`/nvc-knowledge/${id}`);
    },
    create(data) {
        return fetchWithAuth('/nvc-knowledge', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },
    update(id, data) {
        return fetchWithAuth(`/nvc-knowledge/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },
    delete(id) {
        return fetchWithAuth(`/nvc-knowledge/${id}`, {
            method: 'DELETE'
        });
    },
    search(options) {
        return fetchWithAuth('/nvc-knowledge/search', {
            method: 'POST',
            body: JSON.stringify(options)
        });
    },
    getCategories() {
        return fetchWithAuth('/nvc-knowledge/meta/categories');
    },
    getTags() {
        return fetchWithAuth('/nvc-knowledge/meta/tags');
    }
};
export const safetyApi = {
    getStatus() {
        return fetchWithAuth('/safety/status');
    },
    getResources(lang = 'de') {
        return fetchWithAuth('/safety/resources', { searchParams: { lang } });
    },
    requestAppeal() {
        return fetchWithAuth('/safety/appeal', { method: 'POST' });
    },
    getFlaggedUsers() {
        return fetchWithAuth('/safety/admin/list');
    },
    reviewAppeal(userId, approved) {
        return fetchWithAuth('/safety/admin/review-appeal', {
            method: 'POST',
            body: JSON.stringify({ userId, approved }),
        });
    },
};
export const analyticsApi = {
    get(days = 30) {
        return fetchWithAuth('/analytics', {
            searchParams: { days }
        });
    }
};
//# sourceMappingURL=api.js.map