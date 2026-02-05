import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

export default defineConfig({
	plugins: [svelte()],
	build: {
		outDir: 'dist',
		emptyOutDir: true,
		rollupOptions: {
			input: {
				index: path.resolve(__dirname, 'index.html'),
				analytics: path.resolve(__dirname, 'analytics.html'),
				safety: path.resolve(__dirname, 'safety.html')
			}
		}
	},
});

