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
  imprint.innerHTML = `<p>IMPRINT</p><div><span>© 2026 | <a href="https://ldmax.nl/" target="_blank" rel="noopener noreferrer">LDMax</a></span><span>LDForge · Open-source SPARQL tooling</span><a href="https://github.com/mightymax/ldforge/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" class="license-link"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3v17M7 21h10M4 7l8-3 8 3M4 7l-3 7h6L4 7Zm16 0-3 7h6l-3-7Z" /></svg>MIT</a></div>`;
  main.append(imprint);
}
