import { describe, expect, it } from 'vitest';
import { createGeoPopup } from '../packages/geo/src/popup.js';
import { buildGeoFeatures } from '../packages/geo/src/model.js';

describe('geo popup contract', () => {
  it('retains the new optional bindings without changing geometry or labels', () => {
    const features = buildGeoFeatures({
      kind: 'bindings',
      variables: ['geometry', 'geoImage', 'geoDescription', 'geoLink'],
      bindings: [
        {
          geometry: { type: 'literal', value: 'POINT(5 52)' },
          geoImage: { type: 'uri', value: 'https://example.org/photo.jpg' },
          geoDescription: { type: 'literal', value: 'A track' },
          geoLink: { type: 'literal', value: 'https://example.org/track' },
        },
      ],
    });
    expect(features[0]?.properties).toEqual({
      label: '#1',
      image: 'https://example.org/photo.jpg',
      description: 'A track',
      link: 'https://example.org/track',
    });
  });
  it('renders safe linked labels, image and plain-text descriptions', () => {
    const popup = createGeoPopup(document, {
      label: '<script>label</script>',
      height: 10,
      image: 'https://example.org/photo.jpg',
      description: '<b>Description</b>\nNext line',
      link: 'https://example.org/track',
    });
    const link = popup.querySelector('a');
    expect(link?.textContent).toBe('<script>label</script>');
    expect(link?.href).toBe('https://example.org/track');
    expect(link?.target).toBe('_blank');
    expect(link?.rel).toBe('noopener noreferrer');
    expect(popup.querySelector('script')).toBeNull();
    expect(popup.querySelector('b')).toBeNull();
    expect(popup.querySelector('p')?.textContent).toBe(
      '<b>Description</b>\nNext line',
    );
    const image = popup.querySelector('img');
    expect(image?.src).toBe('https://example.org/photo.jpg');
    expect(image?.alt).toBe('<script>label</script>');
    expect(image?.style.maxHeight).toBe('160px');
    image?.dispatchEvent(new Event('error'));
    expect(popup.querySelector('img')).toBeNull();
    expect(popup.querySelector('a')).not.toBeNull();
  });
  it.each([
    'javascript:alert(1)',
    'data:image/svg+xml,<svg/>',
    'file:///tmp/image.png',
    '/relative.jpg',
    'bad URL',
    '',
    '   ',
  ])('omits unsafe or invalid URL %s while preserving popup text', (url) => {
    const popup = createGeoPopup(document, {
      label: 'Track',
      image: url,
      link: url,
    });
    expect(popup.querySelector('a,img')).toBeNull();
    expect(popup.textContent).toBe('Track');
  });
  it('handles missing or malformed properties and accepts HTTP URLs', () => {
    expect(createGeoPopup(document).textContent).toBe('');
    const popup = createGeoPopup(document, {
      label: 42,
      description: '  ',
      image: 12,
      link: 42,
    });
    expect(popup.querySelector('p,a,img')).toBeNull();
    expect(
      createGeoPopup(document, {
        image: 'http://example.org/image',
        link: 'http://example.org/',
      }).querySelector('a')?.href,
    ).toBe('http://example.org/');
  });
});
