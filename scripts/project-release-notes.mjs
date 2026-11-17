import {
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { format, resolveConfig } from 'prettier';

const repository = 'https://github.com/mightymax/ldforge';
const issueLinks = (text) =>
  text.replace(
    /(^|\s)#(\d+)\b/g,
    (_, before, number) =>
      `${before}[#${number}](${repository}/issues/${number})`,
  );

/** A single project narrative, independent of individual package changelogs. */
export function projectReleaseNotes(record, editorial = []) {
  const curated = editorial.find((note) =>
    record.changesets.some((change) => change.id === note.changeset),
  );
  if (
    !record.historical &&
    record.releases.some((release) => release.type === 'major') &&
    !curated?.migration
  )
    throw new Error(
      'Major releases require an explicit project upgrade guide.',
    );
  const date =
    record.date ??
    record.releaseTag.replace(/^release-(\d{4})(\d{2})(\d{2}).*$/, '$1-$2-$3');
  const title = curated?.title ?? record.title ?? record.releaseTag;
  const lines = [
    `# ${title}`,
    '',
    `Released: ${date}`,
    '',
    `[GitHub release](${repository}/releases/tag/${record.releaseTag}) · [Source](${repository}/tree/${record.releaseTag})`,
    '',
    '## Updated packages',
    '',
    '| Package | Previous | Released |',
    '| --- | --- | --- |',
    ...record.releases.map(
      (release) =>
        `| [${release.name}](https://www.npmjs.com/package/${release.name}) | ${release.oldVersion ?? 'First release'} | [${release.newVersion}](https://www.npmjs.com/package/${release.name}/v/${release.newVersion}) |`,
    ),
    '',
    '## What changed',
    '',
    ...(
      curated?.highlights ??
      record.changesets
        .filter((change) => !change.id.startsWith('ldforge-bundle-'))
        .map((change) => change.summary)
    ).map((summary) => `- ${issueLinks(summary.replace(/\n+/g, ' '))}`),
    '',
  ];
  if (curated?.migration)
    lines.push('## Upgrade guide', '', curated.migration, '');
  else
    lines.push(
      '## Upgrade guide',
      '',
      record.historical
        ? 'These historical notes are reconstructed from tagged package manifests and commit history. They are not a complete migration guide; consult the linked source comparison before upgrading across versions.'
        : 'No breaking API changes are recorded in this release. See the changes above for optional configuration and behavior changes.',
      '',
    );
  if (record.previousTag)
    lines.push(
      `[Compare changes](${repository}/compare/${record.previousTag}...${record.releaseTag})`,
      '',
    );
  if (record.historical)
    lines.push(
      'Historical entry: package versions come from the release tag; change descriptions come from commit subjects. Unpublished tags are not listed as releases.',
      '',
    );
  return lines.join('\n');
}

export function validateProjectReleaseNotes(root, record) {
  const editorialPath = join(root, 'docs/releases/editorial.json');
  const editorial = existsSync(editorialPath)
    ? JSON.parse(readFileSync(editorialPath, 'utf8'))
    : [];
  return projectReleaseNotes(record, editorial);
}

export async function writeProjectReleaseNotes(root, record) {
  if (!record.previousTag && existsSync(join(root, '.releases'))) {
    const previous = readdirSync(join(root, '.releases'))
      .filter(
        (file) =>
          file.endsWith('.json') && file.slice(0, -5) < record.releaseTag,
      )
      .sort()
      .at(-1);
    if (previous) record = { ...record, previousTag: previous.slice(0, -5) };
  }
  const path = join(root, 'docs/releases', `${record.releaseTag}.md`);
  mkdirSync(join(root, 'docs/releases'), { recursive: true });
  writeFileSync(
    path,
    await format(validateProjectReleaseNotes(root, record), {
      ...(await resolveConfig(path)),
      filepath: path,
    }),
  );
  return path;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const recordPath = process.argv[2];
  if (!recordPath)
    throw new Error(
      'Usage: node scripts/project-release-notes.mjs .releases/<tag>.json',
    );
  await writeProjectReleaseNotes(
    process.cwd(),
    JSON.parse(readFileSync(recordPath, 'utf8')),
  );
}
