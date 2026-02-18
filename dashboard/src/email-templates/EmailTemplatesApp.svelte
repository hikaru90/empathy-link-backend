<script lang="ts">
	import { onMount } from 'svelte';
	import { emailTemplatesApi, type EmailTemplate } from '../lib/api';
	import { getSession } from '../lib/auth';
	import Login from '../lib/components/Login.svelte';
	import Header from '../lib/components/Header.svelte';
	// @ts-ignore
	import styleGuideContent from './styleguide.md?raw';

	let session: { user: { name: string; email: string } } | null = null;
	let authChecked = false;
	let loading = true;
	let error = '';
	
	let templates: EmailTemplate[] = [];
	let editorVisible = false;
	let showUnsavedDialog = false;
	let pendingAction: (() => void) | null = null;
	
	// Form state
	let currentTemplate: Partial<EmailTemplate> = {
		name: '',
		subject: '',
		content: '',
		variables: '[]'
	};
    // Snapshot of the template as it was loaded/saved, for dirty checking
    let originalTemplate: Partial<EmailTemplate> = {};
    
    // Track which version is currently Live in production
    let liveVersionId: string | undefined;

	let versions: any[] = [];
	
	// AI Edit state
	let aiPrompt = '';
	let aiLoading = false;

	// Preview variables state
	let previewVariables: Record<string, string> = {};
	let isMobilePreview = false;

    // Reactive dirty check
    $: hasUnsavedChanges = JSON.stringify({
        name: currentTemplate.name,
        subject: currentTemplate.subject,
        content: currentTemplate.content,
        variables: currentTemplate.variables
    }) !== JSON.stringify({
        name: originalTemplate.name,
        subject: originalTemplate.subject,
        content: originalTemplate.content,
        variables: originalTemplate.variables
    });

	$: variableNames = (() => {
		try {
			const parsed = JSON.parse(currentTemplate.variables || '[]');
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	})();

	$: previewContent = (() => {
		if (!currentTemplate.content) return '';
		let content = currentTemplate.content;
		for (const [key, value] of Object.entries(previewVariables)) {
			content = content.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
		}
		return content;
	})();

	function updatePreviewVariable(key: string, value: string) {
		previewVariables = { ...previewVariables, [key]: value };
	}

	function resetPreviewVariables() {
		previewVariables = {};
	}
	
	onMount(async () => {
		session = await getSession();
		authChecked = true;
		if (!session) return;
		await loadTemplates();
		loading = false;
	});

	async function loadTemplates() {
		try {
			const result = await emailTemplatesApi.list();
			templates = result.templates || [];
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load templates';
		}
	}

	function startCreate() {
		currentTemplate = {
			name: '',
			subject: '',
			content: '',
			variables: '[]'
		};
        originalTemplate = { ...currentTemplate };
        liveVersionId = undefined;
		aiPrompt = '';
		versions = [];
		editorVisible = true;
	}

	async function startEdit(template: EmailTemplate) {
		currentTemplate = { ...template };
        originalTemplate = { ...template };
        liveVersionId = template.currentVersionId;
		aiPrompt = '';
		
		try {
			const result = await emailTemplatesApi.getVersions(template.id);
			versions = result.versions || [];
		} catch (e) {
			console.error('Failed to load versions', e);
			versions = [];
		}
		
		editorVisible = true;
	}

	function handleNavigation(action: () => void) {
		if (hasUnsavedChanges) {
			showUnsavedDialog = true;
			pendingAction = action;
		} else {
			action();
		}
	}

	function confirmUnsaved() {
		showUnsavedDialog = false;
        // Don't manually set hasUnsavedChanges=false, 
        // the action will likely update state which triggers reactivity
		if (pendingAction) pendingAction();
	}

	function cancelUnsaved() {
		showUnsavedDialog = false;
		pendingAction = null;
	}

	async function restoreVersion(version: any) {
		const action = () => {
			const newState = {
				...currentTemplate,
				subject: version.subject,
				content: version.content,
				variables: version.variables,
				versionNumber: version.versionNumber,
                currentVersionId: version.id // Used for highlighting the active breadcrumb
			};
            currentTemplate = newState;
            // When restoring a version to view/edit, we treat it as the new "clean" state
            // unless the user makes further edits.
            originalTemplate = { ...newState };
		};
		
		handleNavigation(action);
	}

	async function saveTemplate() {
		try {
			if (!currentTemplate.name || !currentTemplate.content) {
				throw new Error('Name and content are required');
			}

			let savedTemplate;
			if (currentTemplate.id) {
				const res = await emailTemplatesApi.update(currentTemplate.id, currentTemplate);
				savedTemplate = res.template;
			} else {
				const res = await emailTemplatesApi.create(currentTemplate);
				savedTemplate = res.template;
			}

			// Update local state without closing editor
            // Note: For update, backend now returns 'latestVersionId' for the new version
            // and 'currentVersionId' for the live version.
            const newVersionId = (savedTemplate as any).latestVersionId || savedTemplate.currentVersionId;
            
			currentTemplate = { 
                ...savedTemplate,
                currentVersionId: newVersionId,
                versionNumber: savedTemplate.versionNumber // Ensure we show correct number
            };
            originalTemplate = { ...currentTemplate };
			
            // If this was a new creation, set liveVersionId
            if (!liveVersionId && savedTemplate.currentVersionId) {
                liveVersionId = savedTemplate.currentVersionId;
            }
			
			// Refresh versions list
			if (currentTemplate.id) {
				const result = await emailTemplatesApi.getVersions(currentTemplate.id);
				versions = result.versions || [];
			}
			
			await loadTemplates(); // Refresh background list
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save template';
			setTimeout(() => (error = ''), 5000);
		}
	}

    async function handleSetLiveVersion(e: Event) {
        const select = e.target as HTMLSelectElement;
        const vId = select.value;
        if (!currentTemplate.id || !vId) return;

        try {
            await emailTemplatesApi.setLiveVersion(currentTemplate.id, vId);
            liveVersionId = vId;
            await loadTemplates(); // Refresh main list to show correct live version info
        } catch (err) {
            error = 'Failed to set live version';
            // Revert selection (visually) if possible or just show error
             setTimeout(() => (error = ''), 5000);
        }
    }

	async function runAiEdit() {
		if (!aiPrompt.trim()) return;
		
		aiLoading = true;
		try {
			const result = await emailTemplatesApi.aiEdit(
				aiPrompt, 
				currentTemplate.content, 
				templates,
				styleGuideContent
			);
			
			if (result.result) {
				currentTemplate.content = result.result;
                // hasUnsavedChanges updates automatically
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'AI Edit failed';
			setTimeout(() => (error = ''), 5000);
		} finally {
			aiLoading = false;
		}
	}

	function cancelEdit() {
		handleNavigation(() => {
			editorVisible = false;
		});
	}

	function formatDate(d: string) {
		try {
			return new Date(d).toLocaleDateString() + ' ' + new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
		title="Email Templates" 
		description="Manage and edit email templates with AI." 
		activePage="email-templates" 
	/>

	{#if error}
		<div class="max-w-6xl mx-auto mt-4 px-6">
			<div class="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg">
				{error}
			</div>
		</div>
	{/if}

	<div class="max-w-6xl mx-auto px-6 py-8">
		{#if showUnsavedDialog}
			<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
				<div class="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full mx-4">
					<h3 class="text-lg font-semibold mb-2">Unsaved Changes</h3>
					<p class="text-gray-600 mb-6">You have unsaved changes. Are you sure you want to discard them?</p>
					<div class="flex justify-end gap-3">
						<button class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg" on:click={cancelUnsaved}>
							Keep Editing
						</button>
						<button class="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700" on:click={confirmUnsaved}>
							Discard Changes
						</button>
					</div>
				</div>
			</div>
		{/if}

		{#if editorVisible}
			<section class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-6">
				<div class="flex items-center justify-between">
					<div class="flex flex-col">
						<h2 class="text-xl font-semibold">
							{currentTemplate.id ? 'Edit Template' : 'Create Template'}
						</h2>
                        
                        {#if currentTemplate.id && versions.length > 0}
                             <div class="flex items-center gap-2 mt-2">
                                <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">Live Version:</span>
                                <select 
                                    class="text-xs border-gray-300 rounded border px-2 py-1 bg-gray-50 text-gray-700 focus:ring-blue-500 focus:border-blue-500"
                                    value={liveVersionId}
                                    on:change={handleSetLiveVersion}
                                >
                                    {#each versions as v}
                                        <option value={v.id}>
                                            v{v.versionNumber} ({formatDate(v.created)})
                                        </option>
                                    {/each}
                                </select>
                             </div>
                        {/if}
                        
						{#if versions.length > 0}
                            <div class="mt-3">
                                <span class="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">History (Click to load):</span>
                                <div class="flex flex-wrap gap-2">
                                    {#each versions as v}
                                        <button 
                                            class="text-xs px-2 py-1 rounded border transition-colors {v.id === currentTemplate.currentVersionId ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}"
                                            on:click={() => restoreVersion(v)}
                                            title={formatDate(v.created)}
                                        >
                                            v{v.versionNumber}
                                        </button>
                                    {/each}
                                </div>
                            </div>
						{/if}
					</div>
					<div class="flex gap-3 items-start">
						<button class="px-4 py-2 border rounded-lg text-gray-600" on:click={cancelEdit}>
							Close
						</button>
						<button class="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 transition-all" on:click={saveTemplate} disabled={!hasUnsavedChanges}>
							{hasUnsavedChanges ? 'Save New Version' : 'Saved'}
						</button>
					</div>
				</div>

				<div class="grid md:grid-cols-2 gap-6">
					<div class="space-y-4">
						<label for="templateName" class="block text-sm text-gray-600">Template Name (Unique)</label>
						<input id="templateName" bind:value={currentTemplate.name} class="w-full border px-3 py-2 rounded-lg" placeholder="e.g. welcome_email" />

						<label for="subjectLine" class="block text-sm text-gray-600">Subject Line</label>
						<input id="subjectLine" bind:value={currentTemplate.subject} class="w-full border px-3 py-2 rounded-lg" placeholder="Email Subject" />

						<label for="variables" class="block text-sm text-gray-600">Variables (JSON)</label>
						<input id="variables" bind:value={currentTemplate.variables} class="w-full border px-3 py-2 rounded-lg font-mono text-xs" placeholder='["userName", "verificationUrl"]' />
						
						<div class="bg-blue-50 p-4 rounded-lg mt-4">
							<h3 class="font-semibold text-blue-800 mb-2">AI Assistant</h3>
							<p class="text-sm text-blue-600 mb-3">Describe how you want to change the email content.</p>
							<textarea 
								bind:value={aiPrompt}
								class="w-full border border-blue-200 rounded-lg p-2 h-24 text-sm"
								placeholder="e.g. Make the tone more professional and add a footer with copyright."
							></textarea>
							<button 
								class="mt-2 w-full bg-blue-600 text-white py-2 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
								on:click={runAiEdit}
								disabled={aiLoading || !aiPrompt.trim()}
							>
								{#if aiLoading}
									<svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
										<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
										<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
									</svg>
									Generating...
								{:else}
									Generate / Edit Content
								{/if}
							</button>
						</div>
					</div>

					<div class="space-y-2 flex flex-col h-full">
						<label for="htmlContent" class="block text-sm text-gray-600">HTML Content</label>
						<textarea
							id="htmlContent"
							bind:value={currentTemplate.content}
							class="w-full border px-3 py-2 rounded-lg font-mono text-xs flex-1 min-h-[400px]"
							placeholder="<html>...</html>"
						></textarea>
					</div>
				</div>
                
                <div class="border-t pt-6 mt-6">
                    <div class="flex items-center justify-between mb-2">
                        <h3 class="text-sm font-semibold text-gray-600">Preview</h3>
                        <div class="flex items-center gap-3">
                            <button 
                                class="text-xs flex items-center gap-1 transition-colors {isMobilePreview ? 'text-blue-600 font-medium' : 'text-gray-400 hover:text-gray-600'}"
                                on:click={() => isMobilePreview = !isMobilePreview}
                                title="Toggle Mobile View"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                                    <line x1="12" y1="18" x2="12.01" y2="18"></line>
                                </svg>
                                Mobile
                            </button>
                            {#if variableNames.length > 0}
                                <button 
                                    class="text-xs text-gray-400 hover:text-gray-600"
                                    on:click={resetPreviewVariables}
                                >
                                    Reset variables
                                </button>
                            {/if}
                        </div>
                    </div>
                    
                    {#if variableNames.length > 0}
                        <div class="mb-3 flex flex-wrap gap-2">
                            {#each variableNames as varName}
                                <div class="flex items-center gap-1 bg-gray-100 rounded-md px-2 py-1">
                                    <span class="text-xs text-gray-600">{varName}:</span>
                                    <input
                                        type="text"
                                        value={previewVariables[varName] || ''}
                                        on:input={(e) => updatePreviewVariable(varName, e.currentTarget.value)}
                                        placeholder={`\${${varName}}}`}
                                        class="border rounded px-2 py-1 text-xs w-32"
                                    />
                                </div>
                            {/each}
                        </div>
                    {/if}
                    
                    <div 
                        class="border rounded-lg p-4 bg-white min-h-[200px] overflow-auto transition-all duration-300 {isMobilePreview ? 'mx-auto border-gray-300 shadow-sm' : ''}"
                        style:max-width={isMobilePreview ? '375px' : '100%'}
                    >
                        {@html previewContent}
                    </div>
                </div>
			</section>
		{:else}
			<div class="flex justify-between items-center mb-6">
				<h2 class="text-xl font-semibold">Templates ({templates.length})</h2>
				<button class="px-4 py-2 bg-blue-600 text-white rounded-lg" on:click={startCreate}>
					New Template
				</button>
			</div>

			<div class="grid gap-4">
				{#each templates as template}
					<button class="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center hover:shadow-md transition-shadow group" on:click={() => startEdit(template)}>
						<div class="flex gap-4 items-center w-full">
							<!-- Small Preview -->
							<div class="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0 relative">
                                {#if template.content}
                                    <iframe 
                                        title="Preview"
                                        srcdoc={template.content.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/g, "")}
                                        class="w-[400px] h-[400px] absolute top-0 left-0 origin-top-left scale-[0.16] pointer-events-none bg-white"
                                        tabindex="-1"
                                    ></iframe>
                                {:else}
                                    <div class="w-full h-full flex items-center justify-center text-gray-300">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                                    </div>
                                {/if}
							</div>
							
							<div class="flex flex-col justify-start items-start flex-1 min-w-0">
								<h3 class="font-semibold text-lg truncate w-full text-left">{template.name}</h3>
								<p class="text-gray-500 text-sm truncate w-full text-left">{template.subject || '(No subject)'}</p>
								<p class="text-xs text-gray-400 mt-1">
									Version: {template.versionNumber || 1} • Updated: {formatDate(template.updated)}
								</p>
							</div>
						</div>
						
						<div 
							class="px-3 py-1.5 border border-blue-200 text-blue-700 rounded-lg group-hover:bg-blue-50 transition-colors ml-4"
						>
							Edit
						</div>
					</button>
				{/each}
				
				{#if templates.length === 0}
					<div class="text-center py-10 text-gray-400 bg-white rounded-xl border border-dashed">
						No templates found. Create one to get started.
					</div>
				{/if}
			</div>
		{/if}
	</div>
</main>
{/if}
