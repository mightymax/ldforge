import { createSvgIcon, localize, translate } from '@ldforge/core';
import type { ButtonPlugin, EditorContext, Locale } from '@ldforge/core';
import { appendIcon } from './icons.js';
import type {
  ButtonGroupOptions,
  ButtonGroupType,
  ToolbarApi,
  ToolbarButtonGroupHandle,
  ToolbarButtonHandle,
  ToolbarButtonInput,
  ToolbarOptions,
} from './toolbar-types.js';

interface ButtonRecord {
  plugin: ButtonPlugin;
  element: HTMLButtonElement;
  handle: ToolbarButtonHandle;
  group?: GroupRecord;
  attached: boolean;
  deleted: boolean;
}
interface GroupRecord {
  options: ButtonGroupOptions;
  type: ButtonGroupType;
  element: HTMLElement;
  menu: HTMLElement;
  trigger: HTMLButtonElement;
  items: ButtonRecord[];
  separators: Set<string>;
  handle: ToolbarButtonGroupHandle;
  deleted: boolean;
}
interface ToolbarHost {
  core: HTMLElement;
  custom: HTMLElement;
  context: EditorContext;
  getLocale(): Locale;
  isVisible(plugin: ButtonPlugin): boolean;
  assertAlive(): void;
  onError(error: unknown): void;
}
let toolbarNumber = 0;
const coreId = (id: string) => id === 'run' || id === 'cancel';
function validateType(type: string): asserts type is ButtonGroupType {
  if (type !== 'buttons' && type !== 'dropdown')
    throw new Error(`Unknown button group type: ${type}`);
}

/** Owns toolbar DOM, live handles and the listeners needed by dropdown menus. */
export function createToolbar(
  host: ToolbarHost,
  initial: readonly ButtonPlugin[],
  options: ToolbarOptions = {},
) {
  const doc = host.custom.ownerDocument;
  const win = doc.defaultView;
  const buttons = new Map<string, ButtonRecord>();
  const handles = new Map<ToolbarButtonHandle, ButtonRecord>();
  const groups = new Map<string, GroupRecord>();
  const coreGroups = new Map<string, HTMLElement>();
  const configuration = new Map<string, ButtonGroupOptions>();
  let disposed = false;
  let opened: GroupRecord | undefined;
  let prefix = '';
  let prefixTime = 0;
  for (const group of options.groups ?? []) {
    if (!group.id.trim() || configuration.has(group.id))
      throw new Error(`Duplicate or empty toolbar group: ${group.id}`);
    validateType(group.type ?? 'buttons');
    configuration.set(group.id, group);
  }
  function alive() {
    host.assertAlive();
    if (disposed) throw new Error('Toolbar has been destroyed.');
  }
  function groupLabel(group: GroupRecord) {
    return (
      group.options.label ??
      (group.options.id === 'examples'
        ? translate(host.getLocale(), 'examples')
        : group.options.id)
    );
  }
  function enabled(group: GroupRecord) {
    return group.items.filter(
      (item) => !item.element.disabled && !item.element.hidden,
    );
  }
  function close(restore = false) {
    if (!opened) return;
    const group = opened;
    opened = undefined;
    if (
      typeof group.menu.hidePopover === 'function' &&
      group.menu.matches(':popover-open')
    )
      group.menu.hidePopover();
    group.menu.hidden = true;
    group.trigger.setAttribute('aria-expanded', 'false');
    if (restore && group.trigger.isConnected) group.trigger.focus();
  }
  function position() {
    if (!opened || !win) return;
    const rect = opened.trigger.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > win.innerHeight) {
      close();
      return;
    }
    const menu = opened.menu;
    const width = Math.min(
      opened.options.dropdownWidth ?? Math.max(rect.width, 200),
      win.innerWidth - 16,
    );
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left, win.innerWidth - width - 8))}px`;
    const roomBelow = win.innerHeight - rect.bottom - 8;
    const roomAbove = rect.top - 8;
    const above =
      roomBelow < Math.min(menu.scrollHeight, 200) && roomAbove > roomBelow;
    menu.style.maxHeight = `${Math.max(60, above ? roomAbove - 4 : roomBelow - 4)}px`;
    menu.style.top = `${above ? Math.max(8, rect.top - Math.min(menu.scrollHeight, roomAbove - 4) - 4) : rect.bottom + 4}px`;
  }
  function open(group: GroupRecord, last = false) {
    if (disposed || !enabled(group).length) return;
    close();
    opened = group;
    prefix = '';
    group.menu.hidden = false;
    if (typeof group.menu.showPopover === 'function') group.menu.showPopover();
    else group.menu.removeAttribute('popover');
    group.trigger.setAttribute('aria-expanded', 'true');
    position();
    const items = enabled(group);
    (last ? items.at(-1) : items[0])?.element.focus();
  }
  function onPointer(event: PointerEvent) {
    if (!opened) return;
    const path = event.composedPath();
    if (!path.includes(opened.menu) && !path.includes(opened.trigger)) close();
  }
  function onKey(event: KeyboardEvent) {
    if (!opened) return;
    const group = opened;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (!event.composedPath().includes(group.menu)) return;
    if (event.key === 'Tab') {
      close(true);
      return;
    }
    const items = enabled(group);
    const index = items.findIndex((item) => item.element === doc.activeElement);
    let next: ButtonRecord | undefined;
    if (event.key === 'ArrowDown') next = items[(index + 1) % items.length];
    else if (event.key === 'ArrowUp')
      next = items[(index - 1 + items.length) % items.length];
    else if (event.key === 'Home') next = items[0];
    else if (event.key === 'End') next = items.at(-1);
    else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      event.key !== ' '
    ) {
      const now = Date.now();
      prefix =
        now - prefixTime < 600
          ? prefix + event.key.toLowerCase()
          : event.key.toLowerCase();
      prefixTime = now;
      const candidates = [
        ...items.slice(index + 1),
        ...items.slice(0, index + 1),
      ];
      next = candidates.find((item) =>
        localize(
          item.plugin.getLabel?.(host.context) ?? item.plugin.label,
          host.getLocale(),
        )
          .toLowerCase()
          .startsWith(prefix),
      );
    } else return;
    event.preventDefault();
    next?.element.focus();
  }
  doc.addEventListener('pointerdown', onPointer, true);
  doc.addEventListener('keydown', onKey);
  win?.addEventListener('resize', position);
  doc.addEventListener('scroll', position, true);

  function checkRecord(input: ToolbarButtonHandle): ButtonRecord {
    const record = handles.get(input);
    if (!record || record.deleted)
      throw new Error(
        'Button handle is deleted or belongs to another toolbar.',
      );
    return record;
  }
  function createButton(plugin: ButtonPlugin): ToolbarButtonHandle {
    alive();
    if (!plugin.id.trim() || buttons.has(plugin.id))
      throw new Error(`Duplicate or empty toolbar button: ${plugin.id}`);
    const element = doc.createElement('button');
    element.type = 'button';
    element.dataset.toolbarButton = plugin.id;
    const record = {
      plugin: { ...plugin },
      element,
      attached: false,
      deleted: false,
    } as ButtonRecord;
    const handle: ToolbarButtonHandle = Object.freeze<ToolbarButtonHandle>({
      get id() {
        return record.plugin.id;
      },
      get label() {
        return record.plugin.getLabel?.(host.context) ?? record.plugin.label;
      },
      get groupId() {
        return record.group?.options.id;
      },
      get isAttached() {
        return record.attached && !record.deleted && !disposed;
      },
      get isDeleted() {
        return record.deleted || disposed;
      },
      getPlugin() {
        alive();
        checkRecord(handle);
        return { ...record.plugin };
      },
      update(changes) {
        alive();
        checkRecord(handle);
        record.plugin = { ...record.plugin, ...changes, id: record.plugin.id };
        refresh();
      },
      delete() {
        alive();
        checkRecord(handle);
        if (opened === record.group) close(true);
        detach(record);
        record.deleted = true;
        buttons.delete(record.plugin.id);
        handles.delete(handle);
        refresh();
      },
    });
    record.handle = handle;
    buttons.set(plugin.id, record);
    handles.set(handle, record);
    element.addEventListener('click', () => {
      if (disposed || record.deleted || element.disabled || element.hidden)
        return;
      if (opened === record.group) close(true);
      void Promise.resolve()
        .then(() => {
          if (!disposed && !record.deleted)
            return record.plugin.execute(host.context);
        })
        .catch((error: unknown) => {
          if (!disposed) host.onError(error);
        });
    });
    refresh();
    return handle;
  }
  function detach(record: ButtonRecord) {
    if (record.group) {
      const group = record.group;
      group.items = group.items.filter((item) => item !== record);
      group.separators.delete(record.plugin.id);
      renderGroup(group);
    }
    delete record.group;
    record.attached = false;
    record.element.remove();
  }
  function inputRecord(input: ToolbarButtonInput): ButtonRecord {
    return 'execute' in input
      ? checkRecord(createButton(input))
      : checkRecord(input);
  }
  function attach(
    input: ToolbarButtonInput,
    group?: GroupRecord,
  ): ToolbarButtonHandle {
    alive();
    const id = input.id;
    if (group && coreId(id))
      throw new Error('Run and Cancel cannot be moved into custom groups.');
    const record = inputRecord(input);
    if (opened === record.group) close(true);
    detach(record);
    record.attached = true;
    record.element.classList.remove('ldforge-standalone-button');
    record.element.removeAttribute('role');
    record.element.removeAttribute('tabindex');
    if (group) {
      record.group = group;
      group.items.push(record);
      renderGroup(group);
    } else if (coreId(id)) {
      let wrapper = coreGroups.get(record.plugin.group ?? 'query');
      if (!wrapper) {
        wrapper = doc.createElement('div');
        wrapper.className = 'ldforge-button-group';
        wrapper.dataset.buttonGroup = record.plugin.group ?? 'query';
        wrapper.setAttribute('role', 'group');
        host.core.append(wrapper);
        coreGroups.set(record.plugin.group ?? 'query', wrapper);
      }
      wrapper.append(record.element);
    } else {
      record.element.classList.add('ldforge-standalone-button');
      host.custom.append(record.element);
    }
    refresh();
    return record.handle;
  }
  function renderGroup(group: GroupRecord) {
    if (opened === group) close();
    group.element.replaceChildren();
    group.menu.replaceChildren();
    group.element.className =
      group.type === 'dropdown'
        ? 'ldforge-toolbar-dropdown'
        : 'ldforge-button-group';
    if (group.type === 'dropdown') {
      group.element.append(group.trigger, group.menu);
      for (const item of group.items) {
        if (group.separators.has(item.plugin.id)) {
          const separator = doc.createElement('div');
          separator.className = 'ldforge-toolbar-separator';
          separator.setAttribute('role', 'separator');
          separator.setAttribute('aria-orientation', 'horizontal');
          group.menu.append(separator);
        }
        item.element.setAttribute('role', 'menuitem');
        item.element.tabIndex = -1;
        group.menu.append(item.element);
      }
    } else
      for (const item of group.items) {
        item.element.removeAttribute('role');
        item.element.removeAttribute('tabindex');
        group.element.append(item.element);
      }
  }
  function addButtonGroup(
    options: ButtonGroupOptions,
  ): ToolbarButtonGroupHandle {
    alive();
    if (!options.id.trim() || groups.has(options.id))
      throw new Error(`Duplicate or empty toolbar group: ${options.id}`);
    validateType(options.type ?? 'buttons');
    if (
      options.dropdownWidth !== undefined &&
      (!Number.isFinite(options.dropdownWidth) || options.dropdownWidth <= 0)
    )
      throw new Error('Dropdown width must be a positive finite number.');
    const pendingIds = new Set<string>();
    for (const input of options.buttons ?? []) {
      if (coreId(input.id))
        throw new Error('Run and Cancel cannot be moved into custom groups.');
      if (pendingIds.has(input.id))
        throw new Error(`Duplicate toolbar button: ${input.id}`);
      pendingIds.add(input.id);
      if ('execute' in input) {
        if (!input.id.trim() || buttons.has(input.id))
          throw new Error(`Duplicate or empty toolbar button: ${input.id}`);
      } else checkRecord(input);
    }
    const element = doc.createElement('div');
    element.dataset.buttonGroup = options.id;
    element.setAttribute('role', 'group');
    const trigger = doc.createElement('button');
    trigger.type = 'button';
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    const menu = doc.createElement('div');
    menu.className = 'ldforge-toolbar-menu';
    menu.id = `ldforge-toolbar-menu-${++toolbarNumber}`;
    menu.setAttribute('role', 'menu');
    menu.setAttribute('popover', 'manual');
    menu.hidden = true;
    trigger.setAttribute('aria-controls', menu.id);
    const group: GroupRecord = {
      get handle(): ToolbarButtonGroupHandle {
        return handle;
      },
      options: { ...options },
      type: options.type ?? 'buttons',
      element,
      trigger,
      menu,
      items: [],
      separators: new Set(),
      deleted: false,
    };
    function assertGroup() {
      alive();
      if (group.deleted) throw new Error('Button group has been deleted.');
    }
    const handle: ToolbarButtonGroupHandle =
      Object.freeze<ToolbarButtonGroupHandle>({
        get id() {
          return group.options.id;
        },
        get type() {
          return group.type;
        },
        get label() {
          return groupLabel(group);
        },
        get isDeleted() {
          return group.deleted || disposed;
        },
        addButton(input) {
          assertGroup();
          return attach(input, group);
        },
        addSeparator(beforeButtonId) {
          assertGroup();
          if (!group.items.some((item) => item.plugin.id === beforeButtonId))
            throw new Error(`Unknown button in group: ${beforeButtonId}`);
          group.separators.add(beforeButtonId);
          renderGroup(group);
          refresh();
        },
        getButtons() {
          assertGroup();
          return group.items.map((item) => item.handle);
        },
        setType(type) {
          assertGroup();
          validateType(type);
          if (opened === group) close(true);
          group.type = type;
          renderGroup(group);
          refresh();
        },
        setLabel(label) {
          assertGroup();
          group.options = { ...group.options, label };
          refresh();
        },
        delete() {
          assertGroup();
          if (opened === group) close(true);
          for (const item of [...group.items]) item.handle.delete();
          group.deleted = true;
          groups.delete(group.options.id);
          group.element.remove();
        },
      });
    groups.set(options.id, group);
    host.custom.append(element);
    trigger.addEventListener('click', () => {
      if (opened === group) close(true);
      else open(group);
    });
    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        open(group, event.key === 'ArrowUp');
      }
    });
    renderGroup(group);
    for (const input of options.buttons ?? []) attach(input, group);
    refresh();
    return handle;
  }
  function refresh() {
    if (disposed) return;
    const locale = host.getLocale();
    for (const record of buttons.values()) {
      const label = localize(
        record.plugin.getLabel?.(host.context) ?? record.plugin.label,
        locale,
      );
      const icon = record.plugin.getIcon
        ? record.plugin.getIcon(host.context)
        : record.plugin.icon;
      const title =
        record.plugin.getTitle?.(host.context) ?? record.plugin.title;
      const text = doc.createElement('span');
      text.className = 'ldforge-button-label';
      text.textContent = label;
      record.element.replaceChildren(text);
      record.element.setAttribute('aria-label', label);
      record.element.classList.toggle('ldforge-button-has-icon', Boolean(icon));
      appendIcon(record.element, icon);
      record.element.title = title ? localize(title, locale) : label;
      record.element.disabled =
        record.plugin.isDisabled?.(host.context) ?? false;
      record.element.hidden = !host.isVisible(record.plugin);
    }
    for (const group of groups.values()) {
      const label = localize(groupLabel(group), locale);
      group.element.setAttribute('aria-label', label);
      group.menu.setAttribute('aria-label', label);
      group.trigger.textContent = label;
      appendIcon(group.trigger, group.options.icon);
      appendIcon(group.trigger, createSvgIcon(['m7 10 5 5 5-5']));
      // Put the disclosure chevron after the label and optional leading icon.
      const chevron = group.trigger.firstElementChild;
      if (chevron) {
        chevron.classList.add('ldforge-dropdown-chevron');
        group.trigger.append(chevron);
      }
      let visibleBefore = false;
      for (const item of group.items) {
        const separator = item.element.previousElementSibling;
        if (separator?.getAttribute('role') === 'separator')
          (separator as HTMLElement).hidden =
            !visibleBefore || item.element.hidden;
        if (!item.element.hidden) visibleBefore = true;
      }
      group.trigger.disabled = enabled(group).length === 0;
      group.element.hidden = !group.items.some((item) => !item.element.hidden);
      if (
        opened === group &&
        (group.trigger.disabled || group.type !== 'dropdown')
      )
        close(true);
    }
    for (const wrapper of coreGroups.values()) {
      wrapper.setAttribute('aria-label', translate(locale, 'queryExecution'));
      wrapper.hidden = ![...wrapper.children].some(
        (child) => !(child as HTMLElement).hidden,
      );
    }
    position();
  }
  const api: ToolbarApi = Object.freeze<ToolbarApi>({
    addButton: (input) => attach(input),
    createButton,
    addButtonGroup,
    getButton(id) {
      alive();
      return buttons.get(id)?.handle;
    },
    getButtonGroup(id) {
      alive();
      return groups.get(id)?.handle;
    },
    getButtons() {
      alive();
      return [...buttons.values()].map((record) => record.handle);
    },
    getGroups() {
      alive();
      return [...groups.values()].map((record) => record.handle);
    },
  });
  function destroy() {
    if (disposed) return;
    close();
    disposed = true;
    doc.removeEventListener('pointerdown', onPointer, true);
    doc.removeEventListener('keydown', onKey);
    win?.removeEventListener('resize', position);
    doc.removeEventListener('scroll', position, true);
    buttons.clear();
    handles.clear();
    groups.clear();
    coreGroups.clear();
    host.core.replaceChildren();
    host.custom.replaceChildren();
  }
  try {
    for (const plugin of initial) {
      if (coreId(plugin.id)) attach(plugin);
      else {
        const id = plugin.group ?? 'actions';
        let group = groups.get(id);
        if (!group) {
          addButtonGroup({ ...configuration.get(id), id, buttons: [] });
          group = groups.get(id);
        }
        attach(plugin, group);
      }
    }
    for (const config of options.groups ?? []) {
      const group = groups.get(config.id);
      if (group) for (const input of config.buttons ?? []) attach(input, group);
      else addButtonGroup(config);
    }
  } catch (error) {
    destroy();
    throw error;
  }
  return { api, refresh, destroy };
}
