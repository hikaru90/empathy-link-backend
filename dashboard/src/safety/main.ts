import SafetyApp from './SafetyApp.svelte';

const target = document.getElementById('app');

if (target) {
	new SafetyApp({
		target
	});
}
