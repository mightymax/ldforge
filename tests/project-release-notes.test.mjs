import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectReleaseNotes } from '../scripts/project-release-notes.mjs';

const record = {
  releaseTag: 'release-20261117-180000-abcdef0',
  changesets: [
    { id: 'sharing', summary: 'Add short links for #11.' },
    { id: 'ldforge-bundle-test', summary: 'Bundle update.' },
  ],
  releases: [
    {
      name: '@ldforge/editor',
      oldVersion: '1.2.1',
      newVersion: '1.3.0',
      type: 'minor',
    },
    {
      name: '@ldforge/yasgui',
      oldVersion: '1.2.1',
      newVersion: '1.3.0',
      type: 'minor',
    },
  ],
};
test('records exact batch versions, one project-wide change list and verified issue references', () => {
  const notes = projectReleaseNotes(record);
  assert.match(notes, /Released: 2026-11-17/);
  assert.match(notes, /@ldforge\/editor\) \| 1\.2\.1 \| \[1\.3\.0\]/);
  assert.match(notes, /@ldforge\/yasgui/);
  assert.match(
    notes,
    /\[#11\]\(https:\/\/github.com\/mightymax\/ldforge\/issues\/11\)/,
  );
  assert.doesNotMatch(notes, /Bundle update/);
});
test('uses curated highlights and migration code matched by changeset, with a source comparison', () => {
  const notes = projectReleaseNotes({ ...record, previousTag: 'v1.0.0' }, [
    {
      changeset: 'sharing',
      title: 'Sharing release',
      highlights: ['Share queries: #14.'],
      migration: 'Use `copyShareLink()` from your custom action.',
    },
  ]);
  assert.match(notes, /^# Sharing release/);
  assert.match(notes, /copyShareLink/);
  assert.match(notes, /compare\/v1\.0\.0\.\.\.release-/);
  assert.doesNotMatch(notes, /Add short links/);
});
test('does not invent migration guarantees for historical releases and requires guidance for major APIs', () => {
  const major = {
    ...record,
    releases: [{ ...record.releases[0], type: 'major' }],
  };
  assert.throws(
    () => projectReleaseNotes(major),
    /explicit project upgrade guide/,
  );
  assert.match(
    projectReleaseNotes({ ...major, historical: true }),
    /reconstructed/,
  );
});
