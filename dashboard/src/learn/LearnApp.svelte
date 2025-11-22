<script lang="ts">
	import { onMount } from 'svelte';
	import {
		learnApi,
		type LearnCategory,
		type LearnTopic,
		type LearnTopicVersion,
		type TopicPayload,
		type VersionPayload
	} from '../lib/api';
	import LearnEditor from '../lib/components/learn/LearnEditor.svelte';
	import type { ContentBlock } from '../lib/schema';

	let categories: LearnCategory[] = [];
	let topics: LearnTopic[] = [];
let editingTopic: (LearnTopic & { versions?: LearnTopicVersion[] }) | null = null;
let previewVersionData: LearnTopicVersion | null = null;
let currentStep = 0;
let error = '';
let loading = true;
let topicForm = {
	id: '',
	slug: '',
	categoryId: '',
	order: 0,
	estimatedMinutes: '',
	difficulty: '',
	level: '',
	summaryDE: '',
	summaryEN: '',
	isActive: false,
	isFeatured: false,
	currentVersionId: ''
};

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
		} catch (err) {
			handleError(err);
		}
	}

	function handleError(err: unknown) {
		error = err instanceof Error ? err.message : 'Unexpected error';
		setTimeout(() => (error = ''), 5000);
	}

	async function editTopic(topic: LearnTopic) {
		try {
			const result = await learnApi.getTopic(topic.id);
			editingTopic = result.topic;
			previewVersionData = null;
			topicForm = {
				id: result.topic.id,
				slug: result.topic.slug,
				categoryId: result.topic.categoryId || '',
				order: result.topic.order ?? 0,
				estimatedMinutes: result.topic.estimatedMinutes?.toString() ?? '',
				difficulty: result.topic.difficulty ?? '',
				level: result.topic.level ?? '',
				summaryDE: result.topic.summaryDE ?? '',
				summaryEN: result.topic.summaryEN ?? '',
				isActive: result.topic.isActive,
				isFeatured: result.topic.isFeatured,
				currentVersionId: result.topic.currentVersionId || ''
			};
		} catch (err) {
			handleError(err);
		}
	}

	function handleVersionDataChange(versionData: LearnTopicVersion | null) {
		previewVersionData = versionData;
	}

	function handleBlockClick(blockIndex: number) {
		// Calculate step for block index
		if (!previewVersionData?.content) return;
		const content = previewVersionData.content;
		let step = 1;
		for (let i = 0; i < blockIndex && i < content.length; i++) {
			const block = content[i];
			if (block.type === 'aiQuestion') {
				step += 2;
			} else if (block.type === 'feelingsDetective') {
				step += 5;
			} else {
				step += 1;
			}
		}
		currentStep = step;
	}

	function cancelEdit() {
		editingTopic = null;
		previewVersionData = null;
		currentStep = 0;
	}
</script>

<main class="min-h-screen bg-slate-50 text-slate-900">
	<header class="bg-white border-b border-slate-200">
		<div class="max-w-6xl mx-auto px-6 py-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
			<div>
				<p class="text-xs uppercase tracking-wide text-slate-400">Operations</p>
				<h1 class="text-2xl font-semibold">Learn Content Manager</h1>
				<p class="text-sm text-slate-500">Manage learn content entries.</p>
			</div>
			<nav class="flex gap-4 text-sm">
				<a href="/" class="text-blue-600 hover:underline">Knowledge Base</a>
			</nav>
		</div>
	</header>

	{#if error}
		<div class="max-w-6xl mx-auto px-6 pt-4">
			<div class="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg">{error}</div>
		</div>
	{/if}

	<div class="max-w-6xl mx-auto px-6 py-8">
		{#if loading}
			<div class="text-center py-12 text-slate-500">Loading...</div>
		{:else if editingTopic}
			<!-- Split-Pane Edit View -->
			<div class="h-[calc(100vh-200px)] flex gap-4">
				<!-- Left: Preview -->
				<div class="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
					<div class="p-4 border-b flex items-center justify-between">
						<div>
							<h2 class="text-lg font-semibold">Preview</h2>
							<p class="text-sm text-slate-500">{editingTopic.slug}</p>
						</div>
						<button class="text-sm text-slate-600 hover:underline" on:click={cancelEdit}>← Back to List</button>
					</div>
					<div class="flex-1 overflow-y-auto p-6">
						{#if previewVersionData}
							<div class="max-w-2xl mx-auto space-y-6">
								<h1 class="text-2xl font-bold">{previewVersionData.titleDE}</h1>
								{#if previewVersionData.descriptionDE}
									<p class="text-slate-600">{previewVersionData.descriptionDE}</p>
								{/if}
								{#if previewVersionData.content}
									{#each previewVersionData.content as block, index}
										<div class="border-l-4 border-blue-500 pl-4 py-2">
											{#if block.type === 'text'}
												<div class="prose">
													{@html block.content?.replace(/\n/g, '<br>') || ''}
												</div>
												{#if block.ctaText}
													<button class="mt-2 px-4 py-2 bg-blue-600 text-white rounded">{block.ctaText}</button>
												{/if}
											{:else if block.type === 'breathe'}
												<div class="text-slate-500 italic">Breathe exercise ({block.duration || 60}s)</div>
											{:else if block.type === 'aiQuestion'}
												<div>
													<p class="font-medium">{block.question}</p>
													<input type="text" placeholder={block.placeholder || 'Write your answer...'} class="mt-2 w-full border px-3 py-2 rounded" />
												</div>
											{:else if block.type === 'audio'}
												<div>
													{#if block.title}
														<p class="font-medium">{block.title}</p>
													{/if}
													{#if block.content}
														<p class="text-sm text-slate-600">{block.content}</p>
													{/if}
													{#if block.src}
														<audio controls class="mt-2 w-full">
															<source src={block.src} />
														</audio>
													{/if}
												</div>
											{:else if block.type === 'bodymap'}
												<div class="text-slate-500 italic">Body Map</div>
											{:else if block.type === 'feelingsDetective'}
												<div>
													<p class="font-medium">{block.question || 'Describe a situation you experienced:'}</p>
													<textarea class="mt-2 w-full border px-3 py-2 rounded" rows="3"></textarea>
												</div>
											{/if}
										</div>
									{/each}
								{/if}
							</div>
						{:else}
							<div class="text-center py-12 text-slate-400">
								Select a version to see preview
							</div>
						{/if}
					</div>
				</div>

				<!-- Right: Editor -->
				<div class="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
					<LearnEditor 
						topicId={editingTopic.id}
						currentVersionId={editingTopic.currentVersionId || ''}
						onVersionDataChange={handleVersionDataChange}
						onBlockClick={handleBlockClick}
					/>
				</div>
			</div>
		{:else}
			<!-- List View -->
			<section class="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
				<div class="mb-6">
					<h2 class="text-lg font-semibold">Learn Content Entries</h2>
					<p class="text-sm text-slate-500">Click edit to modify an entry.</p>
				</div>
				<div class="overflow-x-auto border rounded-xl">
					<table class="min-w-full divide-y divide-slate-100 text-sm">
						<thead class="bg-slate-50 text-xs uppercase text-slate-500">
							<tr>
								<th class="px-4 py-3 text-left">Slug</th>
								<th class="px-4 py-3 text-left">Category</th>
								<th class="px-4 py-3 text-left">Current Version</th>
								<th class="px-4 py-3 text-center">Status</th>
								<th class="px-4 py-3 text-right">Actions</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-100">
							{#if topics.length === 0}
								<tr><td colspan="5" class="px-4 py-4 text-center text-slate-400">No topics found.</td></tr>
							{:else}
								{#each topics.slice().sort((a, b) => a.order - b.order) as topic}
									<tr>
										<td class="px-4 py-3">
											<button class="font-medium text-blue-600 hover:underline" type="button" on:click={() => editTopic(topic)}>
												{topic.slug}
											</button>
											{#if topic.summaryDE}
												<div class="text-xs text-slate-500 line-clamp-2 mt-1">{topic.summaryDE}</div>
											{/if}
										</td>
										<td class="px-4 py-3 text-sm text-slate-500">{topic.category?.nameDE ?? '—'}</td>
										<td class="px-4 py-3 text-sm">
											{#if topic.currentVersionId}
												<span class="text-slate-600">Version set</span>
											{:else}
												<span class="text-slate-400">None</span>
											{/if}
										</td>
										<td class="px-4 py-3 text-center">
											<span class={`px-2 py-1 rounded-full text-xs ${topic.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
												{topic.isActive ? 'Active' : 'Hidden'}
											</span>
										</td>
										<td class="px-4 py-3 text-right">
											<button class="text-blue-600 hover:underline" type="button" on:click={() => editTopic(topic)}>Edit</button>
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
