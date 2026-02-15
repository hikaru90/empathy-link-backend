<script lang="ts">
	import { signIn } from '../auth';

	let email = '';
	let password = '';
	let error = '';
	let loading = false;

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';
		loading = true;
		try {
			await signIn(email, password);
			window.location.reload();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen';
		} finally {
			loading = false;
		}
	}
</script>

<div class="min-h-screen bg-gray-50 flex items-center justify-center px-4">
	<div class="w-full max-w-sm">
		<div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
			<div class="text-center mb-8">
				<h1 class="text-2xl font-semibold text-gray-900">Empathy-Link</h1>
				<p class="text-sm text-gray-500 mt-1">Dashboard anmelden</p>
			</div>

			<form on:submit={handleSubmit} class="space-y-5">
				{#if error}
					<div class="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg text-sm">
						{error}
					</div>
				{/if}

				<div>
					<label for="email" class="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
					<input
						id="email"
						type="email"
						bind:value={email}
						required
						autocomplete="email"
						class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						placeholder="deine@email.de"
					/>
				</div>

				<div>
					<label for="password" class="block text-sm font-medium text-gray-700 mb-1">Passwort</label>
					<input
						id="password"
						type="password"
						bind:value={password}
						required
						autocomplete="current-password"
						class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					/>
				</div>

				<button
					type="submit"
					disabled={loading}
					class="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
				>
					{loading ? 'Wird angemeldet…' : 'Anmelden'}
				</button>
			</form>
		</div>
	</div>
</div>
