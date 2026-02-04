const API_BASE = '/api/auth';

export interface SessionUser {
	id: string;
	email: string;
	name: string;
	image?: string | null;
	role?: string;
}

export interface Session {
	user: SessionUser;
	session: { expiresAt: Date; token: string };
}

async function fetchAuth<T>(url: string, options: RequestInit = {}): Promise<T> {
	const res = await fetch(`${API_BASE}${url}`, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			...options.headers
		},
		credentials: 'include'
	});

	const text = await res.text();
	let data: T;
	try {
		data = (text ? JSON.parse(text) : {}) as T;
	} catch {
		data = {} as T;
	}

	if (!res.ok) {
		const msg = (data as any)?.error?.message ?? (data as any)?.message ?? `HTTP ${res.status}`;
		throw new Error(msg);
	}

	return data;
}

export async function getSession(): Promise<Session | null> {
	try {
		const data = await fetchAuth<{ data?: Session | null; user?: SessionUser }>('/get-session', {
			method: 'GET'
		});
		// better-auth may return { data } or session directly
		if (data?.data) return data.data;
		if (data?.user) return { user: data.user, session: { expiresAt: new Date(), token: '' } };
		return null;
	} catch {
		return null;
	}
}

export async function signIn(email: string, password: string): Promise<Session> {
	const data = await fetchAuth<{ user: SessionUser; token: string }>('/sign-in/email', {
		method: 'POST',
		body: JSON.stringify({ email, password })
	});
	if (!data?.user) throw new Error('Sign-in failed');
	return {
		user: data.user,
		session: { expiresAt: new Date(), token: data.token ?? '' }
	};
}

export async function signOut(): Promise<void> {
	await fetchAuth('/sign-out', { method: 'POST', body: '{}' });
}
