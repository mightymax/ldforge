import { mountSiteChrome } from './site-chrome.js';
import './style.css';
import './api.css';
import './guide.css';
import { mountCodeExamples } from './code-examples.js';
const destroyExamples = mountCodeExamples(
  document.querySelector('main') ?? document.body,
);
const links = [
  ...document.querySelectorAll<HTMLAnchorElement>('#guide-navigation a'),
];
function markCurrent(id: string): void {
  for (const link of links) {
    if (link.hash === `#${id}`) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}
markCurrent(location.hash.slice(1) || 'install');
const observer = new IntersectionObserver(
  (entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible[0]) markCurrent(visible[0].target.id);
  },
  { rootMargin: '-10% 0px -55% 0px' },
);
for (const link of links) {
  const section = document.getElementById(link.hash.slice(1));
  if (section) observer.observe(section);
}
const onHashChange = () => markCurrent(location.hash.slice(1) || 'install');
window.addEventListener('hashchange', onHashChange);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    destroyExamples();
    observer.disconnect();
    window.removeEventListener('hashchange', onHashChange);
  });

mountSiteChrome();
