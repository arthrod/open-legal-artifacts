#!/usr/bin/env node
/**
 * examples/run.js — regenerates examples/wall.md + examples/output.json.
 * Deterministic. Run: node examples/run.js
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { processFeed, stampSeenStore, toMarkdown } from '../core/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, 'input.json'), 'utf8'));

const result = processFeed(input.entries, input.watchers, input.seenStore || {});
const stamped = stampSeenStore(result.nextSeenStore, '2026-04-03T09:00:00Z');

writeFileSync(
  join(here, 'output.json'),
  JSON.stringify({ ...result, nextSeenStore: stamped }, null, 2) + '\n',
);
writeFileSync(join(here, 'wall.md'), toMarkdown(result) + '\n');
console.log(
  `wrote wall.md + output.json — ${result.stats.newEntries} new of ${result.stats.entriesInFeed} in feed, ` +
  `${result.stats.escalated} escalated; next seen-store holds ${stamped.count} ids`,
);
