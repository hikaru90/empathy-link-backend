<script lang="ts">
	import type { ContentBlock } from '../../schema';

export let onSelectType: (blockType: ContentBlock['type']) => void;

let isOpen = false;

	const blockTypes = [
		{ type: 'text' as const, label: 'Text' },
		{ type: 'breathe' as const, label: 'Breathe' },
		{ type: 'aiQuestion' as const, label: 'AI Question' },
		{ type: 'audio' as const, label: 'Audio' },
		{ type: 'bodymap' as const, label: 'Bodymap' },
		{ type: 'feelingsDetective' as const, label: 'Feelings Detective' }
	];
</script>

<div class="flex items-center justify-between mb-4">
	<h2 class="text-lg font-semibold">Content Blocks</h2>
	<div class="flex items-center gap-2">
		<div class="relative">
			<button
				type="button"
				class="flex items-center justify-between bg-blue-500 px-4 py-2 text-left text-sm font-medium text-white rounded hover:bg-blue-600"
				on:click={() => (isOpen = !isOpen)}
			>
				<span>+ Add Block</span>
				<span class="ml-2">{isOpen ? '▼' : '▶'}</span>
			</button>
			{#if isOpen}
				<div class="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg z-10 p-2 min-w-[200px]">
					{#each blockTypes as blockType}
						<button
							type="button"
							on:click={() => {
								onSelectType(blockType.type);
								isOpen = false;
							}}
							class="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm"
						>
							{blockType.label}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>

