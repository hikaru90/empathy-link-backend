import AnalyticsApp from './AnalyticsApp.svelte';

const target = document.getElementById('app');

if (target) {
	new AnalyticsApp({
		target
	});
}
