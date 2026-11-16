import { afterEach, describe, expect, it } from 'vitest';
import { createEditor } from '@ldforge/editor';
import type { ForgeEditor } from '@ldforge/editor';
import type { ResultRendererPlugin } from '@ldforge/core';
import { createTreeRenderer } from '@ldforge/tree';
import { createChartRenderer } from '@ldforge/charts';
import { createGeoRenderer } from '@ldforge/geo';
import { createTableRenderer, createBooleanRenderer } from '@ldforge/renderers';
import {
  applyRendererHeader,
  generateRendererHeader,
} from '../packages/editor/src/renderer-header.js';
const renderers = [
  createTableRenderer(),
  createChartRenderer(),
  createGeoRenderer(),
  createBooleanRenderer(),
];
const editors: ForgeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});
function mount(options: Partial<Parameters<typeof createEditor>[1]> = {}) {
  const node = document.createElement('div');
  document.body.append(node);
  const editor = createEditor(node, {
    executor: { execute: async () => ({ kind: 'boolean', value: true }) },
    renderers,
    ...options,
  });
  editors.push(editor);
  return { node, editor };
}
function click(node: HTMLElement, text: string) {
  const button = [...node.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === text,
  );
  if (!button) throw Error(`No button ${text}`);
  button.click();
}
describe('registered renderer headers', () => {
  it('generates validated options and localized binding contracts from plugin metadata', () => {
    const header = generateRendererHeader(
      renderers,
      {
        rendererId: 'charts',
        options: { chart: 'pie', 'chart-title': 'Quotes " and ; separators' },
      },
      'nl',
    );
    expect(header).toContain(
      '# view=charts; chart=pie; chart-title="Quotes \\" and ; separators"',
    );
    expect(header).toContain('?chart_label (verplicht)');
    expect(header).toContain('ldforge-bindings:start');
    const treeHeader = generateRendererHeader(
      [createTreeRenderer()],
      { rendererId: 'tree', options: { 'tree-title': 'Concepts' } },
      'en',
    );
    expect(treeHeader).toContain('# view=tree; tree-title=Concepts');
    expect(treeHeader).toContain('?tree_id (required)');
    expect(treeHeader).toContain('?tree_parent');
    expect(
      generateRendererHeader(renderers, { rendererId: 'boolean' }, 'en'),
    ).toContain('Requires a boolean ASK result');
    expect(
      generateRendererHeader(
        renderers,
        { rendererId: 'geo', options: { mode: '3d' }, includeBindings: false },
        'en',
      ),
    ).toBe('# view=geo; mode=3d');
  });
  it('rejects unregistered plugins, unknown options, unsupported values and line injection', () => {
    expect(() =>
      generateRendererHeader(
        [renderers[0] as ResultRendererPlugin],
        { rendererId: 'charts' },
        'en',
      ),
    ).toThrow('not registered');
    expect(() =>
      generateRendererHeader(
        renderers,
        { rendererId: 'charts', options: { unknown: 'x' } },
        'en',
      ),
    ).toThrow('Unknown');
    expect(() =>
      generateRendererHeader(
        renderers,
        { rendererId: 'charts', options: { chart: 'html' } },
        'en',
      ),
    ).toThrow('Invalid');
    expect(() =>
      generateRendererHeader(
        renderers,
        { rendererId: 'charts', options: { 'chart-title': 'bad\nSELECT *' } },
        'en',
      ),
    ).toThrow('single line');
  });
  it('replaces managed directives/contracts once and preserves body, CSS, host directives and comments', () => {
    const original =
      '# view=charts; chart=bar; host="keep; this"\n# css=color: red; font-size: 12px\n# My own comment\n# ldforge-bindings:start\n# old contract\n# ldforge-bindings:end\nPREFIX ex: <https://example.org/>\nSELECT * WHERE { ?s ?p ?o }\n# view=inline-body-comment';
    const header = generateRendererHeader(
      renderers,
      { rendererId: 'geo', options: { mode: '3d' } },
      'en',
    );
    const applied = applyRendererHeader(original, header, renderers);
    expect(applied).toContain('# host="keep; this"');
    expect(applied).toContain('# css=color: red; font-size: 12px');
    expect(applied).toContain('# My own comment');
    expect(applied).toContain(
      'PREFIX ex: <https://example.org/>\nSELECT * WHERE { ?s ?p ?o }\n# view=inline-body-comment',
    );
    expect(applied).not.toContain('old contract');
    expect(applied).not.toContain('chart=bar');
    expect(applyRendererHeader(applied, header, renderers)).toBe(applied);
  });
  it('supports custom renderers without metadata and retains an incomplete-contract query body', () => {
    const plugin: ResultRendererPlugin = {
      id: 'custom',
      label: 'Custom',
      supports: () => true,
      render: () => {},
    };
    expect(
      generateRendererHeader([plugin], { rendererId: 'custom' }, 'en'),
    ).toBe('# view=custom');
    expect(
      applyRendererHeader(
        '# ldforge-bindings:start\n# old\nSELECT * WHERE {}',
        '# view=custom',
        [plugin],
      ),
    ).toContain('SELECT * WHERE {}');
  });
});
describe('plugin wizard API and dialog', () => {
  it('is enabled by default, lists registered plugins only, generates without editing and applies one undoable edit', () => {
    const { node, editor } = mount({ query: 'SELECT * WHERE { ?s ?p ?o }' });
    const wizard = editor.getRendererWizard();
    expect(wizard.isVisible).toBe(true);
    expect(editor.getRenderers().map((renderer) => renderer.id)).toEqual([
      'table',
      'charts',
      'geo',
      'boolean',
    ]);
    expect(wizard.getRenderers()).toEqual(editor.getRenderers());
    expect(
      node.querySelector<HTMLButtonElement>('[aria-label="Plugin wizard"]')
        ?.title,
    ).toBe('Plugin wizard');
    const generated = wizard.generate({
      rendererId: 'charts',
      options: { chart: 'line' },
    });
    expect(generated).toContain('chart=line');
    expect(editor.getQuery()).toBe('SELECT * WHERE { ?s ?p ?o }');
    wizard.apply({ rendererId: 'charts', options: { chart: 'line' } });
    expect(editor.getQuery()).toContain('?chart_value (required)');
    expect(editor.getQuery()).toContain('SELECT * WHERE');
  });
  it('supports config/API hiding while keeping programmatic header generation and opening available', () => {
    const { node, editor } = mount({ controls: { rendererWizard: false } });
    const wizard = editor.getRendererWizard();
    expect(node.querySelector('.ldforge-wizard-toggle')).toBeNull();
    expect(wizard.isVisible).toBe(false);
    wizard.open();
    expect(wizard.isOpen).toBe(true);
    wizard.setVisible(false);
    expect(wizard.isOpen).toBe(false);
    wizard.setVisible(true);
    expect(wizard.isVisible).toBe(true);
    wizard.open();
    wizard.close();
    expect(wizard.isOpen).toBe(false);
    expect(wizard.generate({ rendererId: 'table' })).toContain('view=table');
  });
  it('navigates all steps, configures a registered renderer, previews/toggles bindings and applies', () => {
    const { node, editor } = mount({ query: 'SELECT * WHERE { ?s ?p ?o }' });
    const wizard = editor.getRendererWizard();
    wizard.open();
    const dialog = node.querySelector('dialog');
    if (!dialog) throw Error('Missing dialog');
    const choices = dialog.querySelectorAll<HTMLInputElement>('[type=radio]');
    expect(choices.length).toBe(4);
    const chartChoice = dialog.querySelector<HTMLInputElement>(
      '[type=radio][value=charts]',
    );
    if (!chartChoice) throw Error('Missing chart choice');
    chartChoice.checked = true;
    chartChoice.dispatchEvent(new Event('change'));
    click(dialog, 'Next');
    const chart = dialog.querySelector<HTMLSelectElement>(
      '[aria-label="Chart type"]',
    );
    if (!chart) throw Error('Missing chart types');
    chart.value = 'pie';
    chart.dispatchEvent(new Event('input'));
    const title = dialog.querySelector<HTMLInputElement>(
      '[aria-label="Title"]',
    );
    if (title) {
      title.value = 'My chart';
      title.dispatchEvent(new Event('input'));
    }
    click(dialog, 'Next');
    expect(dialog.querySelector('textarea')?.value).toContain('chart=pie');
    expect(dialog.querySelector('textarea')?.value).toContain('My chart');
    const checkbox = dialog.querySelector<HTMLInputElement>('[type=checkbox]');
    if (!checkbox) throw Error('Missing checkbox');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    expect(dialog.querySelector('textarea')?.value).not.toContain(
      'chart_value',
    );
    click(dialog, 'Back');
    click(dialog, 'Next');
    click(dialog, 'Apply to query');
    expect(wizard.isOpen).toBe(false);
    expect(editor.getQuery()).toContain('chart=pie');
    expect(editor.getQuery()).not.toContain('ldforge-bindings:start');
  });
  it('guards against applying to a different tab, refreshes locale and cleans up', () => {
    const { node, editor } = mount();
    const wizard = editor.getRendererWizard();
    wizard.open();
    click(node.querySelector('dialog') as HTMLElement, 'Next');
    editor.setLocale('nl');
    expect(node.querySelector('dialog h3')?.textContent).toBe('Kies de opties');
    click(node.querySelector('dialog') as HTMLElement, 'Volgende');
    editor.getTabs().addTab({ query: 'ASK {}' });
    click(node.querySelector('dialog') as HTMLElement, 'Toepassen op query');
    expect(editor.getQuery()).toBe('ASK {}');
    expect(node.querySelector('dialog [role=alert]')?.textContent).toContain(
      'actieve query',
    );
    node
      .querySelector('dialog')
      ?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    expect(wizard.isOpen).toBe(false);
    wizard.open();
    editor.destroy();
    expect(() => wizard.generate({ rendererId: 'table' })).toThrow('destroyed');
    expect(node.querySelector('dialog')).toBeNull();
  });
  it('handles no registered renderers and custom renderers with no options', () => {
    const { node, editor } = mount({ renderers: [] });
    editor.getRendererWizard().open();
    expect(node.querySelector('dialog')?.textContent).toContain(
      'No registered',
    );
    const custom = mount({
      renderers: [
        {
          id: 'custom',
          label: 'Custom',
          supports: () => true,
          render: () => {},
        },
      ],
    });
    custom.editor.getRendererWizard().open();
    const dialog = custom.node.querySelector('dialog') as HTMLElement;
    click(dialog, 'Next');
    expect(dialog.textContent).toContain('no header options');
    click(dialog, 'Next');
    expect(dialog.textContent).toContain('does not declare');
  });
});
