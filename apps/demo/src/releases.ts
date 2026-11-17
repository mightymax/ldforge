import { marked } from 'marked';
import { mountSiteChrome } from './site-chrome.js';
import './style.css';
import './releases.css';

const files = import.meta.glob<string>('../../../docs/releases/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const navigation = document.querySelector('#release-navigation');
const content = document.querySelector('#release-content');
if (!navigation || !content)
  throw new Error('Missing release page containers.');
const releases = Object.entries(files)
  .flatMap(([path, markdown]) => {
    const tag = path.split('/').at(-1)?.replace(/\.md$/, '') ?? '';
    if (tag === 'README') return [];
    const title = /^# (.+)$/m.exec(markdown)?.[1];
    const date = /^Released: (\d{4}-\d{2}-\d{2})$/m.exec(markdown)?.[1];
    if (!title || !date)
      throw new Error(`Missing release title or date: ${path}`);
    return [{ tag, title, date, markdown }];
  })
  .sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      (b.tag.startsWith('release-')
        ? (b.tag.split('-')[2] ?? '')
        : ''
      ).localeCompare(
        a.tag.startsWith('release-') ? (a.tag.split('-')[2] ?? '') : '',
      ) ||
      b.tag.localeCompare(a.tag),
  );
for (const release of releases) {
  const link = document.createElement('a');
  link.href = `#${release.tag}`;
  link.textContent = release.tag.startsWith('release-')
    ? `${release.date} · ${release.tag.split('-')[2]}`
    : release.tag;
  navigation.append(link);
  const section = document.createElement('section');
  section.id = release.tag;
  section.className = 'release-entry';
  section.innerHTML = marked.parse(
    release.markdown
      .replace(/^# (.+)$/m, '## $1')
      .replace(
        /^## (Updated packages|What changed|Upgrade guide)$/gm,
        '### $1',
      ),
    { async: false },
  );
  const source = document.createElement('a');
  source.className = 'release-markdown';
  source.href = `https://github.com/mightymax/ldforge/blob/main/docs/releases/${release.tag}.md`;
  source.textContent = 'Read this release as Markdown ↗';
  section.append(source);
  content.append(section);
}
mountSiteChrome();
