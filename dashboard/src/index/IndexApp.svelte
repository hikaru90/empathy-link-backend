<script lang="ts">
	import { onMount } from 'svelte';
	import {
		nvcKnowledgeApi,
		type KnowledgeEntry,
		type KnowledgePayload
	} from '../lib/api';

	type FormState = KnowledgePayload & {
		id?: string;
		tagsList: string[];
		subcategory?: string | null;
		source?: string | null;
	};

	const maxContentLength = 5000;

	let entries: KnowledgeEntry[] = [];
	let categories: string[] = [];
	let loading = true;
	let error = '';
	let editorVisible = false;
	let searchQuery = '';
	let languageFilter = 'all';
	let categoryFilter = '';
	let tagInput = '';

	let form: FormState = getDefaultForm();

	function getDefaultForm(): FormState {
		return {
			language: 'de',
			title: '',
			content: '',
			category: '',
			subcategory: '',
			source: '',
			tags: null,
			tagsList: [],
			priority: 3
		};
	}

	onMount(async () => {
		await Promise.all([loadCategories(), loadEntries()]);
		loading = false;
	});

	async function loadCategories() {
		try {
			const result = await nvcKnowledgeApi.getCategories();
			categories = result.categories || [];
			if (!form.category && categories.length > 0) {
				form.category = categories[0];
			}
		} catch (err) {
			handleError(err);
		}
	}

	async function loadEntries() {
		try {
			const result = await nvcKnowledgeApi.list({
				language: languageFilter !== 'all' ? languageFilter : undefined,
				category: categoryFilter || undefined,
				isActive: true,
				limit: 100
			});
			entries = result.entries || [];
		} catch (err) {
			handleError(err);
		}
	}

	function startCreate() {
		form = {
			...getDefaultForm(),
			category: categories[0] ?? ''
		};
		tagInput = '';
		editorVisible = true;
	}

	async function startEdit(id: string) {
		try {
			const entry = await nvcKnowledgeApi.get(id);
			form = {
				id: entry.id,
				language: entry.language,
				title: entry.title,
				content: entry.content,
				category: entry.category,
				subcategory: entry.subcategory ?? '',
				source: entry.source ?? '',
				priority: entry.priority,
				tagsList: entry.tags ?? [],
				tags: entry.tags ?? null
			};
			editorVisible = true;
		} catch (err) {
			handleError(err);
		}
	}

	async function saveEntry() {
		try {
			const payload: KnowledgePayload = {
				language: form.language,
				title: form.title.trim(),
				content: form.content.trim(),
				category: form.category,
				subcategory: form.subcategory?.trim() || null,
				source: form.source?.trim() || null,
				tags: form.tagsList.length > 0 ? form.tagsList : null,
				priority: form.priority
			};

			if (!payload.title || !payload.content || !payload.category) {
				throw new Error('Title, content, and category are required.');
			}

			if (form.id) {
				await nvcKnowledgeApi.update(form.id, payload);
			} else {
				await nvcKnowledgeApi.create(payload);
			}

			editorVisible = false;
			await loadEntries();
		} catch (err) {
			handleError(err);
		}
	}

	async function deleteEntry(id: string) {
		if (!confirm('Delete this entry permanently?')) return;
		try {
			await nvcKnowledgeApi.delete(id);
			await loadEntries();
		} catch (err) {
			handleError(err);
		}
	}

	async function searchEntries() {
		if (!searchQuery.trim()) {
			await loadEntries();
			return;
		}

		try {
			const result = await nvcKnowledgeApi.search({
				query: searchQuery,
				language: languageFilter !== 'all' ? languageFilter : undefined,
				category: categoryFilter || undefined
			});
			entries = result.results || [];
		} catch (err) {
			handleError(err);
		}
	}

	function addTag() {
		const trimmed = tagInput.trim();
		if (trimmed && !form.tagsList.includes(trimmed)) {
			form.tagsList = [...form.tagsList, trimmed];
		}
		tagInput = '';
	}

	function removeTag(tag: string) {
		form.tagsList = form.tagsList.filter((t) => t !== tag);
	}

	function handleError(err: unknown) {
		error = err instanceof Error ? err.message : 'Unexpected error';
		setTimeout(() => {
			error = '';
		}, 5000);
	}

	function cancelEdit() {
		editorVisible = false;
	}

	function formatDate(value: string) {
		try {
			return new Date(value).toLocaleDateString();
		} catch {
			return value;
		}
	}
</script>

<main class="min-h-screen bg-gray-50 text-gray-900">
	<header class="bg-white border-b border-gray-200">
		<div class="max-w-6xl mx-auto px-6 py-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
			<div>
				<p class="text-xs uppercase tracking-wide text-gray-400">Operations</p>
				<h1 class="text-2xl font-semibold">NVC Knowledge Manager</h1>
				<p class="text-sm text-gray-500">Maintain and curate the prompt knowledge base.</p>
			</div>
			<nav class="flex gap-4 text-sm">
				<a href="/" class="text-gray-900 font-semibold">Knowledge Base</a>
				<a href="/learn.html" class="text-blue-600 hover:underline">Learn CMS</a>
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
		{#if editorVisible}
			<section class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-6">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="text-xl font-semibold">
							{form.id ? 'Edit Entry' : 'Create Entry'}
						</h2>
						<p class="text-sm text-gray-500">Craft high-quality knowledge snippets.</p>
					</div>
					<div class="flex gap-3">
						<button class="px-4 py-2 border rounded-lg text-gray-600" on:click={cancelEdit}>
							Cancel
						</button>
						<button class="px-4 py-2 bg-blue-600 text-white rounded-lg" on:click={saveEntry}>
							Save Entry
						</button>
					</div>
				</div>

				<div class="grid md:grid-cols-2 gap-6">
					<div class="space-y-4">
						<label class="block text-sm text-gray-600">Language</label>
						<select bind:value={form.language} class="w-full border px-3 py-2 rounded-lg">
							<option value="de">German (de)</option>
							<option value="en">English (en)</option>
						</select>

						<label class="block text-sm text-gray-600">Title *</label>
						<input bind:value={form.title} class="w-full border px-3 py-2 rounded-lg" placeholder="Title" />

						<label class="block text-sm text-gray-600">Category *</label>
						<select bind:value={form.category} class="w-full border px-3 py-2 rounded-lg">
							{#each categories as category}
								<option value={category}>{category}</option>
							{/each}
						</select>

						<label class="block text-sm text-gray-600">Subcategory</label>
						<input bind:value={form.subcategory} class="w-full border px-3 py-2 rounded-lg" placeholder="Optional" />

						<label class="block text-sm text-gray-600">Source</label>
						<input bind:value={form.source} class="w-full border px-3 py-2 rounded-lg" placeholder="Optional" />
					</div>

					<div class="space-y-4">
						<label class="block text-sm text-gray-600">Content *</label>
						<textarea
							bind:value={form.content}
							class="w-full border px-3 py-2 rounded-lg h-48"
							placeholder="Provide descriptive content..."
						/>
						<div class="text-xs text-gray-500 flex justify-between">
							<span>{form.content.length} / {maxContentLength}</span>
							{#if form.content.length > maxContentLength * 0.9}
								<span class="text-amber-600">Approaching limit</span>
							{/if}
						</div>

						<label class="block text-sm text-gray-600">Priority: {form.priority}</label>
						<input
							type="range"
							min="1"
							max="5"
							step="1"
							bind:value={form.priority}
							class="w-full"
						/>

						<div>
							<label class="block text-sm text-gray-600 mb-2">Tags</label>
							<div class="flex gap-2">
								<input
									bind:value={tagInput}
									class="flex-1 border px-3 py-2 rounded-lg"
									placeholder="Add tag"
									on:keydown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
								/>
								<button type="button" class="px-3 py-2 bg-gray-800 text-white rounded-lg" on:click={addTag}>
									Add
								</button>
							</div>
							<div class="flex flex-wrap gap-2 mt-3">
								{#if form.tagsList.length === 0}
									<p class="text-xs text-gray-400">No tags yet.</p>
								{:else}
									{#each form.tagsList as tag}
										<span class="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm flex items-center gap-2">
											{tag}
											<button class="text-blue-600" type="button" on:click={() => removeTag(tag)}>
												×
											</button>
										</span>
									{/each}
								{/if}
							</div>
						</div>
					</div>
				</div>
			</section>
		{:else}
			<section class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-6">
				<div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
					<div>
						<h2 class="text-xl font-semibold">Knowledge Entries ({entries.length})</h2>
						<p class="text-sm text-gray-500">Filter, search, and edit knowledge items.</p>
					</div>
					<div class="flex gap-3">
						<button class="px-4 py-2 border rounded-lg text-gray-600" on:click={loadEntries}>
							Refresh
						</button>
						<button class="px-4 py-2 bg-blue-600 text-white rounded-lg" on:click={startCreate}>
							New Entry
						</button>
					</div>
				</div>

				<div class="grid md:grid-cols-4 gap-4">
					<select bind:value={languageFilter} class="border px-3 py-2 rounded-lg" on:change={loadEntries}>
						<option value="all">All languages</option>
						<option value="de">German</option>
						<option value="en">English</option>
					</select>

					<select bind:value={categoryFilter} class="border px-3 py-2 rounded-lg" on:change={loadEntries}>
						<option value="">All categories</option>
						{#each categories as category}
							<option value={category}>{category}</option>
						{/each}
					</select>

					<div class="md:col-span-2 flex gap-2">
						<input
							class="flex-1 border px-3 py-2 rounded-lg"
							placeholder="Search entries"
							bind:value={searchQuery}
							on:keydown={(e) => e.key === 'Enter' && (e.preventDefault(), searchEntries())}
						/>
						<button class="px-3 py-2 bg-gray-900 text-white rounded-lg" on:click={searchEntries}>
							Search
						</button>
					</div>
				</div>

				<div class="overflow-auto border rounded-xl">
					<table class="min-w-full divide-y divide-gray-100 text-sm">
						<thead class="bg-gray-50 text-xs uppercase text-gray-500">
							<tr>
								<th class="px-4 py-3 text-left">Title</th>
								<th class="px-4 py-3 text-left">Language</th>
								<th class="px-4 py-3 text-left">Category</th>
								<th class="px-4 py-3 text-left">Tags</th>
								<th class="px-4 py-3 text-left">Priority</th>
								<th class="px-4 py-3 text-left">Updated</th>
								<th class="px-4 py-3 text-right">Actions</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-100">
							{#if loading}
								<tr>
									<td colspan="7" class="px-6 py-10 text-center text-gray-400">Loading entries…</td>
								</tr>
							{:else if entries.length === 0}
								<tr>
									<td colspan="7" class="px-6 py-10 text-center text-gray-400">
										No entries match the current filters.
									</td>
								</tr>
							{:else}
								{#each entries as entry}
									<tr class="hover:bg-gray-50">
										<td class="px-4 py-3">
											<div class="font-medium">{entry.title}</div>
											<div class="text-xs text-gray-500 line-clamp-2">{entry.content.slice(0, 120)}{entry.content.length > 120 ? '…' : ''}</div>
										</td>
										<td class="px-4 py-3">
											<span class="px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs">
												{entry.language.toUpperCase()}
											</span>
										</td>
										<td class="px-4 py-3">
											<div class="text-sm">{entry.category}</div>
											{#if entry.subcategory}
												<div class="text-xs text-gray-400">/{entry.subcategory}</div>
											{/if}
										</td>
										<td class="px-4 py-3">
											<div class="flex flex-wrap gap-1">
												{#if entry.tags && entry.tags.length > 0}
													{#each entry.tags as tag}
														<span class="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">{tag}</span>
													{/each}
												{:else}
													<span class="text-xs text-gray-400">—</span>
												{/if}
											</div>
										</td>
										<td class="px-4 py-3">
											<div class="flex gap-0.5 text-amber-500">
												{#each Array(5) as _, idx}
													<span class={idx < entry.priority ? 'opacity-100' : 'opacity-20'}>★</span>
												{/each}
											</div>
										</td>
										<td class="px-4 py-3 text-sm text-gray-500">{formatDate(entry.updated)}</td>
										<td class="px-4 py-3 text-right space-x-3">
											<button class="text-blue-600 hover:underline" on:click={() => startEdit(entry.id)}>
												Edit
											</button>
											<button class="text-rose-600 hover:underline" on:click={() => deleteEntry(entry.id)}>
												Delete
											</button>
										</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					</table>
				</div>
			</section>
		{/if}
	</div>
</main>

