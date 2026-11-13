import { afterEach, describe, expect, it, vi } from 'vitest';
import { buttonGroupTypes, createEditor } from '@ldforge/editor';
import type { ForgeEditor } from '@ldforge/editor';
import type { ButtonPlugin } from '@ldforge/core';

const editors: ForgeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});
function mount(options: Partial<Parameters<typeof createEditor>[1]> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = createEditor(host, {
    executor: { execute: async () => ({ kind: 'boolean', value: true }) },
    ...options,
  });
  editors.push(editor);
  return { host, editor, toolbar: editor.getToolBar() };
}
function button(id: string): ButtonPlugin {
  return {
    id,
    label: id,
    execute(context) {
      context.setQuery(`ASK { # ${id}\n}`);
    },
  };
}

describe('live toolbar API', () => {
  it('creates detached reusable buttons, moves them between groups and updates labels/actions', async () => {
    const { toolbar, host, editor } = mount();
    expect(editor.getToolBar()).toBe(toolbar);
    const first = toolbar.createButton(button('first'));
    expect(first.isAttached).toBe(false);
    expect(toolbar.getButton('first')).toBe(first);
    const group = toolbar.addButtonGroup({
      id: 'examples',
      label: 'Examples',
      buttons: [first],
    });
    expect(group.type).toBe(buttonGroupTypes.buttons);
    expect(first.groupId).toBe('examples');
    expect(group.getButtons()).toEqual([first]);
    group.addButton(button('second'));
    const menu = toolbar.addButtonGroup({
      id: 'menu',
      type: buttonGroupTypes.dropdown,
      label: 'Menu',
    });
    menu.addButton(first);
    expect(group.getButtons().map((item) => item.id)).toEqual(['second']);
    first.update({ label: { en: 'Changed', nl: 'Gewijzigd' } });
    host.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.click();
    const action = host.querySelector<HTMLButtonElement>('[role="menuitem"]');
    expect(action?.textContent).toBe('Changed');
    action?.click();
    await vi.waitFor(() => expect(editor.getQuery()).toContain('first'));
    expect(
      host
        .querySelector('[aria-haspopup="menu"]')
        ?.getAttribute('aria-expanded'),
    ).toBe('false');
    toolbar.addButton(first);
    expect(first.groupId).toBeUndefined();
    expect(first.isAttached).toBe(true);
    expect(menu.getButtons()).toHaveLength(0);
    expect(
      host.querySelector('.ldforge-standalone-button')?.getAttribute('role'),
    ).toBeNull();
    editor.setLocale('nl');
    expect(host.querySelector('.ldforge-standalone-button')?.textContent).toBe(
      'Gewijzigd',
    );
    expect(
      toolbar.getButtons().filter((item) => item.id === 'first'),
    ).toHaveLength(1);
    expect(first.getPlugin().label).toEqual({ en: 'Changed', nl: 'Gewijzigd' });
  });
  it('supports configured dropdown groups and updates disabled menu items with editor state', () => {
    const { host, editor } = mount({
      buttons: [
        { ...button('one'), group: 'examples' },
        {
          ...button('two'),
          group: 'examples',
          isDisabled: (context) => !context.getQuery(),
        },
      ],
      toolbar: {
        groups: [
          {
            id: 'examples',
            type: 'dropdown',
            label: { en: 'Example queries', nl: 'Voorbeeldqueries' },
          },
        ],
      },
    });
    const trigger = host.querySelector<HTMLButtonElement>(
      '[aria-haspopup="menu"]',
    );
    trigger?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement?.textContent).toBe('one');
    const items = host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    expect(items[1]?.disabled).toBe(true);
    editor.setQuery('ASK {}');
    expect(items[1]?.disabled).toBe(false);
    items[0]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    expect(document.activeElement?.textContent).toBe('two');
    items[1]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
    );
    expect(document.activeElement?.textContent).toBe('one');
    items[0]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End', bubbles: true }),
    );
    expect(document.activeElement?.textContent).toBe('two');
    items[1]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(document.activeElement).toBe(trigger);
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    editor.setLocale('nl');
    expect(trigger?.textContent).toBe('Voorbeeldqueries');
  });
  it('changes group presentation at runtime, hides empty groups and deletes contained buttons', () => {
    const { toolbar, host, editor } = mount();
    const group = toolbar.addButtonGroup({
      id: 'runtime',
      label: 'Runtime',
      buttons: [button('test')],
    });
    const handle = group.getButtons()[0];
    group.setType('dropdown');
    group.setLabel('Actions');
    expect(host.querySelector('[aria-haspopup="menu"]')?.textContent).toBe(
      'Actions',
    );
    group.setType('buttons');
    expect(
      host.querySelector(
        '[data-button-group="runtime"] [aria-haspopup="menu"]',
      ),
    ).toBeNull();
    group.delete();
    expect(handle?.isDeleted).toBe(true);
    expect(toolbar.getButton('test')).toBeUndefined();
    expect(() => group.addButton(button('again'))).toThrow('deleted');
    const detached = toolbar.createButton(button('detached'));
    detached.delete();
    expect(() => toolbar.addButton(detached)).toThrow('deleted');
    editor.destroy();
    expect(() => toolbar.addButton(button('late'))).toThrow('destroyed');
    expect(() => editor.getToolBar()).toThrow('destroyed');
  });
  it('rejects duplicate identities, foreign handles and moving reserved actions into custom groups', () => {
    const { toolbar } = mount();
    const other = mount().toolbar.createButton(button('foreign'));
    toolbar.addButton(button('unique'));
    expect(() => toolbar.createButton(button('unique'))).toThrow('Duplicate');
    expect(() => toolbar.addButton(other)).toThrow('another toolbar');
    const group = toolbar.addButtonGroup({ id: 'group' });
    expect(() => toolbar.addButtonGroup({ id: 'group' })).toThrow('Duplicate');
    const run = toolbar.getButton('run');
    if (!run) throw new Error('Run missing');
    expect(() => group.addButton(run)).toThrow('Run and Cancel');
    expect(() =>
      toolbar.addButtonGroup({
        id: 'duplicate-items',
        buttons: [button('same'), button('same')],
      }),
    ).toThrow('Duplicate');
    expect(toolbar.getButtonGroup('duplicate-items')).toBeUndefined();
    expect(toolbar.getGroups()).toEqual([group]);
  });
});

it('supports typeahead, Tab dismissal and all-disabled dropdowns', () => {
  const { toolbar, host, editor } = mount();
  const disabled = (
    context: Parameters<NonNullable<ButtonPlugin['isDisabled']>>[0],
  ) => context.getQuery() === 'disabled';
  const group = toolbar.addButtonGroup({
    id: 'keyboard',
    type: 'dropdown',
    label: 'Keyboard',
    buttons: [
      { ...button('Alpha'), isDisabled: disabled },
      { ...button('Beta'), isDisabled: disabled },
    ],
  });
  const trigger = host.querySelector<HTMLButtonElement>(
    '[aria-haspopup="menu"]',
  );
  trigger?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }),
  );
  expect(document.activeElement?.textContent).toBe('Beta');
  document.activeElement?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'a', bubbles: true }),
  );
  expect(document.activeElement?.textContent).toBe('Alpha');
  document.activeElement?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
  );
  expect(trigger?.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(trigger);
  editor.setQuery('disabled');
  expect(trigger?.disabled).toBe(true);
  group.delete();
  expect(host.querySelector('[data-button-group="keyboard"]')).toBeNull();
});

it('reports runtime action failures and updates standalone disabled state', async () => {
  const { toolbar, host } = mount();
  const action = toolbar.addButton({
    id: 'failure',
    label: 'Fail',
    execute: () => Promise.reject('Runtime failure'),
  });
  host.querySelector<HTMLButtonElement>('.ldforge-standalone-button')?.click();
  await vi.waitFor(() =>
    expect(host.querySelector('.ldforge-status')?.textContent).toBe(
      'Action failed: Runtime failure',
    ),
  );
  action.update({ isDisabled: () => true, title: 'Unavailable' });
  const node = host.querySelector<HTMLButtonElement>(
    '.ldforge-standalone-button',
  );
  expect(node?.disabled).toBe(true);
  expect(node?.title).toBe('Unavailable');
});

it('mounts declarative group actions and cleans up an invalid initial configuration', () => {
  const configured = mount({
    toolbar: {
      groups: [
        {
          id: 'configured',
          type: 'dropdown',
          label: 'Configured',
          buttons: [button('configured-action')],
        },
      ],
    },
  });
  expect(
    configured.toolbar.getButtonGroup('configured')?.getButtons()[0]?.id,
  ).toBe('configured-action');
  const host = document.createElement('div');
  document.body.append(host);
  expect(() =>
    createEditor(host, {
      executor: { execute: async () => ({ kind: 'boolean', value: true }) },
      toolbar: { groups: [{ id: 'duplicate' }, { id: 'duplicate' }] },
    }),
  ).toThrow('Duplicate');
  expect(host.children).toHaveLength(0);
});
