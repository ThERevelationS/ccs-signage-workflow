import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RESEARCH_ARCHIVE_LIMIT,
  canArchiveResearchDocument,
  withResearchArchiveTimeout,
} from '../base44/shared/jurisdictionResearchArchiveBudget.mjs';

test('research refresh archives only one new document by default', () => {
  const first = { url: 'https://example.gov/sign-code.pdf' };
  const second = { url: 'https://example.gov/sign-application.pdf' };

  assert.equal(canArchiveResearchDocument({
    document: first,
    existingDocument: null,
    archivesStarted: 0,
  }), true);
  assert.equal(DEFAULT_RESEARCH_ARCHIVE_LIMIT, 1);
  assert.equal(canArchiveResearchDocument({
    document: second,
    existingDocument: null,
    archivesStarted: 1,
  }), false);
});

test('manual or already archived documents never consume archival budget', () => {
  const document = { url: 'https://example.gov/sign-code.pdf' };

  assert.equal(canArchiveResearchDocument({
    document,
    existingDocument: { source: 'manual' },
    archivesStarted: 0,
  }), false);
  assert.equal(canArchiveResearchDocument({
    document,
    existingDocument: { file_url: 'https://files.example/archive.pdf' },
    archivesStarted: 0,
  }), false);
  assert.equal(canArchiveResearchDocument({
    document,
    existingDocument: { source_sha256: 'abc123' },
    archivesStarted: 0,
  }), false);
});

test('research archive steps fail closed when their time budget expires', async () => {
  await assert.rejects(
    withResearchArchiveTimeout(
      new Promise((resolve) => setTimeout(resolve, 50)),
      5,
      'Archive test',
    ),
    /Archive test timed out after 5ms/,
  );
});
