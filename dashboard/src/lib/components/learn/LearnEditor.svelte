<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { learnApi, type LearnTopicVersion } from '../../api';
	import type { ContentBlock } from '../../schema';
	import ContentBlockListEditor from './ContentBlockListEditor.svelte';

export let topicId: string;
export let currentVersionId: string;
export let onVersionDataChange: ((versionData: LearnTopicVersion | null) => void) | undefined;
export let onBlockClick: ((blockIndex: number) => void) | undefined;

	let liveVersionId: string = '';
	let allVersions: LearnTopicVersion[] = [];
	let selectedVersionId: string = '';
	let saveStatus: 'idle' | 'saving' | 'success' | 'error' = 'idle';

	let versionForm = {
		titleDE: '',
		titleEN: '',
		descriptionDE: '',
		descriptionEN: '',
		categoryId: '',
		image: '',
		content: [] as ContentBlock[]
	};

let currentVersion: LearnTopicVersion | undefined;
$: currentVersion = allVersions.find((version) => version.id === selectedVersionId);
let generalSettingsOpen = false;

	// Update form data when currentVersion changes
	$: if (currentVersion) {
		versionForm = {
			titleDE: currentVersion.titleDE || '',
			titleEN: currentVersion.titleEN || '',
			descriptionDE: currentVersion.descriptionDE || '',
			descriptionEN: currentVersion.descriptionEN || '',
			categoryId: currentVersion.categoryId || '',
			image: currentVersion.image || '',
			content: Array.isArray(currentVersion.content) ? [...currentVersion.content] : []
		};

		// Notify parent about version data change
		onVersionDataChange?.(currentVersion);
	}

	// Content change handler
	const handleContentChange = (newContent: ContentBlock[]) => {
		versionForm.content = newContent;
		
		// Update the preview immediately when content changes
		if (currentVersion) {
			const updatedVersion = {
				...currentVersion,
				content: newContent
			};
			onVersionDataChange?.(updatedVersion as LearnTopicVersion);
		}
	};

	// Watch for form data changes and update preview (for real-time editing)
	$: if (currentVersion && versionForm) {
		const updatedVersion = {
			...currentVersion,
			titleDE: versionForm.titleDE || currentVersion.titleDE,
			titleEN: versionForm.titleEN || currentVersion.titleEN,
			descriptionDE: versionForm.descriptionDE || currentVersion.descriptionDE,
			descriptionEN: versionForm.descriptionEN || currentVersion.descriptionEN,
			categoryId: versionForm.categoryId || currentVersion.categoryId,
			image: versionForm.image || currentVersion.image,
			content: versionForm.content || currentVersion.content || []
		};
		onVersionDataChange?.(updatedVersion as LearnTopicVersion);
	}

	// Version selection handler
	const handleVersionSelect = (versionId: string) => {
		selectedVersionId = versionId;
	};

	function handleVersionDropdownChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		if (target.value) {
			handleVersionSelect(target.value);
		}
	}

	// Create new version handler
	const handleCreateNewVersion = async () => {
		try {
			const result = await learnApi.createVersion(topicId, {
				titleDE: 'New Version',
				titleEN: 'New Version',
				descriptionDE: '',
				descriptionEN: '',
				language: 'de',
				content: [],
				status: 'draft'
			}) as any;

			// Reload versions and select the new one
			await getVersions();
			if (result?.version?.id) {
				selectedVersionId = result.version.id;
			}
		} catch (error: any) {
			console.error('Error creating new version:', error);
		}
	};

	// Delete version handler
	const handleDeleteVersion = async (versionId: string) => {
		if (!confirm('Delete this version? This action cannot be undone.')) return;
		try {
			await learnApi.deleteVersion(versionId);
			await getVersions();
			
			// If we deleted the current version, select another one
			if (selectedVersionId === versionId) {
				if (allVersions.length > 0) {
					selectedVersionId = allVersions[0].id;
				} else {
					selectedVersionId = '';
				}
			}
		} catch (error: any) {
			console.error('Error deleting version:', error);
			alert('Failed to delete version. Please try again.');
		}
	};

	// Set version as live handler
	const handleSetAsLive = async (versionId: string) => {
		try {
			await learnApi.setCurrentVersion(topicId, versionId);
			liveVersionId = versionId;
			console.log('Version set as live:', versionId);
		} catch (error: any) {
			console.error('Error setting version as live:', error);
			alert('Failed to set version as live. Please try again.');
		}
	};

	const getLiveVersionId = async () => {
		try {
			if (!topicId) return;
			const result = await learnApi.getTopic(topicId);
			liveVersionId = result.topic.currentVersionId || '';
			// Also update selectedVersionId if currentVersionId prop is provided
			if (currentVersionId) {
				selectedVersionId = currentVersionId;
			}
		} catch (error) {
			console.error('Error getting live version:', error);
		}
	};

	const getVersions = async () => {
		try {
			if (!topicId) return;
			
			const result = await learnApi.getTopic(topicId);
			const versions = result.topic.versions || [];
			allVersions = versions;
			
			if (versions.length === 0) {
				console.error('No versions found for topic:', topicId);
				return;
			}
			
			// First priority: use currentVersionId prop if provided
			if (currentVersionId && versions.find(v => v.id === currentVersionId)) {
				selectedVersionId = currentVersionId;
			} else if (liveVersionId && versions.find(v => v.id === liveVersionId)) {
				// Second priority: use the live version if it exists
				selectedVersionId = liveVersionId;
			} else {
				// Third priority: use the most recent version
				selectedVersionId = versions[0]?.id || '';
			}
		} catch (error) {
			console.error('Error getting versions:', error);
		}
	};

	const handleSave = async () => {
		if (!selectedVersionId) {
			alert('No version selected');
			return;
		}

		saveStatus = 'saving';

		try {
			await learnApi.updateVersion(selectedVersionId, {
				titleDE: versionForm.titleDE,
				titleEN: versionForm.titleEN || null,
				descriptionDE: versionForm.descriptionDE || null,
				descriptionEN: versionForm.descriptionEN || null,
				content: versionForm.content,
				status: currentVersion?.status || 'draft'
			});
			
			// Reload versions to get updated data
			await getVersions();
			
			saveStatus = 'success';
			setTimeout(() => {
				saveStatus = 'idle';
			}, 2000);
		} catch (error: any) {
			console.error('Error saving version:', error);
			saveStatus = 'error';
			setTimeout(() => {
				saveStatus = 'idle';
			}, 3000);
		}
	};

	// Handle keyboard shortcuts
	const handleKeyDown = (event: KeyboardEvent) => {
		const target = event.target as HTMLElement;
		if (target.tagName === 'INPUT' || 
		    target.tagName === 'TEXTAREA' || 
		    target.contentEditable === 'true') {
			return;
		}
		
		// Ctrl+S or Cmd+S to save
		if ((event.ctrlKey || event.metaKey) && event.key === 's') {
			event.preventDefault();
			if (saveStatus === 'idle') {
				handleSave();
			}
		}
	};

	onMount(async () => {
		await getLiveVersionId();
		await getVersions();
		document.addEventListener('keydown', handleKeyDown);
	});

	onDestroy(() => {
		document.removeEventListener('keydown', handleKeyDown);
	});
</script>

<div class="h-full flex flex-col bg-white">
	<!-- Header -->
	<div class="flex items-center justify-between gap-4 px-4 py-3 border-b">
		<div class="flex items-center gap-2">
			<span class="text-sm">Version</span>
			<select 
				bind:value={selectedVersionId}
				on:change={handleVersionDropdownChange}
				class="border px-3 py-1 rounded-lg text-sm max-w-40 truncate"
				style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
			>
				{#each allVersions as version}
					<option value={version.id}>
						{version.versionLabel || version.titleDE} {version.id === liveVersionId ? '(Live)' : ''}
					</option>
				{/each}
			</select>
			<button
				type="button"
				on:click={handleCreateNewVersion}
				class="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
			>
				+ New Version
			</button>
		</div>
		<button
			type="button"
			on:click={handleSave}
			disabled={saveStatus === 'saving'}
			class="px-4 py-2 text-sm rounded-lg {saveStatus === 'saving' 
				? 'bg-gray-400 cursor-not-allowed' 
				: saveStatus === 'success' 
					? 'bg-green-500' 
					: saveStatus === 'error'
						? 'bg-red-500'
						: 'bg-blue-600 hover:bg-blue-700'} text-white"
		>
			{saveStatus === 'saving' ? 'Saving...' : saveStatus === 'success' ? 'Saved!' : saveStatus === 'error' ? 'Error' : 'Save'}
		</button>
	</div>

	<!-- Content -->
	<div class="flex-1 overflow-y-auto p-4">
		{#if currentVersion}
			<!-- Basic Info Form -->
			<div class="mb-6 rounded-2xl border border-slate-200 bg-white/90 shadow-sm">
				<button
					type="button"
					class="w-full flex items-center justify-between px-4 py-3 text-left font-semibold"
					on:click={() => (generalSettingsOpen = !generalSettingsOpen)}
				>
					<span>Allgemeine Einstellungen</span>
					<span class="text-sm text-slate-500">{generalSettingsOpen ? '−' : '+'}</span>
				</button>
				{#if generalSettingsOpen}
					<div class="border-t border-slate-100 p-4 space-y-4">
						<div>
							<label class="block text-sm font-medium mb-1">Title (DE)</label>
							<input 
								bind:value={versionForm.titleDE} 
								class="w-full border px-3 py-2 rounded-lg"
							/>
						</div>
						<div>
							<label class="block text-sm font-medium mb-1">Title (EN)</label>
							<input 
								bind:value={versionForm.titleEN} 
								class="w-full border px-3 py-2 rounded-lg"
							/>
						</div>
						<div>
							<label class="block text-sm font-medium mb-1">Description (DE)</label>
							<textarea 
								bind:value={versionForm.descriptionDE} 
								rows="3"
								class="w-full border px-3 py-2 rounded-lg"
							></textarea>
						</div>
						<div>
							<label class="block text-sm font-medium mb-1">Description (EN)</label>
							<textarea 
								bind:value={versionForm.descriptionEN} 
								rows="3"
								class="w-full border px-3 py-2 rounded-lg"
							></textarea>
						</div>
						<div>
							<label class="block text-sm font-medium mb-1">Image URL</label>
							<input 
								bind:value={versionForm.image} 
								class="w-full border px-3 py-2 rounded-lg"
							/>
						</div>

						<!-- Version Management -->
						<div class="pt-4 border-t">
							{#if currentVersion.id === liveVersionId}
								<p class="text-sm text-green-600 mb-2">This version is currently live.</p>
							{:else}
								<button
									type="button"
									on:click={() => handleSetAsLive(currentVersion.id)}
									class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
								>
									Set as Live Version
								</button>
							{/if}
							{#if allVersions.length > 1}
								<button
									type="button"
									on:click={() => handleDeleteVersion(currentVersion.id)}
									class="ml-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
								>
									Delete Version
								</button>
							{/if}
						</div>
					</div>
				{/if}
			</div>

			<!-- Content Blocks Editor -->
			<ContentBlockListEditor 
				content={versionForm.content} 
				onContentChange={handleContentChange}
				{currentVersion}
				onBlockClick={onBlockClick}
			/>
		{:else}
			<div class="text-center py-12 text-gray-500">
				Select a version to edit
			</div>
		{/if}
	</div>
</div>

