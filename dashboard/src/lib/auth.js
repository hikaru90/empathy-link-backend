const API_BASE = '/api/auth';
async function fetchAuth(url, options = {}) {
    var _a, _b, _c;
    const res = await fetch(`${API_BASE}${url}`, Object.assign(Object.assign({}, options), { headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers), credentials: 'include' }));
    const text = await res.text();
    let data;
    try {
        data = (text ? JSON.parse(text) : {});
    }
    catch (_d) {
        data = {};
    }
    if (!res.ok) {
        const msg = (_c = (_b = (_a = data === null || data === void 0 ? void 0 : data.error) === null || _a === void 0 ? void 0 : _a.message) !== null && _b !== void 0 ? _b : data === null || data === void 0 ? void 0 : data.message) !== null && _c !== void 0 ? _c : `HTTP ${res.status}`;
        throw new Error(msg);
    }
    return data;
}
export async function getSession() {
    try {
        const data = await fetchAuth('/get-session', {
            method: 'GET'
        });
        // better-auth may return { data } or session directly
        if (data === null || data === void 0 ? void 0 : data.data)
            return data.data;
        if (data === null || data === void 0 ? void 0 : data.user)
            return { user: data.user, session: { expiresAt: new Date(), token: '' } };
        return null;
    }
    catch (_a) {
        return null;
    }
}
export async function signIn(email, password) {
    var _a;
    const data = await fetchAuth('/sign-in/email', {
        method: 'POST',
        body: JSON.stringify({ email, password })
    });
    if (!(data === null || data === void 0 ? void 0 : data.user))
        throw new Error('Sign-in failed');
    return {
        user: data.user,
        session: { expiresAt: new Date(), token: (_a = data.token) !== null && _a !== void 0 ? _a : '' }
    };
}
export async function signOut() {
    await fetchAuth('/sign-out', { method: 'POST', body: '{}' });
}
//# sourceMappingURL=auth.js.map