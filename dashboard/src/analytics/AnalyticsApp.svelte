<script lang="ts">
	import { onMount } from 'svelte';
	import { analyticsApi } from '../lib/api';
	import { getSession, signOut } from '../lib/auth';
	import Login from '../lib/components/Login.svelte';
	import Header from '../lib/components/Header.svelte';

	let session: { user: { name: string; email: string } } | null = null;
	let authChecked = false;
	let loading = true;
	let error = '';
	let days = 30;
	let activeInPeriod = 0;
	let activeInPrevPeriod = 0;
	let activeUsersPerDay: { date: string; count: number }[] = [];
	let newSignupsInPeriod = 0;
	let signupsPerDay: { date: string; count: number }[] = [];
	let chatsInPeriod = 0;
	let chatsInPrevPeriod = 0;
	let chatsPerDay: { date: string; count: number }[] = [];
	let retentionPct = 0;
	let retentionPerDay: { date: string; count: number }[] = [];
	let retentionCount = 0;
	let retentionDenom = 0;
	let tokenByUser: {
		userId: string;
		name: string;
		email: string;
		role: string;
		dailyTokenLimit: number;
		usedToday: number;
		totalTokens: number;
		totalCost: number;
		count: number;
	}[] = [];

	function periodParam() {
		return days === 7 ? '7d' : days === 90 ? '90d' : '30d';
	}

	onMount(async () => {
		session = await getSession();
		authChecked = true;
		if (!session) return;
		await loadAnalytics();
		loading = false;
	});

	async function loadAnalytics() {
		error = '';
		try {
			const data = await analyticsApi.get(days);
			activeInPeriod = data.activeInPeriod;
			activeInPrevPeriod = data.activeInPrevPeriod;
			activeUsersPerDay = data.activeUsersPerDay ?? [];
			newSignupsInPeriod = data.newSignupsInPeriod;
			signupsPerDay = data.signupsPerDay ?? [];
			chatsInPeriod = data.chatsInPeriod;
			chatsInPrevPeriod = data.chatsInPrevPeriod;
			chatsPerDay = data.chatsPerDay ?? [];
			retentionPct = data.retentionPct;
			retentionCount = data.retentionCount;
			retentionDenom = data.retentionDenom;
			retentionPerDay = data.retentionPerDay ?? [];
		} catch (err: unknown) {
			let msg = 'Failed to load analytics';
			if (err instanceof Error) msg = err.message;
			else if (err && typeof err === 'object' && 'detail' in err) msg = String((err as { detail: string }).detail);
			error = msg;
			setTimeout(() => (error = ''), 8000);
		} finally {
			loading = false;
		}
		try {
			const tokenData = await analyticsApi.getTokenUsageByUser(periodParam());
			tokenByUser = tokenData.byUser ?? [];
		} catch {
			tokenByUser = [];
		}
	}

	function trendPercent(current: number, previous: number): number {
		if (previous === 0) return current > 0 ? 100 : 0;
		return Math.round(((current - previous) / previous) * 100);
	}

	$: pctActive = trendPercent(activeInPeriod, activeInPrevPeriod);
	$: pctChats = trendPercent(chatsInPeriod, chatsInPrevPeriod);

	// Reusable sparkline (viewBox 0 0 100 24)
	function spark(data: { date: string; count: number }[]) {
		if (!data.length) return { area: '', line: '' };
		const maxVal = Math.max(...data.map((d) => d.count), 1);
		const n = data.length;
		const pts = data.map((d, i) => {
			const x = n <= 1 ? 50 : (i / (n - 1)) * 100;
			const y = 24 - (d.count / maxVal) * 22;
			return `${x},${y}`;
		});
		const line = 'M ' + pts.join(' L ');
		const area = line + ' L 100,24 L 0,24 Z';
		return { area, line };
	}
	$: activeSpark = spark(activeUsersPerDay);
	$: signupsSpark = spark(signupsPerDay);
	$: chatsSpark = spark(chatsPerDay);
	$: retentionSpark = spark(retentionPerDay);
</script>

{#if !authChecked}
	<div class="min-h-screen bg-gray-50 flex items-center justify-center">
		<p class="text-gray-500">Wird geladen…</p>
	</div>
{:else if !session}
	<Login />
{:else}
<main class="min-h-screen bg-gray-50 text-gray-900">
	<Header 
		title="Analytics" 
		description="User activity and engagement metrics." 
		activePage="analytics" 
	/>

	{#if error}
		<div class="max-w-6xl mx-auto mt-4 px-6">
			<div class="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg">
				{error}
			</div>
		</div>
	{/if}

	<!-- Global timeframe selector -->
	<div class="bg-white border-b border-gray-200 px-6 py-4">
		<div class="max-w-6xl mx-auto flex flex-wrap items-center gap-4">
			<span class="text-sm font-medium text-gray-700">Timeframe</span>
			<select
				class="border border-gray-300 px-3 py-2 rounded-lg text-sm bg-white min-w-[8rem]"
				bind:value={days}
				on:change={() => loadAnalytics()}
			>
				<option value={7}>Last 7 days</option>
				<option value={14}>Last 14 days</option>
				<option value={30}>Last 30 days</option>
				<option value={60}>Last 60 days</option>
				<option value={90}>Last 90 days</option>
			</select>
			<button
				class="text-sm px-3 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
				on:click={() => loadAnalytics()}
			>
				Refresh
			</button>
		</div>
	</div>

	<div class="max-w-6xl mx-auto px-6 py-8">
		{#if loading}
			<div class="text-center py-12 text-gray-500">Loading analytics…</div>
		{:else}
			<!-- Summary cards -->
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
				<div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
					<div class="flex items-center gap-3">
						<div class="p-3 bg-blue-50 rounded-xl">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 text-blue-600">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Z" />
							</svg>
						</div>
						<div class="min-w-0 flex-1">
							<p class="text-sm text-gray-500">Active users</p>
							<p class="text-2xl font-bold">{activeInPeriod}</p>
							<p class="text-xs text-gray-500">unique in period</p>
							<p class="text-xs mt-1 {pctActive > 0 ? 'text-emerald-600' : pctActive < 0 ? 'text-amber-600' : 'text-gray-500'}">
								{pctActive > 0 ? '↑' : pctActive < 0 ? '↓' : ''} {pctActive !== 0 ? Math.abs(pctActive) + '%' : 'no change'} vs prev {days}d
							</p>
							{#if activeSpark.line}
								<div class="mt-3 h-8 w-full" aria-hidden="true">
									<svg class="w-full h-full text-blue-500" viewBox="0 0 100 24" preserveAspectRatio="none">
										<path fill="currentColor" fill-opacity="0.2" d={activeSpark.area} />
										<path fill="none" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" d={activeSpark.line} />
									</svg>
								</div>
							{/if}
						</div>
					</div>
				</div>
				<div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
					<div class="flex items-center gap-3">
						<div class="p-3 bg-violet-50 rounded-xl">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 text-violet-600">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19 7.5v2.25m0 2.25v2.25m-2.25-2.25H19m-2.25 0h-2.25M4.5 7.5v2.25M4.5 19.5h15M2.25 9h19.5M2.25 15h19.5" />
							</svg>
						</div>
						<div class="min-w-0 flex-1">
							<p class="text-sm text-gray-500">New signups</p>
							<p class="text-2xl font-bold">{newSignupsInPeriod}</p>
							<p class="text-xs text-gray-500 mt-1">in last {days} days</p>
							{#if signupsSpark.line}
								<div class="mt-3 h-8 w-full" aria-hidden="true">
									<svg class="w-full h-full text-violet-500" viewBox="0 0 100 24" preserveAspectRatio="none">
										<path fill="currentColor" fill-opacity="0.2" d={signupsSpark.area} />
										<path fill="none" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" d={signupsSpark.line} />
									</svg>
								</div>
							{/if}
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
						<div class="min-w-0 flex-1">
							<p class="text-sm text-gray-500">Chats</p>
							<p class="text-2xl font-bold">{chatsInPeriod}</p>
							<p class="text-xs mt-1 {pctChats > 0 ? 'text-emerald-600' : pctChats < 0 ? 'text-amber-600' : 'text-gray-500'}">
								{pctChats > 0 ? '↑' : pctChats < 0 ? '↓' : ''} {pctChats !== 0 ? Math.abs(pctChats) + '%' : 'no change'} vs prev {days}d
							</p>
							{#if chatsSpark.line}
								<div class="mt-3 h-8 w-full" aria-hidden="true">
									<svg class="w-full h-full text-emerald-500" viewBox="0 0 100 24" preserveAspectRatio="none">
										<path fill="currentColor" fill-opacity="0.2" d={chatsSpark.area} />
										<path fill="none" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" d={chatsSpark.line} />
									</svg>
								</div>
							{/if}
						</div>
					</div>
				</div>
				<div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
					<div class="flex items-center gap-3">
						<div class="p-3 bg-amber-50 rounded-xl">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 text-amber-600">
								<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
							</svg>
						</div>
						<div class="min-w-0 flex-1">
							<p class="text-sm text-gray-500">Retention</p>
							<p class="text-2xl font-bold">{retentionPct}%</p>
							<p class="text-xs text-gray-500 mt-1">prev {days}d users active again</p>
							{#if retentionSpark.line}
								<div class="mt-3 h-8 w-full" aria-hidden="true">
									<svg class="w-full h-full text-amber-500" viewBox="0 0 100 24" preserveAspectRatio="none">
										<path fill="currentColor" fill-opacity="0.2" d={retentionSpark.area} />
										<path fill="none" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" d={retentionSpark.line} />
									</svg>
								</div>
							{/if}
						</div>
					</div>
				</div>
			</div>

			<!-- Token usage per user (admin only) -->
			<section class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
				<h2 class="text-lg font-semibold mb-4">Token usage per user</h2>
				{#if tokenByUser.length === 0}
					<p class="text-gray-500 py-8 text-center">No token usage in the selected period, or this view is only available to admins.</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full text-sm text-left">
							<thead class="text-gray-600 border-b border-gray-200">
								<tr>
									<th class="py-3 pr-4 font-medium">Name</th>
									<th class="py-3 pr-4 font-medium">Email</th>
									<th class="py-3 pr-4 font-medium">Role</th>
									<th class="py-3 pr-4 font-medium text-right">Daily limit</th>
									<th class="py-3 pr-4 font-medium text-right">Used today</th>
									<th class="py-3 pr-4 font-medium text-right">Tokens ({periodParam()})</th>
									<th class="py-3 pr-4 font-medium text-right">Cost</th>
								</tr>
							</thead>
							<tbody>
								{#each tokenByUser as row}
									<tr class="border-b border-gray-100">
										<td class="py-3 pr-4">{row.name || '—'}</td>
										<td class="py-3 pr-4 text-gray-600">{row.email || '—'}</td>
										<td class="py-3 pr-4">{row.role}</td>
										<td class="py-3 pr-4 text-right">{row.dailyTokenLimit.toLocaleString()}</td>
										<td class="py-3 pr-4 text-right">{row.usedToday.toLocaleString()}</td>
										<td class="py-3 pr-4 text-right">{row.totalTokens.toLocaleString()}</td>
										<td class="py-3 pr-4 text-right">${row.totalCost.toFixed(4)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</section>
		{/if}
	</div>
</main>
{/if}
