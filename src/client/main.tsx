import { render } from 'preact';
import { App } from './components/App';

const root = document.getElementById('app') as HTMLElement;
// index.html ships pre-rendered fallback content inside #app for crawlers and
// link previews; drop it before mounting so the app starts from an empty node.
root.textContent = '';
render(<App />, root);
