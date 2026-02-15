<script lang="ts">
	import { onMount } from 'svelte';
	import { safetyApi } from '../lib/api';
	import { getSession, signOut } from '../lib/auth';
	import Login from '../lib/components/Login.svelte';
	import Header from '../lib/components/Header.svelte';

	let session: { user: { name: string; email: string } } | null = null;
	let authChecked = false;
	let loading = true;
	let error = '';
	let flagged: {
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
	}[] = [];
	let reviewingUserId: string | null = null;

	const levelNames: Record<number, string> = {
		0: 'None',
		1: 'Watch',
		2: 'Caution',
		3: 'Restricted',
		4: 'Suspended',
	};

	onMount(async () => {
		session = await getSession();
		authChecked = true;
		if (!session) return;
		await loadFlagged();
		loading = false;
	});

	async function loadFlagged() {
		try {
			const data = await safetyApi.getFlaggedUsers();
			flagged = data.flagged || [];
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load';
			setTimeout(() => (error = ''), 5000);
		}
	}

	function formatDate(d: string) {
		try {
			return new Date(d).toLocaleString();
		} catch {
			return d;
		}
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
	<Header 
		title="Safety" 
		description="Flagged users (metadata only – no chat content)." 
		activePage="safety" 
	/>

	{#if error}
		<div class="max-w-6xl mx-auto mt-4 px-6">
			<div class="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg">
				{error}
			</div>
		</div>
	{/if}

	<div class="max-w-6xl mx-auto px-6 py-8">
		<div class="mb-6">
			<button
				class="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50"
				on:click={() => loadFlagged()}
			>
				Refresh
			</button>
		</div>

		{#if loading}
			<div class="text-center py-12 text-gray-500">Loading…</div>
		{:else}
			<section class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
				<h2 class="text-lg font-semibold mb-4">Flagged Users ({flagged.length})</h2>
				<p class="text-sm text-gray-500 mb-4">
					Metadata only. No chat content is ever stored or displayed.
				</p>
				{#if flagged.length === 0}
					<p class="text-gray-500 py-8 text-center">No flagged users.</p>
				{:else}
					<div class="overflow-auto border rounded-xl">
						<table class="min-w-full divide-y divide-gray-100 text-sm">
							<thead class="bg-gray-50 text-xs uppercase text-gray-500">
								<tr>
									<th class="px-4 py-3 text-left">User ID</th>
									<th class="px-4 py-3 text-left">Level</th>
									<th class="px-4 py-3 text-left">Why flagged (summary)</th>
									<th class="px-4 py-3 text-left">Appeal</th>
									<th class="px-4 py-3 text-left">Detected</th>
									<th class="px-4 py-3 text-left">Expires</th>
									<th class="px-4 py-3 text-left whitespace-nowrap">Actions</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-100">
								{#each flagged as f}
									<tr class="hover:bg-gray-50">
										<td class="px-4 py-3 font-mono text-xs">{f.userId}</td>
										<td class="px-4 py-3">
											<span
												class="px-2 py-1 rounded text-xs font-medium {f.level >= 4
													? 'bg-red-100 text-red-700'
													: f.level >= 3
														? 'bg-amber-100 text-amber-700'
														: f.level >= 2
															? 'bg-yellow-100 text-yellow-700'
															: 'bg-gray-100 text-gray-700'}"
											>
												{levelNames[f.level] ?? f.level}
											</span>
										</td>
										<td class="px-4 py-3 max-w-xs text-gray-700" title={f.summary}>
											{f.summary}
										</td>
										<td class="px-4 py-3">
											{#if f.appealStatus === 'pending'}
												<span class="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">Pending</span>
											{:else if f.appealStatus === 'approved'}
												<span class="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700">Approved</span>
											{:else if f.appealStatus === 'denied'}
												<span class="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">Denied</span>
											{:else if f.appealRequestedAt}
												<span class="text-gray-500 text-xs">Requested {formatDate(f.appealRequestedAt)}</span>
											{:else}
												—
											{/if}
										</td>
										<td class="px-4 py-3 text-gray-600">{formatDate(f.detectedAt)}</td>
										<td class="px-4 py-3 text-gray-600">
											{f.expiresAt ? formatDate(f.expiresAt) : '—'}
										</td>
										<td class="px-4 py-3 whitespace-nowrap">
											<div class="flex gap-3 items-center">
												<button
													type="button"
													class="px-4 py-2.5 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 active:bg-green-800 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-w-[120px]"
													disabled={reviewingUserId === f.userId}
													on:click={async () => {
														reviewingUserId = f.userId;
														try {
															await safetyApi.reviewAppeal(f.userId, true);
															await loadFlagged();
														} catch (e) {
															error = e instanceof Error ? e.message : 'Failed';
															setTimeout(() => (error = ''), 5000);
														} finally {
															reviewingUserId = null;
														}
													}}
												>
													{reviewingUserId === f.userId ? '…' : 'Restore access'}
												</button>
												{#if f.appealStatus === 'pending'}
													<button
														type="button"
														class="px-4 py-2.5 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 active:bg-red-800 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-w-[80px]"
														disabled={reviewingUserId === f.userId}
														on:click={async () => {
															reviewingUserId = f.userId;
															try {
																await safetyApi.reviewAppeal(f.userId, false);
																await loadFlagged();
															} catch (e) {
																error = e instanceof Error ? e.message : 'Failed';
																setTimeout(() => (error = ''), 5000);
															} finally {
																reviewingUserId = null;
															}
														}}
													>
														Deny
													</button>
												{/if}
											</div>
										</td>
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
