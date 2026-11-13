import { marked, Renderer } from 'marked';
import overview from '../../../docs/api/overview.md?raw';
import configuration from '../../../docs/api/configuration.md?raw';
import editor from '../../../docs/api/editor.md?raw';
import tabs from '../../../docs/api/tabs.md?raw';
import tab from '../../../docs/api/tab.md?raw';
import prefixes from '../../../docs/api/prefixes.md?raw';
import plugins from '../../../docs/api/plugins.md?raw';
import transport from '../../../docs/api/transport.md?raw';
import './style.css';
import './api.css';

const pages = {
  overview: { label: 'Getting started', markdown: overview },
  configuration: { label: 'Configuration', markdown: configuration },
  editor: { label: 'ForgeEditor', markdown: editor },
  tabs: { label: 'TabCollection', markdown: tabs },
  tab: { label: 'QueryTabHandle', markdown: tab },
  prefixes: { label: 'Prefixes & language tools', markdown: prefixes },
  plugins: { label: 'Plugin objects', markdown: plugins },
  transport: { label: 'Transport & results', markdown: transport },
};
type Page = keyof typeof pages;
const requested =
  new URLSearchParams(location.search).get('page') ?? 'overview';
const page: Page = Object.hasOwn(pages, requested)
  ? (requested as Page)
  : 'overview';
const navigation = document.querySelector('#api-navigation');
const content = document.querySelector('#api-content');
if (!navigation || !content)
  throw new Error('API reference mount points are missing.');
for (const [key, entry] of Object.entries(pages)) {
  const link = document.createElement('a');
  link.href = `./api.html?page=${key}`;
  link.textContent = entry.label;
  if (key === page) link.setAttribute('aria-current', 'page');
  navigation.append(link);
}
const renderer = new Renderer();
renderer.heading = function ({ tokens, depth, text }) {
  const id = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>`;
};
// Markdown is bundled, reviewed repository documentation, never remote/user input.
content.innerHTML = marked.parse(pages[page].markdown, {
  async: false,
  renderer,
});
for (const link of content.querySelectorAll<HTMLAnchorElement>('a[href]')) {
  const match = link.getAttribute('href')?.match(/^([a-z-]+)\.md(#.*)?$/);
  if (match && match[1] && Object.hasOwn(pages, match[1]))
    link.href = `./api.html?page=${match[1]}${match[2] ?? ''}`;
}
for (const table of content.querySelectorAll('table')) {
  const wrapper = document.createElement('div');
  wrapper.className = 'api-table';
  table.replaceWith(wrapper);
  wrapper.append(table);
}
for (const pre of content.querySelectorAll('pre')) {
  const wrapper = document.createElement('div');
  wrapper.className = 'api-code';
  pre.replaceWith(wrapper);
  wrapper.append(pre);
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy';
  copy.setAttribute('aria-label', 'Copy code example');
  copy.addEventListener('click', () => {
    void navigator.clipboard
      .writeText(pre.textContent ?? '')
      .then(() => {
        copy.textContent = 'Copied';
      })
      .catch(() => {
        copy.textContent = 'Select code to copy';
      });
  });
  wrapper.append(copy);
}
document.title = `${pages[page].label} · LDForge API`;
if (location.hash)
  requestAnimationFrame(() =>
    document
      .getElementById(decodeURIComponent(location.hash.slice(1)))
      ?.scrollIntoView(),
  );
