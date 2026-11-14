import { localize, parseQueryViewDirectives } from '@ldforge/core';
import type { Locale, ResultRendererPlugin } from '@ldforge/core';
export interface RendererHeaderConfig {
  readonly rendererId: string;
  readonly options?: Readonly<Record<string, string>>;
  readonly includeBindings?: boolean;
}
const start = '# ldforge-bindings:start';
const end = '# ldforge-bindings:end';
function quote(value: string): string {
  if (typeof value !== 'string')
    throw new Error('Header values must be strings.');
  if (/[\r\n]/.test(value))
    throw new Error('Header values must be a single line.');
  return /^[\w.-]+$/.test(value) ? value : JSON.stringify(value);
}
export function generateRendererHeader(
  renderers: readonly ResultRendererPlugin[],
  config: RendererHeaderConfig,
  locale: Locale,
): string {
  const renderer = renderers.find((item) => item.id === config.rendererId);
  if (!renderer)
    throw new Error(`Renderer is not registered: ${config.rendererId}`);
  const options = renderer.wizard?.options ?? [];
  for (const key of Object.keys(config.options ?? {}))
    if (!options.some((option) => option.key === key))
      throw new Error(`Unknown renderer option: ${key}`);
  const parts = [`view=${quote(renderer.id)}`];
  for (const option of options) {
    if (
      !/^[a-z][\w-]*$/.test(option.key) ||
      ['view', 'css'].includes(option.key)
    )
      throw new Error('Invalid renderer option key.');
    const value =
      config.options?.[option.key] ??
      option.defaultValue ??
      option.choices?.[0]?.value ??
      '';
    if (
      option.type === 'select' &&
      !option.choices?.some((choice) => choice.value === value)
    )
      throw new Error(`Invalid option value: ${option.key}`);
    if (value) parts.push(`${option.key}=${quote(value)}`);
  }
  const lines = [`# ${parts.join('; ')}`];
  if (
    config.includeBindings !== false &&
    (renderer.wizard?.bindings.length || renderer.wizard?.description)
  ) {
    lines.push(start);
    if (renderer.wizard?.description)
      lines.push(
        `# ${localize(renderer.wizard.description, locale).replace(/[\r\n]/g, ' ')}`,
      );
    for (const binding of renderer.wizard?.bindings ?? []) {
      const required =
        locale === 'nl'
          ? binding.required
            ? 'verplicht'
            : 'optioneel'
          : binding.required
            ? 'required'
            : 'optional';
      lines.push(
        `# ?${binding.variable.replace(/^\?/, '').replace(/[\r\n]/g, ' ')} (${required}): ${localize(binding.description, locale).replace(/[\r\n]/g, ' ')}`,
      );
    }
    lines.push(end);
  }
  return lines.join('\n');
}
/** Replace only leading renderer directives/managed contracts; retain query body, CSS and host comments. */
export function applyRendererHeader(
  query: string,
  header: string,
  renderers: readonly ResultRendererPlugin[],
): string {
  const keys = new Set([
    'view',
    ...renderers.flatMap((renderer) =>
      (renderer.wizard?.options ?? []).map((option) => option.key),
    ),
  ]);
  const lines = query.replace(/^\uFEFF/, '').split(/\r?\n/);
  const kept: string[] = [];
  let managed = false;
  let leading = true;
  for (const line of lines) {
    if (leading && line.trim() && !line.trimStart().startsWith('#')) {
      leading = false;
      managed = false;
    }
    if (!leading) {
      kept.push(line);
      continue;
    }
    if (line.trim() === start) {
      managed = true;
      continue;
    }
    if (line.trim() === end) {
      managed = false;
      continue;
    }
    if (managed) continue;
    const directives = parseQueryViewDirectives(line);
    const entries = Object.entries(directives);
    if (entries.some(([key]) => keys.has(key))) {
      for (const [key, value] of entries)
        if (!keys.has(key) && value !== undefined)
          kept.push(`# ${key}=${quote(value)}`);
    } else kept.push(line);
  }
  while (!kept[0]?.trim() && kept.length) kept.shift();
  return `${header}\n\n${kept.join('\n')}`;
}
