<script lang="ts">
	import type { ContentBlock } from '../../schema';
	import type { LearnTopicVersion } from '../../api';
	import BlockTypeSelector from './BlockTypeSelector.svelte';
	import ContentBlockEditor from './ContentBlockEditor.svelte';

export let content: ContentBlock[];
export let onContentChange: (content: ContentBlock[]) => void;
export let currentVersion: LearnTopicVersion | undefined;
export let onBlockClick: ((blockIndex: number) => void) | undefined;

let draggedBlockIndex: number | null = null;
let dragOverIndex: number | null = null;
let previewContent = content;

$: if (draggedBlockIndex === null || dragOverIndex === null) {
	previewContent = content;
} else {
	const newContent = [...content];
	const [draggedItem] = newContent.splice(draggedBlockIndex, 1);
	newContent.splice(dragOverIndex, 0, draggedItem);
	previewContent = newContent;
}

	const addContentBlock = (blockType: ContentBlock['type']) => {
		let newBlock: ContentBlock;
		switch (blockType) {
			case 'text':
				newBlock = { type: 'text', content: '' };
				break;
			case 'breathe':
				newBlock = { type: 'breathe', duration: 60 };
				break;
			case 'aiQuestion':
				newBlock = {
					type: 'aiQuestion',
					question: 'Your question here?',
					systemPrompt: "You are a helpful learning assistant.",
					placeholder: 'Write your answer here...'
				};
				break;
			case 'audio':
				newBlock = {
					type: 'audio',
					src: '',
					title: 'Audio Title',
					content: '',
					controls: true,
					autoplay: false,
					loop: false
				};
				break;
			case 'bodymap':
				newBlock = { type: 'bodymap' };
				break;
			case 'feelingsDetective':
				newBlock = {
					type: 'feelingsDetective',
					question: 'Beschreibe eine Situation, die du erlebt hast:'
				};
				break;
			default:
				newBlock = { type: 'text', content: 'New content block' };
		}

		const newContent = [...content, newBlock];
		onContentChange(newContent);
	};

	const removeContentBlock = (blockIndex: number) => {
		const newContent = content.filter((_, index) => index !== blockIndex);
		onContentChange(newContent);
	};

	const updateContentBlock = (blockIndex: number, updatedBlock: ContentBlock) => {
		const newContent = [...content];
		newContent[blockIndex] = updatedBlock;
		onContentChange(newContent);
	};

	const moveContentBlock = (fromIndex: number, toIndex: number) => {
		if (toIndex < 0 || toIndex >= content.length) return;
		const newContent = [...content];
		const [movedBlock] = newContent.splice(fromIndex, 1);
		newContent.splice(toIndex, 0, movedBlock);
		onContentChange(newContent);
	};

	const duplicateContentBlock = (blockIndex: number) => {
		const blockToDuplicate = content[blockIndex];
		const duplicatedBlock = JSON.parse(JSON.stringify(blockToDuplicate));
		const newContent = [...content];
		newContent.splice(blockIndex + 1, 0, duplicatedBlock);
		onContentChange(newContent);
	};

	const handleDragStart = (e: DragEvent, blockIndex: number) => {
		draggedBlockIndex = blockIndex;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/html', '');
		}
	};

	const handleDragOver = (e: DragEvent) => {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
		const target = e.currentTarget as HTMLElement;
		const overIndex = parseInt(target.dataset.blockIndex || '0');
		dragOverIndex = overIndex;
	};

	const handleDrop = (e: DragEvent) => {
		e.preventDefault();
		const target = e.currentTarget as HTMLElement;
		const dropIndex = parseInt(target.dataset.blockIndex || '0');
		if (draggedBlockIndex !== null && draggedBlockIndex !== dropIndex) {
			moveContentBlock(draggedBlockIndex, dropIndex);
		}
		draggedBlockIndex = null;
		dragOverIndex = null;
	};

	const handleDragEnd = () => {
		draggedBlockIndex = null;
		dragOverIndex = null;
	};
</script>

<div class="space-y-4">
	<BlockTypeSelector onSelectType={addContentBlock} />

	<div class="space-y-1 pb-16">
		{#each previewContent as block, blockIndex}
			<div
				class="relative {draggedBlockIndex !== null && dragOverIndex === blockIndex ? 'ring-2 ring-blue-400 bg-blue-50' : ''}"
				data-block-index={blockIndex}
				ondragover={handleDragOver}
				ondrop={handleDrop}
			>
				<ContentBlockEditor
					{block}
					{blockIndex}
					{currentVersion}
					onBlockClick={() => onBlockClick?.(blockIndex)}
					onDuplicate={() => duplicateContentBlock(blockIndex)}
					onMoveUp={() => moveContentBlock(blockIndex, blockIndex - 1)}
					onMoveDown={() => moveContentBlock(blockIndex, blockIndex + 1)}
					onRemove={() => removeContentBlock(blockIndex)}
					canMoveUp={blockIndex > 0}
					canMoveDown={blockIndex < content.length - 1}
					onDragStart={(e) => handleDragStart(e, blockIndex)}
					onDragEnd={handleDragEnd}
					onUpdate={(field, value) => {
						const updatedBlock = { ...block, [field]: value };
						updateContentBlock(blockIndex, updatedBlock);
					}}
				/>
			</div>
		{/each}
	</div>

	{#if content.length === 0}
		<div class="py-8 text-center">
			<p class="mb-4 text-gray-500">No content blocks yet</p>
			<BlockTypeSelector onSelectType={addContentBlock} />
		</div>
	{/if}
</div>

