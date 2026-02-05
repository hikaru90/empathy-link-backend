<script lang="ts">
	import { onMount } from 'svelte';
	import { analyticsApi } from '../lib/api';
	import { getSession, signOut } from '../lib/auth';
	import Login from '../lib/components/Login.svelte';

	let session: { user: { name: string; email: string } } | null = null;
	let authChecked = false;
	let loading = true;
	let error = '';
	let totalUsers = 0;
	let totalChats = 0;
	let loginsPerDay: { date: string; count: number }[] = [];
	let chatsPerDay: { date: string; count: number }[] = [];
	let days = 30;

	onMount(async () => {
		session = await getSession();
		authChecked = true;
		if (!session) return;
		await loadAnalytics();
		loading = false;
	});

	async function loadAnalytics() {
		try {
			const data = await analyticsApi.get(days);
			totalUsers = data.totalUsers;
			totalChats = data.totalChats;
			loginsPerDay = data.loginsPerDay;
			chatsPerDay = data.chatsPerDay;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load analytics';
			setTimeout(() => (error = ''), 5000);
		}
	}

	function formatDate(d: string) {
		try {
			return new Date(d).toLocaleDateString(undefined, {
				month: 'short',
				day: 'numeric',
				year: d.length > 10 ? '2-digit' : undefined
			});
		} catch {
			return d;
		}
	}

	function getMaxCount(series: { count: number }[]) {
		if (series.length === 0) return 1;
		return Math.max(...series.map((s) => s.count), 1);
	}
</script>

{#if !authChecked}
	<div class="min-h-screen bg-gray-50 flex items-center justify-center">
		<p class="text-gray-500">Wird geladen…</p>
	</div>
{:else if !session}
	<Login />
{:else}
<main class="min-h-screen bg-gray-50 text-gray-900">
	<header class="bg-white border-b border-gray-200">
		<div class="max-w-6xl mx-auto px-6 py-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
			<div>
				<p class="text-xs uppercase tracking-wide text-gray-400">Operations</p>
				<h1 class="text-2xl font-semibold">Analytics</h1>
				<p class="text-sm text-gray-500">User activity and engagement metrics.</p>
			</div>
			<nav class="flex gap-4 text-sm items-center">
				<a href="/" class="text-gray-600 hover:text-gray-900">Knowledge Base</a>
				<a href="/analytics.html" class="text-gray-900 font-semibold">Analytics</a>
				<a href="/safety.html" class="text-gray-600 hover:text-gray-900">Safety</a>
				<button
					type="button"
					class="px-3 py-1.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
					on:click={async () => {
						await signOut();
						window.location.reload();
					}}
				>
					Abmelden
				</button>
			</nav>
		</div>
	</header>

	{#if error}
		<div class="max-w-6xl mx-auto mt-4 px-6">
			<div class="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg">
				{error}
			</div>
		</div>
	{/if}

	<div class="max-w-6xl mx-auto px-6 py-8">
		<div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
			<select
				class="border px-3 py-2 rounded-lg w-32"
				bind:value={days}
				on:change={() => loadAnalytics()}
			>
				<option value={7}>7 days</option>
				<option value={14}>14 days</option>
				<option value={30}>30 days</option>
				<option value={60}>60 days</option>
				<option value={90}>90 days</option>
			</select>
			<button
				class="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50"
				on:click={() => loadAnalytics()}
			>
				Refresh
			</button>
		</div>

		{#if loading}
			<div class="text-center py-12 text-gray-500">Loading analytics…</div>
		{:else}
			<!-- Summary cards -->
			<div class="grid md:grid-cols-2 gap-6 mb-8">
				<div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
					<div class="flex items-center gap-3">
						<div class="p-3 bg-blue-50 rounded-xl">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 text-blue-600">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Z" />
							</svg>
						</div>
						<div>
							<p class="text-sm text-gray-500">Total Users</p>
							<p class="text-2xl font-bold">{totalUsers}</p>
						</div>
					</div>
				</div>
				<div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
					<div class="flex items-center gap-3">
						<div class="p-3 bg-emerald-50 rounded-xl">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 text-emerald-600">
								<path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
							</svg>
						</div>
						<div>
							<p class="text-sm text-gray-500">Total Chats</p>
							<p class="text-2xl font-bold">{totalChats}</p>
						</div>
					</div>
				</div>
			</div>

			<!-- Logins per day -->
			<section class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 mb-8">
				<h2 class="text-lg font-semibold mb-4">Logins per Day</h2>
				{#if loginsPerDay.length === 0}
					<p class="text-gray-500 py-8 text-center">No login data in the selected period.</p>
				{:else}
					<div class="space-y-2">
						{#each loginsPerDay as item}
							{@const maxVal = getMaxCount(loginsPerDay)}
							<div class="flex items-center gap-4">
								<span class="w-24 text-sm text-gray-600">{formatDate(item.date)}</span>
								<div class="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
									<div
										class="h-full bg-blue-500 rounded-full transition-all"
										style="width: {(item.count / maxVal) * 100}%"
									></div>
								</div>
								<span class="w-12 text-right text-sm font-medium">{item.count}</span>
							</div>
						{/each}
					</div>
				{/if}
			</section>

			<!-- Chats per day -->
			<section class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
				<h2 class="text-lg font-semibold mb-4">Chats per Day</h2>
				{#if chatsPerDay.length === 0}
					<p class="text-gray-500 py-8 text-center">No chat data in the selected period.</p>
				{:else}
					<div class="space-y-2">
						{#each chatsPerDay as item}
							{@const maxVal = getMaxCount(chatsPerDay)}
							<div class="flex items-center gap-4">
								<span class="w-24 text-sm text-gray-600">{formatDate(item.date)}</span>
								<div class="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
									<div
										class="h-full bg-emerald-500 rounded-full transition-all"
										style="width: {(item.count / maxVal) * 100}%"
									></div>
								</div>
								<span class="w-12 text-right text-sm font-medium">{item.count}</span>
							</div>
						{/each}
					</div>
				{/if}
			</section>
		{/if}
	</div>
</main>
{/if}
