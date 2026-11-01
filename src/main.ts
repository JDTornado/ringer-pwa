// Self-hosted fonts (no Google Fonts request; precached for offline use).
// Weights: the ones the prototype uses. Latin subset only (Basic Latin +
// Latin-1, so names like José or Müller are covered); any other character
// falls back to the system font.
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/barlow-condensed/latin-400.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';

import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

import { mount } from 'svelte';
import App from './App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('#app element missing from index.html');

export default mount(App, { target });
