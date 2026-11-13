import logoMark from '../assets/logo-mark.svg';

/** Shared public-site identity on every demo/documentation entry point. */
export function mountSiteChrome(): void {
  const main = document.querySelector('main');
  const navigation = main?.querySelector('header nav');
  if (!main || !navigation) return;
  const wordmark = main.querySelector('.wordmark');
  if (wordmark) {
    const image = document.createElement('img');
    image.src = logoMark;
    image.alt = '';
    image.width = 34;
    image.height = 34;
    image.className = 'wordmark-symbol';
    wordmark.prepend(image);
  }
  const cdnExample = document.createElement('a');
  cdnExample.href = './wikidata-cats.html';
  cdnExample.textContent = 'CDN example';
  navigation.append(cdnExample);
  const repository = document.createElement('a');
  repository.href = 'https://github.com/mightymax/ldforge';
  repository.className = 'repository-link';
  repository.textContent = 'GitHub ↗';
  repository.setAttribute('aria-label', 'LDForge on GitHub');
  repository.target = '_blank';
  repository.rel = 'noopener noreferrer';
  navigation.append(repository);
  const imprint = document.createElement('footer');
  imprint.className = 'site-imprint';
  imprint.setAttribute('aria-label', 'Imprint and copyright');
  imprint.innerHTML = `<p>IMPRINT</p><div>© ${new Date().getFullYear()} <a href="https://ldmax.nl/" target="_blank" rel="noopener noreferrer">LDMax</a><span>LDForge · Open-source SPARQL tooling</span><a href="https://github.com/mightymax/ldforge/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">EUPL-1.2</a></div>`;
  main.append(imprint);
}
