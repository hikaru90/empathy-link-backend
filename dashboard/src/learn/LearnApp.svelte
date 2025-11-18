<script lang="ts">
	import { onMount } from 'svelte';
	import {
		learnApi,
		type LearnCategory,
		type LearnTopic,
		type LearnTopicVersion,
		type CategoryPayload,
		type TopicPayload,
		type VersionPayload
	} from '../lib/api';

	let categories: LearnCategory[] = [];
	let topics: LearnTopic[] = [];
	let selectedTopic: (LearnTopic & { versions?: LearnTopicVersion[] }) | null = null;
	let selectedVersion: LearnTopicVersion | null = null;
	let error = '';
	let loading = true;

	let categoryForm = getDefaultCategoryForm();
	let topicForm = getDefaultTopicForm();
	let versionForm = getDefaultVersionForm();

	function getDefaultCategoryForm() {
		return {
			id: '',
			nameDE: '',
			nameEN: '',
			slug: '',
			sortOrder: 0,
			color: '',
			descriptionDE: '',
			descriptionEN: '',
			isActive: true
		};
	}

	function getDefaultTopicForm() {
		return {
			id: '',
			slug: '',
			categoryId: '',
			order: 0,
			estimatedMinutes: '',
			difficulty: '',
			level: '',
			summaryDE: '',
			summaryEN: '',
			isActive: true,
			isFeatured: false
		};
	}

	function getDefaultVersionForm() {
		return {
			id: '',
			versionLabel: '',
			titleDE: '',
			titleEN: '',
			language: 'de',
			descriptionDE: '',
			descriptionEN: '',
			status: 'draft',
			contentText: '',
			notes: ''
		};
	}

	onMount(async () => {
		await loadCategories();
		await loadTopics();
		loading = false;
	});

	async function loadCategories() {
		try {
			const { categories: rows } = await learnApi.listCategories();
			categories = rows;
		} catch (err) {
			handleError(err);
		}
	}

	async function loadTopics() {
		try {
			const { topics: rows } = await learnApi.listTopics({ includeInactive: true, includeVersions: true });
			topics = rows;
			if (selectedTopic) {
				const updated = rows.find((topic) => topic.id === selectedTopic?.id);
				if (updated) {
					selectedTopic = updated;
				} else {
					selectedTopic = null;
					selectedVersion = null;
				}
			}
		} catch (err) {
			handleError(err);
		}
	}

	async function selectTopic(id: string) {
		try {
			const result = await learnApi.getTopic(id);
			selectedTopic = result.topic;
			versionForm = getDefaultVersionForm();
			selectedVersion = null;
		} catch (err) {
			handleError(err);
		}
	}

	function handleError(err: unknown) {
		error = err instanceof Error ? err.message : 'Unexpected error';
		setTimeout(() => (error = ''), 5000);
	}

	function editCategory(category: LearnCategory) {
		categoryForm = {
			id: category.id,
			nameDE: category.nameDE,
			nameEN: category.nameEN ?? '',
			slug: category.slug,
			sortOrder: category.sortOrder ?? 0,
			color: category.color ?? '',
			descriptionDE: category.descriptionDE ?? '',
			descriptionEN: category.descriptionEN ?? '',
			isActive: category.isActive
		};
	}

	function resetCategory() {
		categoryForm = getDefaultCategoryForm();
	}

	async function saveCategory() {
		const payload: CategoryPayload = {
			nameDE: categoryForm.nameDE.trim(),
			nameEN: categoryForm.nameEN?.trim() || null,
			slug: categoryForm.slug?.trim() || undefined,
			sortOrder: Number(categoryForm.sortOrder) || 0,
			color: categoryForm.color?.trim() || null,
			descriptionDE: categoryForm.descriptionDE?.trim() || null,
			descriptionEN: categoryForm.descriptionEN?.trim() || null,
			isActive: categoryForm.isActive
		};

		try {
			if (categoryForm.id) {
				await learnApi.updateCategory(categoryForm.id, payload);
			} else {
				await learnApi.createCategory(payload);
			}
			await loadCategories();
			resetCategory();
		} catch (err) {
			handleError(err);
		}
	}

	async function deleteCategory(id: string) {
		if (!confirm('Delete this category? Topics will remain but lose their reference.')) return;
		try {
			await learnApi.deleteCategory(id);
			await loadCategories();
			await loadTopics();
		} catch (err) {
			handleError(err);
		}
	}

	function editTopic(topic: LearnTopic) {
		topicForm = {
			id: topic.id,
			slug: topic.slug,
			categoryId: topic.categoryId || '',
			order: topic.order ?? 0,
			estimatedMinutes: topic.estimatedMinutes?.toString() ?? '',
			difficulty: topic.difficulty ?? '',
			level: topic.level ?? '',
			summaryDE: topic.summaryDE ?? '',
			summaryEN: topic.summaryEN ?? '',
			isActive: topic.isActive,
			isFeatured: topic.isFeatured
		};
	}

	function resetTopic() {
		topicForm = getDefaultTopicForm();
	}

	async function saveTopic() {
		const payload: TopicPayload = {
			slug: topicForm.slug.trim(),
			categoryId: topicForm.categoryId || null,
			order: Number(topicForm.order) || 0,
			estimatedMinutes: topicForm.estimatedMinutes ? Number(topicForm.estimatedMinutes) : null,
			difficulty: topicForm.difficulty?.trim() || null,
			level: topicForm.level?.trim() || null,
			summaryDE: topicForm.summaryDE?.trim() || null,
			summaryEN: topicForm.summaryEN?.trim() || null,
			isActive: topicForm.isActive,
			isFeatured: topicForm.isFeatured
		};

		try {
			if (topicForm.id) {
				await learnApi.updateTopic(topicForm.id, payload);
			} else {
				await learnApi.createTopic(payload);
			}
			await loadTopics();
			resetTopic();
		} catch (err) {
			handleError(err);
		}
	}

	async function deleteTopic(id: string) {
		if (!confirm('Delete this topic and all versions? This action cannot be undone.')) return;
		try {
			await learnApi.deleteTopic(id);
			await loadTopics();
			if (selectedTopic?.id === id) {
				selectedTopic = null;
				selectedVersion = null;
			}
		} catch (err) {
			handleError(err);
		}
	}

	function editVersion(version: LearnTopicVersion) {
		selectedVersion = version;
		versionForm = {
			id: version.id,
			versionLabel: version.versionLabel ?? '',
			titleDE: version.titleDE,
			titleEN: version.titleEN ?? '',
			language: version.language ?? 'de',
			descriptionDE: version.descriptionDE ?? '',
			descriptionEN: version.descriptionEN ?? '',
			status: version.status ?? 'draft',
			contentText: JSON.stringify(version.content ?? [], null, 2),
			notes: version.notes ?? ''
		};
	}

	function resetVersionForm() {
		versionForm = getDefaultVersionForm();
		selectedVersion = null;
	}

	async function saveVersion() {
		if (!selectedTopic) {
			handleError(new Error('Select a topic before creating versions.'));
			return;
		}

		let parsedContent: unknown = [];
		if (versionForm.contentText.trim()) {
			try {
				parsedContent = JSON.parse(versionForm.contentText);
			} catch {
				handleError(new Error('Content must be valid JSON.'));
				return;
			}
		}

		const payload: VersionPayload = {
			versionLabel: versionForm.versionLabel?.trim() || null,
			titleDE: versionForm.titleDE.trim(),
			titleEN: versionForm.titleEN?.trim() || null,
			language: versionForm.language,
			descriptionDE: versionForm.descriptionDE?.trim() || null,
			descriptionEN: versionForm.descriptionEN?.trim() || null,
			status: versionForm.status,
			content: parsedContent,
			notes: versionForm.notes?.trim() || null,
			isPublished: versionForm.status === 'published'
		};

		try {
			if (versionForm.id) {
				await learnApi.updateVersion(versionForm.id, payload);
			} else {
				await learnApi.createVersion(selectedTopic.id, payload);
			}
			await selectTopic(selectedTopic.id);
			resetVersionForm();
		} catch (err) {
			handleError(err);
		}
	}

	async function deleteVersion(id: string) {
		if (!selectedTopic) return;
		if (!confirm('Delete this version?')) return;
		try {
			await learnApi.deleteVersion(id);
			await selectTopic(selectedTopic.id);
			await loadTopics();
		} catch (err) {
			handleError(err);
		}
	}

	async function markAsCurrent(versionId: string) {
		if (!selectedTopic) return;
		try {
			await learnApi.setCurrentVersion(selectedTopic.id, versionId);
			await selectTopic(selectedTopic.id);
			await loadTopics();
		} catch (err) {
			handleError(err);
		}
	}
</script>

<main class="min-h-screen bg-slate-50 text-slate-900">
	<header class="bg-white border-b border-slate-200">
		<div class="max-w-6xl mx-auto px-6 py-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
			<div>
				<p class="text-xs uppercase tracking-wide text-slate-400">Operations</p>
				<h1 class="text-2xl font-semibold">Learn Content Manager</h1>
				<p class="text-sm text-slate-500">Manage categories, topics, and learning versions.</p>
			</div>
			<nav class="flex gap-4 text-sm">
				<a href="/" class="text-blue-600 hover:underline">Knowledge Base</a>
				<a href="/learn.html" class="text-slate-900 font-semibold">Learn CMS</a>
			</nav>
		</div>
	</header>

	{#if error}
		<div class="max-w-6xl mx-auto px-6 pt-4">
			<div class="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg">{error}</div>
		</div>
	{/if}

	<div class="max-w-6xl mx-auto px-6 py-8 space-y-10">
		<section class="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
			<div class="flex justify-between items-center mb-6">
				<div>
					<h2 class="text-lg font-semibold">Categories</h2>
					<p class="text-sm text-slate-500">Color-coded groups for learn topics.</p>
				</div>
				<button class="text-sm text-blue-600 hover:underline" on:click={resetCategory}>New Category</button>
			</div>
			<form class="grid md:grid-cols-[320px_auto] gap-6" on:submit|preventDefault={saveCategory}>
				<div class="space-y-4">
					<input type="hidden" bind:value={categoryForm.id} />
					<div>
						<label class="block text-sm font-medium text-slate-700 mb-1">Name (DE) *</label>
						<input bind:value={categoryForm.nameDE} required class="w-full border px-3 py-2 rounded-lg" />
					</div>
					<div>
						<label class="block text-sm font-medium text-slate-700 mb-1">Name (EN)</label>
						<input bind:value={categoryForm.nameEN} class="w-full border px-3 py-2 rounded-lg" />
					</div>
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label class="block text-sm font-medium text-slate-700 mb-1">Slug</label>
							<input bind:value={categoryForm.slug} class="w-full border px-3 py-2 rounded-lg" placeholder="auto-generated" />
						</div>
						<div>
							<label class="block text-sm font-medium text-slate-700 mb-1">Order</label>
							<input type="number" bind:value={categoryForm.sortOrder} class="w-full border px-3 py-2 rounded-lg" />
						</div>
					</div>
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label class="block text-sm font-medium text-slate-700 mb-1">Color</label>
							<input bind:value={categoryForm.color} class="w-full border px-3 py-2 rounded-lg" placeholder="#16a34a" />
						</div>
						<div class="flex items-center gap-2">
							<input type="checkbox" bind:checked={categoryForm.isActive} class="rounded border-slate-300" />
							<label class="text-sm text-slate-700">Active</label>
						</div>
					</div>
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label class="block text-sm font-medium text-slate-700 mb-1">Description (DE)</label>
							<textarea bind:value={categoryForm.descriptionDE} rows="3" class="w-full border px-3 py-2 rounded-lg"></textarea>
						</div>
						<div>
							<label class="block text-sm font-medium text-slate-700 mb-1">Description (EN)</label>
							<textarea bind:value={categoryForm.descriptionEN} rows="3" class="w-full border px-3 py-2 rounded-lg"></textarea>
						</div>
					</div>
					<div class="flex gap-3">
						<button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg">Save Category</button>
						<button type="button" class="px-4 py-2 border rounded-lg text-slate-600" on:click={resetCategory}>Cancel</button>
					</div>
				</div>
				<div class="overflow-x-auto border rounded-xl">
					<table class="min-w-full divide-y divide-slate-100 text-sm">
						<thead class="bg-slate-50 text-xs uppercase text-slate-500">
							<tr>
								<th class="px-4 py-3 text-left">Name</th>
								<th class="px-4 py-3 text-left">Slug</th>
								<th class="px-4 py-3 text-left">Order</th>
								<th class="px-4 py-3 text-center">Active</th>
								<th class="px-4 py-3 text-right">Actions</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-100">
							{#if categories.length === 0}
								<tr><td colspan="5" class="px-4 py-4 text-center text-slate-400">No categories found.</td></tr>
							{:else}
								{#each categories.slice().sort((a, b) => a.sortOrder - b.sortOrder) as category}
									<tr>
										<td class="px-4 py-3">
											<div class="font-medium">{category.nameDE}</div>
											{#if category.nameEN}
												<div class="text-xs text-slate-500">{category.nameEN}</div>
											{/if}
										</td>
										<td class="px-4 py-3 text-sm text-slate-500">{category.slug}</td>
										<td class="px-4 py-3 text-sm">{category.sortOrder ?? 0}</td>
										<td class="px-4 py-3 text-center">
											<span class={`px-2 py-1 rounded-full text-xs ${category.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
												{category.isActive ? 'Active' : 'Hidden'}
											</span>
										</td>
										<td class="px-4 py-3 text-right text-sm space-x-3">
											<button class="text-blue-600 hover:underline" type="button" on:click={() => editCategory(category)}>Edit</button>
											<button class="text-rose-600 hover:underline" type="button" on:click={() => deleteCategory(category.id)}>Delete</button>
										</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					</table>
				</div>
			</form>
		</section>

		<section class="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
			<div class="flex justify-between items-center mb-6">
				<div>
					<h2 class="text-lg font-semibold">Topics</h2>
					<p class="text-sm text-slate-500">Each topic belongs to a category and references a current version.</p>
				</div>
				<button class="text-sm text-blue-600 hover:underline" on:click={resetTopic}>New Topic</button>
			</div>
			<form class="grid md:grid-cols-[320px_auto] gap-6" on:submit|preventDefault={saveTopic}>
				<div class="space-y-4">
					<input type="hidden" bind:value={topicForm.id} />
					<div>
						<label class="block text-sm font-medium text-slate-700 mb-1">Slug *</label>
						<input bind:value={topicForm.slug} required class="w-full border px-3 py-2 rounded-lg" />
					</div>
					<div>
						<label class="block text-sm font-medium text-slate-700 mb-1">Category</label>
						<select bind:value={topicForm.categoryId} class="w-full border px-3 py-2 rounded-lg">
							<option value="">No category</option>
							{#each categories as category}
								<option value={category.id}>{category.nameDE} ({category.slug})</option>
							{/each}
						</select>
					</div>
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label class="block text-sm font-medium text-slate-700 mb-1">Order</label>
							<input type="number" bind:value={topicForm.order} class="w-full border px-3 py-2 rounded-lg" />
						</div>
						<div>
							<label class="block text-sm font-medium text-slate-700 mb-1">Duration (min)</label>
							<input type="number" min="0" bind:value={topicForm.estimatedMinutes} class="w-full border px-3 py-2 rounded-lg" />
						</div>
					</div>
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label class="block text-sm font-medium text-slate-700 mb-1">Difficulty</label>
							<input bind:value={topicForm.difficulty} class="w-full border px-3 py-2 rounded-lg" />
						</div>
						<div>
							<label class="block text-sm font-medium text-slate-700 mb-1">Level</label>
							<input bind:value={topicForm.level} class="w-full border px-3 py-2 rounded-lg" />
						</div>
					</div>
					<div>
						<label class="block text-sm font-medium text-slate-700 mb-1">Summary (DE)</label>
						<textarea bind:value={topicForm.summaryDE} rows="3" class="w-full border px-3 py-2 rounded-lg"></textarea>
					</div>
					<div>
						<label class="block text-sm font-medium text-slate-700 mb-1">Summary (EN)</label>
						<textarea bind:value={topicForm.summaryEN} rows="3" class="w-full border px-3 py-2 rounded-lg"></textarea>
					</div>
					<div class="flex items-center gap-4">
						<label class="flex items-center gap-2 text-sm text-slate-700">
							<input type="checkbox" bind:checked={topicForm.isActive} class="rounded border-slate-300" />
							Active
						</label>
						<label class="flex items-center gap-2 text-sm text-slate-700">
							<input type="checkbox" bind:checked={topicForm.isFeatured} class="rounded border-slate-300" />
							Featured
						</label>
					</div>
					<div class="flex gap-3">
						<button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg">Save Topic</button>
						<button type="button" class="px-4 py-2 border rounded-lg text-slate-600" on:click={resetTopic}>Cancel</button>
					</div>
				</div>
				<div class="overflow-x-auto border rounded-xl">
					<table class="min-w-full divide-y divide-slate-100 text-sm">
						<thead class="bg-slate-50 text-xs uppercase text-slate-500">
							<tr>
								<th class="px-4 py-3 text-left">Slug</th>
								<th class="px-4 py-3 text-left">Category</th>
								<th class="px-4 py-3 text-left">Duration</th>
								<th class="px-4 py-3 text-left">Difficulty</th>
								<th class="px-4 py-3 text-center">Active</th>
								<th class="px-4 py-3 text-right">Actions</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-100">
							{#if topics.length === 0}
								<tr><td colspan="6" class="px-4 py-4 text-center text-slate-400">No topics yet.</td></tr>
							{:else}
								{#each topics.slice().sort((a, b) => a.order - b.order) as topic}
									<tr>
										<td class="px-4 py-3">
											<div class="font-medium">{topic.slug}</div>
											{#if topic.summaryDE}
												<div class="text-xs text-slate-500 line-clamp-2">{topic.summaryDE}</div>
											{/if}
										</td>
										<td class="px-4 py-3 text-sm text-slate-500">{topic.category?.nameDE ?? '—'}</td>
										<td class="px-4 py-3 text-sm">{topic.estimatedMinutes ?? '—'}</td>
										<td class="px-4 py-3 text-sm">{topic.difficulty ?? '—'}</td>
										<td class="px-4 py-3 text-center">
											<span class={`px-2 py-1 rounded-full text-xs ${topic.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
												{topic.isActive ? 'Active' : 'Hidden'}
											</span>
										</td>
										<td class="px-4 py-3 text-right text-sm space-x-3">
											<button class="text-blue-600 hover:underline" type="button" on:click={() => editTopic(topic)}>Edit</button>
											<button class="text-amber-600 hover:underline" type="button" on:click={() => selectTopic(topic.id)}>Versions</button>
											<button class="text-rose-600 hover:underline" type="button" on:click={() => deleteTopic(topic.id)}>Delete</button>
										</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					</table>
				</div>
			</form>
		</section>

		<section class="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
			<div class="flex flex-col gap-4">
				<div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
					<div>
						<h2 class="text-lg font-semibold">Topic Versions</h2>
						<p class="text-sm text-slate-500">Create iterations and publish when ready.</p>
					</div>
					<div class="flex gap-3">
						<select class="border px-3 py-2 rounded-lg min-w-64" on:change={(e) => selectTopic((e.target as HTMLSelectElement).value)}>
							<option value="">Select topic…</option>
							{#each topics.slice().sort((a, b) => a.order - b.order) as topic}
								<option value={topic.id} selected={selectedTopic?.id === topic.id}>{topic.slug}</option>
							{/each}
						</select>
						<button class="text-sm text-blue-600 hover:underline" on:click={resetVersionForm}>New Version</button>
					</div>
				</div>

				<form class="grid md:grid-cols-2 gap-6" on:submit|preventDefault={saveVersion}>
					<div class="space-y-4">
						<input type="hidden" bind:value={versionForm.id} />
						<div>
							<label class="block text-sm font-medium text-slate-700 mb-1">Version Label</label>
							<input bind:value={versionForm.versionLabel} class="w-full border px-3 py-2 rounded-lg" />
						</div>
						<div class="grid grid-cols-2 gap-4">
							<div>
								<label class="block text-sm font-medium text-slate-700 mb-1">Title (DE) *</label>
								<input bind:value={versionForm.titleDE} required class="w-full border px-3 py-2 rounded-lg" />
							</div>
							<div>
								<label class="block text-sm font-medium text-slate-700 mb-1">Title (EN)</label>
								<input bind:value={versionForm.titleEN} class="w-full border px-3 py-2 rounded-lg" />
							</div>
						</div>
						<div class="grid grid-cols-2 gap-4">
							<div>
								<label class="block text-sm font-medium text-slate-700 mb-1">Language</label>
								<select bind:value={versionForm.language} class="w-full border px-3 py-2 rounded-lg">
									<option value="de">German (de)</option>
									<option value="en">English (en)</option>
								</select>
							</div>
							<div>
								<label class="block text-sm font-medium text-slate-700 mb-1">Status</label>
								<select bind:value={versionForm.status} class="w-full border px-3 py-2 rounded-lg">
									<option value="draft">Draft</option>
									<option value="review">Review</option>
									<option value="published">Published</option>
								</select>
							</div>
						</div>
						<div class="grid grid-cols-2 gap-4">
							<div>
								<label class="block text-sm font-medium text-slate-700 mb-1">Description (DE)</label>
								<textarea bind:value={versionForm.descriptionDE} rows="3" class="w-full border px-3 py-2 rounded-lg"></textarea>
							</div>
							<div>
								<label class="block text-sm font-medium text-slate-700 mb-1">Description (EN)</label>
								<textarea bind:value={versionForm.descriptionEN} rows="3" class="w-full border px-3 py-2 rounded-lg"></textarea>
							</div>
						</div>
					</div>
					<div class="space-y-4">
						<div>
							<label class="block text-sm font-medium text-slate-700 mb-1">Content JSON</label>
							<textarea
								bind:value={versionForm.contentText}
								rows="10"
								class="w-full border px-3 py-2 rounded-lg font-mono text-xs"
								placeholder='[{"type":"text","content":"..."}]'
							></textarea>
							<p class="text-xs text-slate-500 mt-1">Paste simplified block definitions (JSON).</p>
						</div>
						<div>
							<label class="block text-sm font-medium text-slate-700 mb-1">Notes</label>
							<textarea bind:value={versionForm.notes} rows="3" class="w-full border px-3 py-2 rounded-lg"></textarea>
						</div>
						<div class="flex flex-wrap gap-3">
							<button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg">Save Version</button>
							<button type="button" class="px-4 py-2 border rounded-lg text-slate-600" on:click={resetVersionForm}>Cancel</button>
							{#if selectedVersion}
								<button type="button" class="px-4 py-2 border border-emerald-500 text-emerald-600 rounded-lg" on:click={() => markAsCurrent(selectedVersion.id)}>
									Set as Current
								</button>
								<button type="button" class="px-4 py-2 border border-rose-500 text-rose-600 rounded-lg" on:click={() => deleteVersion(selectedVersion.id)}>
									Delete
								</button>
							{/if}
						</div>
					</div>
				</form>

				<div class="overflow-x-auto border rounded-xl">
					<table class="min-w-full divide-y divide-slate-100 text-sm">
						<thead class="bg-slate-50 text-xs uppercase text-slate-500">
							<tr>
								<th class="px-4 py-3 text-left">Label</th>
								<th class="px-4 py-3 text-left">Language</th>
								<th class="px-4 py-3 text-left">Status</th>
								<th class="px-4 py-3 text-left">Updated</th>
								<th class="px-4 py-3 text-right">Actions</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-100">
							{#if !selectedTopic}
								<tr><td colspan="5" class="px-4 py-4 text-center text-slate-400">Select a topic to view versions.</td></tr>
							{:else if !selectedTopic.versions || selectedTopic.versions.length === 0}
								<tr><td colspan="5" class="px-4 py-4 text-center text-slate-400">No versions for this topic.</td></tr>
							{:else}
								{#each selectedTopic.versions as version}
									<tr>
										<td class="px-4 py-3">
											<div class="font-medium">{version.versionLabel || version.titleDE}</div>
											<div class="text-xs text-slate-500">{version.isPublished ? 'Published' : 'Draft'}</div>
										</td>
										<td class="px-4 py-3 text-sm">{version.language?.toUpperCase()}</td>
										<td class="px-4 py-3 text-sm">{version.status}</td>
										<td class="px-4 py-3 text-sm text-slate-500">{new Date(version.updated).toLocaleDateString()}</td>
										<td class="px-4 py-3 text-right text-sm space-x-3">
											<button class="text-blue-600 hover:underline" type="button" on:click={() => editVersion(version)}>Edit</button>
											{#if selectedTopic.currentVersionId === version.id}
												<span class="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">Current</span>
											{:else}
												<button class="text-emerald-600 hover:underline" type="button" on:click={() => markAsCurrent(version.id)}>Set current</button>
											{/if}
											<button class="text-rose-600 hover:underline" type="button" on:click={() => deleteVersion(version.id)}>Delete</button>
										</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					</table>
				</div>
			</div>
		</section>
	</div>
</main>

