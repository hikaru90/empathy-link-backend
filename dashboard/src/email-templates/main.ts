import EmailTemplatesApp from './EmailTemplatesApp.svelte';

const target = document.getElementById('app');

if (target) {
	new EmailTemplatesApp({
		target
	});
}
