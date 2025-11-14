/**
 * Main application logic for NVC Knowledge Base Dashboard
 */

let entries = [];
let categories = [];
let currentEntry = null;
let tags = [];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
	await loadCategories();
	await loadEntries();
	setupEventListeners();
});

function setupEventListeners() {
	// Form handlers
	document.getElementById('entry-form').addEventListener('submit', handleSave);
	document.getElementById('cancel-btn').addEventListener('click', handleCancel);
	document.getElementById('new-entry-btn').addEventListener('click', handleCreate);
	document.getElementById('add-tag-btn').addEventListener('click', addTag);
	document.getElementById('new-tag').addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			addTag();
		}
	});

	// Priority slider
	document.getElementById('form-priority').addEventListener('input', (e) => {
		document.getElementById('priority-value').textContent = e.target.value;
	});

	// Content length counter
	document.getElementById('form-content').addEventListener('input', (e) => {
		const length = e.target.value.length;
		const maxLength = 5000;
		const counter = document.getElementById('content-length');
		counter.textContent = `${length} / ${maxLength}`;
		if (length > maxLength * 0.9) {
			counter.classList.add('text-orange-600');
			counter.classList.remove('text-gray-400');
		} else {
			counter.classList.remove('text-orange-600');
			counter.classList.add('text-gray-400');
		}
	});

	// Filters
	document.getElementById('language-filter').addEventListener('change', loadEntries);
	document.getElementById('category-filter').addEventListener('change', loadEntries);

	// Search
	document.getElementById('search-input').addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			handleSearch(e.target.value);
		}
	});
}

async function loadCategories() {
	try {
		const result = await nvcKnowledgeApi.getCategories();
		categories = result.categories;
		const select = document.getElementById('form-category');
		const filter = document.getElementById('category-filter');
		
		categories.forEach(cat => {
			const option1 = document.createElement('option');
			option1.value = cat;
			option1.textContent = cat;
			select.appendChild(option1);

			const option2 = document.createElement('option');
			option2.value = cat;
			option2.textContent = cat;
			filter.appendChild(option2);
		});
	} catch (error) {
		showError('Failed to load categories: ' + error.message);
	}
}

async function loadEntries() {
	try {
		const language = document.getElementById('language-filter').value;
		const category = document.getElementById('category-filter').value;

		const result = await nvcKnowledgeApi.list({
			language: language !== 'all' ? language : undefined,
			category: category || undefined,
			isActive: true,
			limit: 50
		});

		entries = result.entries;
		renderEntries();
	} catch (error) {
		showError('Failed to load entries: ' + error.message);
	}
}

function renderEntries() {
	const tbody = document.getElementById('entries-tbody');
	const title = document.getElementById('entries-title');
	
	title.textContent = `All Entries (${entries.length})`;

	if (entries.length === 0) {
		tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-8 text-center text-gray-500">No entries found</td></tr>';
		return;
	}

	tbody.innerHTML = entries.map(entry => `
		<tr class="hover:bg-gray-50">
			<td class="px-6 py-4 whitespace-nowrap">
				<div class="text-sm font-medium text-gray-900">${escapeHtml(entry.title)}</div>
				<div class="text-sm text-gray-500 line-clamp-1 max-w-md">${escapeHtml(entry.content.substring(0, 100))}...</div>
			</td>
			<td class="px-6 py-4 whitespace-nowrap">
				<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
					${entry.language.toUpperCase()}
				</span>
			</td>
			<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
				${escapeHtml(entry.category)}
				${entry.subcategory ? `<div class="text-xs text-gray-400">/${escapeHtml(entry.subcategory)}</div>` : ''}
			</td>
			<td class="px-6 py-4">
				<div class="flex flex-wrap gap-1">
					${entry.tags && entry.tags.length > 0
						? entry.tags.map(tag => `<span class="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">${escapeHtml(tag)}</span>`).join('')
						: '<span class="text-xs text-gray-400">—</span>'
					}
				</div>
			</td>
			<td class="px-6 py-4 whitespace-nowrap">
				<div class="flex items-center">
					${Array(5).fill(0).map((_, i) => 
						`<span class="text-yellow-400 ${i < entry.priority ? 'fill-current' : ''}">★</span>`
					).join('')}
				</div>
			</td>
			<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
				${new Date(entry.updated).toLocaleDateString()}
			</td>
			<td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
				<button onclick="handleEdit('${entry.id}')" class="text-blue-600 hover:text-blue-900 mr-4">Edit</button>
				<button onclick="handleDelete('${entry.id}')" class="text-red-600 hover:text-red-900">Delete</button>
			</td>
		</tr>
	`).join('');
}

async function handleSearch(query) {
	if (!query.trim()) {
		loadEntries();
		return;
	}

	try {
		const language = document.getElementById('language-filter').value;
		const category = document.getElementById('category-filter').value;

		const result = await nvcKnowledgeApi.search({
			query,
			language: language !== 'all' ? language : undefined,
			category: category || undefined
		});

		entries = result.results;
		document.getElementById('entries-title').textContent = `Search Results (${entries.length})`;
		renderEntries();
	} catch (error) {
		showError('Search failed: ' + error.message);
	}
}

function handleCreate() {
	currentEntry = null;
	tags = [];
	showEditor();
	document.getElementById('entry-form').reset();
	document.getElementById('form-id').value = '';
	document.getElementById('form-priority').value = '3';
	document.getElementById('priority-value').textContent = '3';
	document.getElementById('tags-container').innerHTML = '';
	document.getElementById('content-length').textContent = '0 / 5000';
	document.getElementById('content-length').classList.remove('text-orange-600');
	document.getElementById('content-length').classList.add('text-gray-400');
	document.getElementById('editor-title').textContent = 'Create New Entry';
}

async function handleEdit(id) {
	try {
		const entry = await nvcKnowledgeApi.get(id);
		currentEntry = entry;
		tags = entry.tags || [];
		
		document.getElementById('form-id').value = entry.id;
		document.getElementById('form-language').value = entry.language;
		document.getElementById('form-category').value = entry.category;
		document.getElementById('form-title').value = entry.title;
		document.getElementById('form-content').value = entry.content;
		document.getElementById('form-subcategory').value = entry.subcategory || '';
		document.getElementById('form-source').value = entry.source || '';
		document.getElementById('form-priority').value = entry.priority;
		document.getElementById('priority-value').textContent = entry.priority;
		
		// Update content length counter
		const contentLength = entry.content.length;
		document.getElementById('content-length').textContent = `${contentLength} / 5000`;
		if (contentLength > 4500) {
			document.getElementById('content-length').classList.add('text-orange-600');
			document.getElementById('content-length').classList.remove('text-gray-400');
		}
		
		renderTags();
		document.getElementById('editor-title').textContent = 'Edit Entry';
		showEditor();
	} catch (error) {
		showError('Failed to load entry: ' + error.message);
	}
}

async function handleSave(e) {
	e.preventDefault();
	
	try {
		const formData = {
			language: document.getElementById('form-language').value,
			title: document.getElementById('form-title').value,
			content: document.getElementById('form-content').value,
			category: document.getElementById('form-category').value,
			subcategory: document.getElementById('form-subcategory').value || null,
			source: document.getElementById('form-source').value || null,
			tags: tags.length > 0 ? tags : null,
			priority: parseInt(document.getElementById('form-priority').value)
		};

		if (currentEntry) {
			await nvcKnowledgeApi.update(currentEntry.id, formData);
		} else {
			await nvcKnowledgeApi.create(formData);
		}

		hideEditor();
		await loadEntries();
	} catch (error) {
		showError('Failed to save entry: ' + error.message);
	}
}

async function handleDelete(id) {
	if (!confirm('Are you sure you want to delete this entry?')) return;
	
	try {
		await nvcKnowledgeApi.delete(id);
		await loadEntries();
	} catch (error) {
		showError('Failed to delete entry: ' + error.message);
	}
}

function handleCancel() {
	hideEditor();
}

function addTag() {
	const input = document.getElementById('new-tag');
	const tag = input.value.trim();
	
	if (tag && !tags.includes(tag)) {
		tags.push(tag);
		renderTags();
		input.value = '';
	}
}

function removeTag(tag) {
	tags = tags.filter(t => t !== tag);
	renderTags();
}

function renderTags() {
	const container = document.getElementById('tags-container');
	container.innerHTML = tags.map(tag => `
		<span class="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm flex items-center gap-2">
			${escapeHtml(tag)}
			<button onclick="removeTag('${escapeHtml(tag)}')" class="text-blue-600 hover:text-blue-800">×</button>
		</span>
	`).join('');
}

function showEditor() {
	document.getElementById('list-container').classList.add('hidden');
	document.getElementById('editor-container').classList.remove('hidden');
}

function hideEditor() {
	document.getElementById('editor-container').classList.add('hidden');
	document.getElementById('list-container').classList.remove('hidden');
}

function showError(message) {
	const errorDiv = document.getElementById('error');
	errorDiv.textContent = message;
	errorDiv.classList.remove('hidden');
	setTimeout(() => {
		errorDiv.classList.add('hidden');
	}, 5000);
}

function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

// Make functions available globally for onclick handlers
window.handleEdit = handleEdit;
window.handleDelete = handleDelete;
window.removeTag = removeTag;

