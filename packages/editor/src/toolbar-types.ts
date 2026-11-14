import type { ButtonPlugin, LocalizedText, PluginIcon } from '@ldforge/core';

export const buttonGroupTypes = Object.freeze({
  buttons: 'buttons',
  dropdown: 'dropdown',
} as const);
export type ButtonGroupType =
  (typeof buttonGroupTypes)[keyof typeof buttonGroupTypes];
export type ToolbarButtonUpdate = Partial<Omit<ButtonPlugin, 'id' | 'group'>>;
export interface ToolbarButtonHandle {
  readonly id: string;
  readonly label: LocalizedText;
  readonly groupId: string | undefined;
  readonly isAttached: boolean;
  readonly isDeleted: boolean;
  getPlugin(): ButtonPlugin;
  update(changes: ToolbarButtonUpdate): void;
  delete(): void;
}
export type ToolbarButtonInput = ButtonPlugin | ToolbarButtonHandle;
export interface ButtonGroupOptions {
  readonly id: string;
  readonly type?: ButtonGroupType;
  readonly label?: LocalizedText;
  readonly icon?: PluginIcon;
  /** Preferred dropdown width in pixels, clamped to the viewport. */
  readonly dropdownWidth?: number;
  readonly buttons?: readonly ToolbarButtonInput[];
}
export interface ToolbarOptions {
  /** Presentation of existing plugin groups and/or additional groups with buttons. */
  readonly groups?: readonly ButtonGroupOptions[];
}
export interface ToolbarButtonGroupHandle {
  readonly id: string;
  readonly type: ButtonGroupType;
  readonly label: LocalizedText;
  readonly isDeleted: boolean;
  addButton(button: ToolbarButtonInput): ToolbarButtonHandle;
  /** Insert a non-focusable divider before an existing button in this group. */
  addSeparator(beforeButtonId: string): void;
  getButtons(): readonly ToolbarButtonHandle[];
  setType(type: ButtonGroupType): void;
  setLabel(label: LocalizedText): void;
  delete(): void;
}
export interface ToolbarApi {
  /** Mount a standalone button; passing a handle moves it rather than duplicating it. */
  addButton(button: ToolbarButtonInput): ToolbarButtonHandle;
  /** Register a reusable button without mounting it yet. */
  createButton(button: ButtonPlugin): ToolbarButtonHandle;
  addButtonGroup(options: ButtonGroupOptions): ToolbarButtonGroupHandle;
  getButton(id: string): ToolbarButtonHandle | undefined;
  getButtonGroup(id: string): ToolbarButtonGroupHandle | undefined;
  /** Registered live buttons, including detached createButton() handles. */
  getButtons(): readonly ToolbarButtonHandle[];
  /** Custom groups; the built-in Run/Cancel group is managed separately. */
  getGroups(): readonly ToolbarButtonGroupHandle[];
}
