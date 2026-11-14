import { expect, test } from '@playwright/test';

for (const kind of ['SELECT', 'CONSTRUCT', 'ASK', 'DESCRIBE']) {
  test(`${kind} example selects local data after either a live example or a manual endpoint`, async ({
    page,
  }) => {
    const requests: string[] = [];
    for (const url of [
      'https://query.wikidata.org/sparql**',
      'https://custom.example/**',
    ]) {
      await page.route(url, (route) => {
        requests.push(route.request().url());
        return route.abort();
      });
    }
    await page.goto('/');
    for (const previous of ['example', 'manual']) {
      if (previous === 'example') {
        await page
          .getByRole('button', { name: 'Examples', exact: true })
          .click();
        await page
          .getByRole('menuitem', { name: 'Gallery', exact: true })
          .click();
        await expect(page.locator('#active-endpoint')).toHaveText(
          'Endpoint: https://query.wikidata.org/sparql',
        );
      } else {
        await page
          .getByRole('button', { name: 'IDE settings', exact: true })
          .click();
        await page
          .getByLabel('SPARQL endpoint', { exact: true })
          .fill('https://custom.example/sparql');
        await page
          .getByRole('button', { name: 'Add header', exact: true })
          .click();
        await page.locator('.header-name').fill('Authorization');
        await page.locator('.header-value').fill('Bearer example-only');
        await page
          .getByRole('button', { name: 'Apply endpoint', exact: true })
          .click();
        await expect(page.locator('#active-endpoint')).toHaveText(
          'Endpoint: https://custom.example/sparql',
        );
        await page
          .getByRole('button', { name: 'IDE settings', exact: true })
          .click();
      }
      await page.getByRole('button', { name: 'Examples', exact: true }).click();
      await page
        .getByRole('menuitem', { name: `${kind} example`, exact: true })
        .click();
      await expect(page.locator('#active-endpoint')).toHaveText(
        'Local fixture (no endpoint)',
      );
      await page
        .getByRole('button', { name: 'Run query', exact: true })
        .click();
      if (kind === 'ASK')
        await expect(page.locator('.ldforge-boolean')).toHaveAttribute(
          'data-value',
          'true',
        );
      else {
        await expect(page.locator('table.ldforge-table tbody tr')).toHaveCount(
          3,
        );
        if (kind === 'DESCRIBE')
          await expect(page.getByRole('table')).toContainText(
            'Lokale DESCRIBE-demodataset',
          );
      }
      expect(requests).toEqual([]);
      await page
        .getByRole('button', { name: 'IDE settings', exact: true })
        .click();
      await expect(
        page.getByLabel('SPARQL endpoint', { exact: true }),
      ).toHaveValue('');
      await expect(page.locator('.header-row')).toHaveCount(0);
      await page
        .getByRole('button', { name: 'IDE settings', exact: true })
        .click();
    }
    await page.reload();
    await expect(page.locator('#active-endpoint')).toHaveText(
      'Local fixture (no endpoint)',
    );
    expect(requests).toEqual([]);
  });
}
