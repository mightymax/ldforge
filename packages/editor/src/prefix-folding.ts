import type { EditorState, Extension, StateEffect } from '@codemirror/state';
import {
  codeFolding,
  foldEffect,
  foldGutter,
  foldedRanges,
  foldService,
  unfoldEffect,
} from '@codemirror/language';
import type { EditorView } from '@codemirror/view';
import { prefixDeclarations } from './sparql/analysis.js';

/** Separate PREFIX groups never hide BASE declarations or executable query text. */
export function prefixFoldRanges(
  state: EditorState,
): { from: number; to: number }[] {
  const groups: { from: number; to: number }[] = [];
  for (const declaration of prefixDeclarations(state)) {
    const last = groups.at(-1);
    const gap = last ? state.sliceDoc(last.to, declaration.from) : '';
    if (last && !gap.replace(/#[^\n]*/g, '').trim()) last.to = declaration.to;
    else groups.push({ from: declaration.from + 6, to: declaration.to });
  }
  return groups;
}

export function prefixesCollapsed(state: EditorState): boolean {
  const ranges = prefixFoldRanges(state);
  return (
    ranges.length > 0 &&
    ranges.every((range) => {
      let folded = false;
      foldedRanges(state).between(range.from, range.to, (from, to) => {
        if (from <= range.from && to >= range.to) folded = true;
      });
      return folded;
    })
  );
}

export function setPrefixesCollapsed(
  view: EditorView,
  collapsed: boolean,
): void {
  const ranges = prefixFoldRanges(view.state);
  if (collapsed) {
    view.dispatch({ effects: ranges.map((range) => foldEffect.of(range)) });
  } else {
    const effects: StateEffect<{ from: number; to: number }>[] = [];
    foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
      if (ranges.some((range) => from <= range.from && to >= range.to))
        effects.push(unfoldEffect.of({ from, to }));
    });
    view.dispatch({ effects });
  }
}

export function prefixFolding(showGutter: boolean): Extension {
  return [
    codeFolding({ placeholderText: '…' }),
    foldService.of(
      (state, lineStart, lineEnd) =>
        prefixFoldRanges(state).find(
          (range) => range.from >= lineStart && range.from <= lineEnd,
        ) ?? null,
    ),
    ...(showGutter ? [foldGutter()] : []),
  ];
}
