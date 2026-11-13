import { mountSiteChrome } from './site-chrome.js';
import { marked, Renderer } from 'marked';
import markdown from '../../../docs/renderers.md?raw';
import { mountCodeExamples } from './code-examples.js';
import './style.css';
import './api.css';

const content = document.querySelector('#plugin-content');
if (!content) throw new Error('Plugin guide mount point is missing.');
const renderer = new Renderer();
renderer.heading = function ({ tokens, depth, text }) {
  const id = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>`;
};
// This Markdown is bundled repository documentation, not remote or user input.
content.innerHTML = marked.parse(markdown, { async: false, renderer });
for (const link of content.querySelectorAll<HTMLAnchorElement>('a[href]')) {
  if (link.getAttribute('href') === 'api/plugins.md')
    link.href = './api.html?page=plugins';
  if (link.getAttribute('href') === '../apps/demo/guide.html')
    link.href = './guide.html';
}
for (const table of content.querySelectorAll('table')) {
  const wrapper = document.createElement('div');
  wrapper.className = 'api-table';
  table.replaceWith(wrapper);
  wrapper.append(table);
}
const destroyExamples = mountCodeExamples(content);
if (import.meta.hot) import.meta.hot.dispose(destroyExamples);
if (location.hash)
  requestAnimationFrame(() =>
    document
      .getElementById(decodeURIComponent(location.hash.slice(1)))
      ?.scrollIntoView(),
  );

mountSiteChrome();
