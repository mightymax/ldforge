import { createSvgIcon } from '@ldforge/core';
import type { Locale } from '@ldforge/core';

/** Native popovers provide outside-click dismissal, Escape and focus return. */
export function createAboutControl(doc: Document, locale: Locale): HTMLElement {
  const wrapper = doc.createElement('div');
  wrapper.className = 'ldforge-about';
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'ldforge-about-button';
  button.title = locale === 'nl' ? 'Over LDForge' : 'About LDForge';
  button.setAttribute('aria-label', button.title);
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7h.01"/></svg>';
  const panel = doc.createElement('div');
  panel.className = 'ldforge-about-panel';
  panel.popover = 'auto';
  panel.setAttribute('aria-label', button.title);
  const title = doc.createElement('a');
  title.href = 'https://ldforge.nl/';
  title.target = '_blank';
  title.rel = 'noopener noreferrer';
  title.className = 'ldforge-about-title';
  // Inline the project mark so embedded editors need no external image request.
  title.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false"><rect width="64" height="64" rx="16" fill="#075e55"/><path d="M20 46V20H43M20 33H36" stroke="#f3f8ee" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><g fill="#f3f8ee"><circle cx="20" cy="20" r="4"/><circle cx="43" cy="20" r="4"/><circle cx="20" cy="33" r="4"/><circle cx="36" cy="33" r="4"/><circle cx="20" cy="46" r="4"/></g><path d="m45 38 2.5 5.5L53 46l-5.5 2.5L45 54l-2.5-5.5L37 46l5.5-2.5z" fill="#f4c66b"/></svg>';
  title.append('LDForge');
  const copyright = doc.createElement('p');
  copyright.className = 'ldforge-about-copyright';
  const copyrightIcon = createSvgIcon([
    'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
    'M15 9a4 4 0 1 0 0 6',
  ])(doc);
  const copyrightText = doc.createElement('span');
  copyrightText.setAttribute('aria-label', '© 2026 LDMax');
  copyrightText.append('2026 ');
  copyright.append(copyrightIcon, copyrightText);
  const owner = doc.createElement('a');
  owner.href = 'https://ldmax.nl/';
  owner.textContent = 'LDMax';
  owner.target = '_blank';
  owner.rel = 'noopener noreferrer';
  copyrightText.append(owner);
  const links = doc.createElement('nav');
  links.setAttribute('aria-label', button.title);
  for (const [label, href, paths] of [
    [
      locale === 'nl' ? 'Documentatie' : 'Documentation',
      'https://ldforge.nl/guide.html',
      ['M12 5v16M3 3h6l3 2 3-2h6v16h-6l-3 2-3-2H3Z'],
    ],
    [
      'GitHub',
      'https://github.com/mightymax/ldforge',
      [
        'M9 19c-4 1-4-2-6-2m12 5v-4a3.5 3.5 0 0 0-1-2.7c3.3-.4 6.7-1.6 6.7-7.3a5.7 5.7 0 0 0-1.5-4 5.3 5.3 0 0 0-.1-4s-1.3-.4-4.1 1.5a14 14 0 0 0-7.4 0C4.8-.4 3.5 0 3.5 0a5.3 5.3 0 0 0-.1 4A5.7 5.7 0 0 0 2 8c0 5.7 3.4 6.9 6.7 7.3A3.5 3.5 0 0 0 8 18v4',
      ],
    ],
    [
      'Release notes',
      'https://ldforge.nl/releases.html',
      ['M14 2H5v20h14V7Z M14 2v5h5M8 12h8M8 16h8'],
    ],
    [
      locale === 'nl' ? 'MIT-licentie' : 'MIT license',
      'https://github.com/mightymax/ldforge/blob/main/LICENSE',
      ['M12 3v17M7 21h10M4 7l8-3 8 3M4 7l-3 7h6L4 7Zm16 0-3 7h6l-3-7Z'],
    ],
  ] as const) {
    const link = doc.createElement('a');
    link.append(createSvgIcon(paths)(doc), doc.createTextNode(label));
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    links.append(link);
  }
  panel.append(title, links, copyright);
  button.popoverTargetElement = panel;
  button.addEventListener('click', () => {
    const rect = button.getBoundingClientRect();
    panel.style.top = 'auto';
    panel.style.bottom = `${Math.max(8, (doc.defaultView?.innerHeight ?? rect.top) - rect.top + 6)}px`;
    panel.style.left = `${Math.max(8, Math.min(rect.right - 224, (doc.defaultView?.innerWidth ?? rect.right) - 232))}px`;
  });
  panel.addEventListener('toggle', () => {
    button.setAttribute(
      'aria-expanded',
      String(panel.matches(':popover-open')),
    );
  });
  wrapper.append(button, panel);
  return wrapper;
}
