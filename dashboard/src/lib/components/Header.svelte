<script lang="ts">
	import { signOut } from '../auth';

	export let title: string;
	export let description: string;
	export let activePage: string;

	async function handleSignOut() {
		await signOut();
		window.location.reload();
	}
</script>

<header class="bg-white border-b border-gray-200">
	<div class="max-w-6xl mx-auto px-6 py-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
		<div>
			<p class="text-xs uppercase tracking-wide text-gray-400">Operations</p>
			<h1 class="text-2xl font-semibold">{title}</h1>
			<p class="text-sm text-gray-500">{description}</p>
		</div>
		<nav class="flex gap-4 text-sm items-center">
			<a href="/" class={activePage === 'index' ? 'text-gray-900 font-semibold' : 'text-gray-600 hover:text-gray-900'}>Knowledge Base</a>
			<a href="/analytics.html" class={activePage === 'analytics' ? 'text-gray-900 font-semibold' : 'text-gray-600 hover:text-gray-900'}>Analytics</a>
			<a href="/safety.html" class={activePage === 'safety' ? 'text-gray-900 font-semibold' : 'text-gray-600 hover:text-gray-900'}>Safety</a>
			<a href="/email-templates.html" class={activePage === 'email-templates' ? 'text-gray-900 font-semibold' : 'text-gray-600 hover:text-gray-900'}>Email Templates</a>
			<button
				type="button"
				class="px-3 py-1.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
				on:click={handleSignOut}
			>
				Abmelden
			</button>
		</nav>
	</div>
</header>
