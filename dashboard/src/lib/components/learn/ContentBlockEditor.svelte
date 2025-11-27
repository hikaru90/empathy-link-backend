<script lang="ts">
	import type { ContentBlock } from '../../schema';

export let block: ContentBlock;
export let blockIndex: number;
export let onUpdate: (field: string, value: any) => void;
export let onBlockClick: (() => void) | undefined;
export let onDuplicate: (() => void) | undefined;
export let onMoveUp: (() => void) | undefined;
export let onMoveDown: (() => void) | undefined;
export let onRemove: (() => void) | undefined;
export let canMoveUp: boolean | undefined;
export let canMoveDown: boolean | undefined;
export let onDragStart: ((e: DragEvent) => void) | undefined;
export let onDragEnd: (() => void) | undefined;

let isCollapsed = true;

	function handleInput(field: string, e: Event) {
		const target = e.target as HTMLInputElement | HTMLTextAreaElement;
		onUpdate(field, target.value);
	}

	function handleNumberInput(field: string, e: Event) {
		const target = e.target as HTMLInputElement;
		onUpdate(field, Number(target.value));
	}

	function handleCheckbox(field: string, e: Event) {
		const target = e.target as HTMLInputElement;
		onUpdate(field, target.checked);
	}
</script>

<div class="border rounded-lg bg-white shadow-sm mb-2">
	<!-- Header -->
	<div class="flex items-center justify-between p-2 border-b bg-gray-50">
		<button
			type="button"
			class="flex items-center gap-2 flex-1 text-left"
			on:click={() => {
				isCollapsed = !isCollapsed;
				onBlockClick?.();
			}}
		>
			{#if onDragStart}
				<div
					role="button"
					aria-label="Drag to reorder"
					tabindex="0"
					class="cursor-grab p-1 text-gray-400"
					draggable="true"
					on:dragstart={onDragStart}
					on:dragend={onDragEnd}
				>
					⋮⋮
				</div>
			{/if}
			<span class="text-sm font-medium uppercase">{block.type}</span>
			<span class="text-xs text-gray-500">#{blockIndex + 1}</span>
		</button>
		<div class="flex gap-1">
			{#if canMoveUp}
				<button type="button" class="px-2 py-1 text-xs hover:bg-gray-200 rounded" on:click={onMoveUp}>↑</button>
			{/if}
			{#if canMoveDown}
				<button type="button" class="px-2 py-1 text-xs hover:bg-gray-200 rounded" on:click={onMoveDown}>↓</button>
			{/if}
			{#if onDuplicate}
				<button type="button" class="px-2 py-1 text-xs hover:bg-gray-200 rounded" on:click={onDuplicate}>Copy</button>
			{/if}
			{#if onRemove}
				<button type="button" class="px-2 py-1 text-xs hover:bg-red-200 rounded text-red-600" on:click={onRemove}>Delete</button>
			{/if}
		</div>
	</div>

	<!-- Content -->
	{#if !isCollapsed}
		<div class="p-4 space-y-3">
			{#if block.type === 'text'}
				<div>
					<label for="block-{blockIndex}-content" class="block text-xs font-medium mb-1">Content</label>
					<textarea
						id="block-{blockIndex}-content"
						value={block.content || ''}
						on:input={(e) => handleInput('content', e)}
						rows="4"
						class="w-full border px-3 py-2 rounded text-sm"
					></textarea>
				</div>
				<div>
					<label for="block-{blockIndex}-cta-text" class="block text-xs font-medium mb-1">CTA Text</label>
					<input
						id="block-{blockIndex}-cta-text"
						value={block.ctaText || ''}
						on:input={(e) => handleInput('ctaText', e)}
						class="w-full border px-3 py-2 rounded text-sm"
					/>
				</div>
			{:else if block.type === 'breathe'}
				<div>
					<label for="block-{blockIndex}-duration" class="block text-xs font-medium mb-1">Duration (seconds)</label>
					<input
						id="block-{blockIndex}-duration"
						type="number"
						value={block.duration || 60}
						on:input={(e) => handleNumberInput('duration', e)}
						class="w-full border px-3 py-2 rounded text-sm"
					/>
				</div>
			{:else if block.type === 'aiQuestion'}
				<div>
					<label for="block-{blockIndex}-question" class="block text-xs font-medium mb-1">Question</label>
					<input
						id="block-{blockIndex}-question"
						value={block.question || ''}
						on:input={(e) => handleInput('question', e)}
						class="w-full border px-3 py-2 rounded text-sm"
					/>
				</div>
				<div>
					<label for="block-{blockIndex}-placeholder" class="block text-xs font-medium mb-1">Placeholder</label>
					<input
						id="block-{blockIndex}-placeholder"
						value={block.placeholder || ''}
						on:input={(e) => handleInput('placeholder', e)}
						class="w-full border px-3 py-2 rounded text-sm"
					/>
				</div>
				<div>
					<label for="block-{blockIndex}-system-prompt" class="block text-xs font-medium mb-1">System Prompt</label>
					<textarea
						id="block-{blockIndex}-system-prompt"
						value={block.systemPrompt || ''}
						on:input={(e) => handleInput('systemPrompt', e)}
						rows="4"
						class="w-full border px-3 py-2 rounded text-sm"
					></textarea>
				</div>
			{:else if block.type === 'audio'}
				<div>
					<label for="block-{blockIndex}-audio-url" class="block text-xs font-medium mb-1">Audio URL</label>
					<input
						id="block-{blockIndex}-audio-url"
						value={block.src || ''}
						on:input={(e) => handleInput('src', e)}
						class="w-full border px-3 py-2 rounded text-sm"
					/>
				</div>
				<div>
					<label for="block-{blockIndex}-audio-title" class="block text-xs font-medium mb-1">Title</label>
					<input
						id="block-{blockIndex}-audio-title"
						value={block.title || ''}
						on:input={(e) => handleInput('title', e)}
						class="w-full border px-3 py-2 rounded text-sm"
					/>
				</div>
				<div>
					<label for="block-{blockIndex}-audio-content" class="block text-xs font-medium mb-1">Content</label>
					<input
						id="block-{blockIndex}-audio-content"
						value={block.content || ''}
						on:input={(e) => handleInput('content', e)}
						class="w-full border px-3 py-2 rounded text-sm"
					/>
				</div>
				<div class="flex gap-4">
					<label class="flex items-center gap-2 text-xs">
						<input
							type="checkbox"
							checked={block.controls !== false}
							on:change={(e) => handleCheckbox('controls', e)}
							class="rounded"
						/>
						Controls
					</label>
					<label class="flex items-center gap-2 text-xs">
						<input
							type="checkbox"
							checked={block.autoplay === true}
							on:change={(e) => handleCheckbox('autoplay', e)}
							class="rounded"
						/>
						Autoplay
					</label>
					<label class="flex items-center gap-2 text-xs">
						<input
							type="checkbox"
							checked={block.loop === true}
							on:change={(e) => handleCheckbox('loop', e)}
							class="rounded"
						/>
						Loop
					</label>
				</div>
			{:else if block.type === 'bodymap'}
				<div class="text-sm text-gray-500 italic">Body map block (no configuration needed)</div>
			{:else if block.type === 'feelingsDetective'}
				<div>
					<label for="block-{blockIndex}-feelings-question" class="block text-xs font-medium mb-1">Question</label>
					<input
						id="block-{blockIndex}-feelings-question"
						value={block.question || ''}
						on:input={(e) => handleInput('question', e)}
						class="w-full border px-3 py-2 rounded text-sm"
					/>
				</div>
			{/if}
		</div>
	{/if}
</div>

