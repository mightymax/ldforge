import { mountSiteChrome } from './site-chrome.js';
import './style.css';
import { mountCodeExamples } from './code-examples.js';
const destroyExamples = mountCodeExamples(
  document.querySelector('main') ?? document.body,
);
if (import.meta.hot) import.meta.hot.dispose(destroyExamples);

mountSiteChrome();
