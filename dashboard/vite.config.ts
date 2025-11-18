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
				learn: path.resolve(__dirname, 'learn.html')
			}
		}
	},
	server: {
		port: 4173,
		proxy: {
			'/api': {
				target: 'http://localhost:4000',
				changeOrigin: true
			}
		}
	}
});

