import { expect, it } from 'vitest';
import { createTimelineImage } from '../packages/timeline/src/image.js';
import { buildTimelineModel } from '@ldforge/timeline';
it('retains optional image bindings and uses safe DOM thumbnails and details', () => {
  const items = buildTimelineModel({
    kind: 'bindings',
    variables: ['timelineLabel', 'timelineStart', 'timelineImage'],
    bindings: [
      {
        timelineLabel: { type: 'literal', value: 'Artist' },
        timelineStart: { type: 'literal', value: '1900' },
        timelineImage: {
          type: 'uri',
          value: 'https://example.org/portrait.jpg',
        },
      },
    ],
  });
  expect(items[0]?.image).toBe('https://example.org/portrait.jpg');
  const thumbnail = createTimelineImage(
    document,
    items[0]?.image,
    'Artist',
    true,
  );
  expect(thumbnail?.style.width).toBe('32px');
  expect(thumbnail?.alt).toBe('');
  const image = createTimelineImage(
    document,
    items[0]?.image,
    '<img onerror=alert(1)>',
  );
  expect(image?.alt).toBe('<img onerror=alert(1)>');
  expect(image?.referrerPolicy).toBe('no-referrer');
  const host = document.createElement('div');
  if (image) host.append(image);
  image?.dispatchEvent(new Event('error'));
  expect(host.children).toHaveLength(0);
});
it.each([
  undefined,
  '',
  '/relative.jpg',
  'garbage',
  'javascript:alert(1)',
  'data:image/svg+xml,<svg/>',
])('omits invalid image %s', (value) =>
  expect(createTimelineImage(document, value, 'Artist')).toBeUndefined(),
);
