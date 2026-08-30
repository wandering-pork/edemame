import Fuse from 'fuse.js';
import { differenceInCalendarDays, startOfDay } from 'date-fns';
import type { Case, Client, Task, WorkflowTemplate } from '../../types';
import { displayCaseNumber } from '../caseNumber';
import { classifyQuery } from './visaAliases';

/** How many rows each section renders. */
export const SECTION_LIMIT = 3;

export interface SearchCorpus {
  clients: Client[];
  cases: Case[];
  tasks: Task[];
  templates: WorkflowTemplate[];
}

export interface CaseResult {
  caseItem: Case;
  caseNumber: string;
  client?: Client;
}

export interface TaskResult {
  task: Task;
  caseItem?: Case;
  caseNumber?: string;
}

export interface SearchResults {
  clients: Client[];
  cases: CaseResult[];
  tasks: TaskResult[];
  isEmpty: boolean;
}

const EMPTY: SearchResults = { clients: [], cases: [], tasks: [], isEmpty: true };

interface CaseIndexEntry {
  caseItem: Case;
  caseNumber: string;
  title: string;
}

/** Pre-built Fuse indexes for one corpus snapshot. Rebuild only when the underlying data changes. */
export interface SearchIndex {
  clientFuse: Fuse<Client>;
  caseFuse: Fuse<CaseIndexEntry>;
  taskFuse: Fuse<Task>;
}

/**
 * Builds the fuzzy-search indexes used by `smartSearch`. Index construction
 * (tokenizing/scoring setup) is the expensive part of using Fuse, so callers
 * should memoize this keyed on `clients`/`cases`/`tasks` and pass the result
 * into `smartSearch` on every keystroke rather than rebuilding per query.
 */
export function buildSearchIndex(corpus: Pick<SearchCorpus, 'clients' | 'cases' | 'tasks'>): SearchIndex {
  const { clients, cases, tasks } = corpus;

  const clientFuse = new Fuse(clients, {
    keys: [
      { name: 'name', weight: 0.8 },
      { name: 'email', weight: 0.15 },
      { name: 'passportNumber', weight: 0.05 },
    ],
    threshold: 0.38,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });

  const caseIndex: CaseIndexEntry[] = cases.map(c => ({ caseItem: c, caseNumber: displayCaseNumber(c), title: c.title }));
  const caseFuse = new Fuse(caseIndex, {
    keys: [
      { name: 'caseNumber', weight: 0.5 },
      { name: 'title', weight: 0.5 },
    ],
    threshold: 0.32,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });

  const taskFuse = new Fuse(tasks, {
    keys: ['title', 'description'],
    threshold: 0.32,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });

  return { clientFuse, caseFuse, taskFuse };
}

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/**
 * Exact-substring pass, run before the fuzzy pass.
 *
 * Fuzzy matching alone is too generous for short or highly-structured queries:
 * "Doe" also scores against "Jane Roe", and "EDM-2026-0003" scores against
 * every other case number. When a query matches something exactly we trust
 * that and skip the fuzzy pass entirely; fuzziness is a fallback for typos,
 * not a competitor to a precise hit.
 */
function exactMatches<T>(items: T[], query: string, fields: (item: T) => (string | undefined)[]): T[] {
  const needle = normalize(query);
  if (!needle) return [];
  return items.filter(item =>
    fields(item).some(value => value && normalize(value).includes(needle))
  );
}

/**
 * Subclass a case belongs to. Primary source is its workflow template; the
 * title regex is a fallback for cases whose template was deleted or which were
 * created before templates carried a subclass.
 */
function caseSubclass(caseItem: Case, templates: WorkflowTemplate[]): string | undefined {
  const fromTemplate = templates.find(t => t.id === caseItem.templateId)?.visaSubclass;
  if (fromTemplate) return fromTemplate;
  return caseItem.title.match(/\b(\d{3})\b/)?.[1];
}

/**
 * Local, deterministic query resolution for the global search bar.
 *
 * Deliberately not an LLM call and not a naive per-field keyword scan: the
 * query is split into visa vocabulary and free text, the free text is fuzzily
 * matched against people, and the visa vocabulary then *narrows* that person's
 * cases — so "John Doe work visa" resolves to John Doe's 482 case rather than
 * every record containing the word "work".
 *
 * Everything runs in-memory on the caller's own data; nothing is sent anywhere.
 *
 * `index` holds the pre-built Fuse instances for this corpus (see
 * `buildSearchIndex`) — callers should memoize it separately from the query
 * so fuzzy indexes aren't rebuilt on every keystroke.
 */
export function smartSearch(rawQuery: string, corpus: SearchCorpus, index: SearchIndex, now: Date = new Date()): SearchResults {
  const query = rawQuery.trim();
  if (query.length < 2) return EMPTY;

  const { clients, cases, tasks, templates } = corpus;
  const { subclasses, textTokens } = classifyQuery(query);
  const freeText = textTokens.join(' ').trim();

  // ── 1. Match people: exact substring first, fuzzy as a typo fallback ────
  let matchedClients: Client[] = [];
  if (freeText) {
    matchedClients = exactMatches(clients, freeText, c => [c.name, c.email, c.passportNumber]);
    if (matchedClients.length === 0) {
      matchedClients = index.clientFuse.search(freeText).map(r => r.item);
    }
  }
  const matchedClientIds = new Set(matchedClients.map(c => c.id));

  // ── 2. Cases belonging to those people ─────────────────────────────────
  // A case is "theirs" if they are the engaging client *or* the applicant —
  // the two differ for dependent/sponsored applicants.
  let matchedCases = cases.filter(
    c => matchedClientIds.has(c.clientId) || (c.applicantId && matchedClientIds.has(c.applicantId))
  );

  // ── 3. Narrow by visa subclass when the query named one ────────────────
  if (subclasses.length > 0) {
    const narrowed = matchedCases.filter(c => {
      const sub = caseSubclass(c, templates);
      return sub ? subclasses.includes(sub) : false;
    });
    // Only apply the narrowing if it leaves something — a client with no case
    // of that subclass is better served by showing all their cases than none.
    if (narrowed.length > 0) matchedCases = narrowed;
  }

  // A visa term on its own ("482", "partner visa") is a valid whole query.
  if (!freeText && subclasses.length > 0) {
    matchedCases = cases.filter(c => {
      const sub = caseSubclass(c, templates);
      return sub ? subclasses.includes(sub) : false;
    });
  }

  // ── 4. Direct field fallback when nothing has matched yet ──────────────
  // Handles bare case numbers, case titles and task titles. Guarded on
  // `matchedCases` as well as `matchedClients` so a subclass-only query like
  // "482" or "partner visa" — which legitimately resolves cases with no client
  // match at all — isn't overwritten by a weaker title/number scan.
  let directTasks: Task[] = [];
  if (matchedClients.length === 0 && matchedCases.length === 0) {
    matchedCases = exactMatches(cases, query, c => [c.title, displayCaseNumber(c)]);
    if (matchedCases.length === 0) {
      matchedCases = index.caseFuse.search(query).map(r => r.item.caseItem);
    }

    directTasks = exactMatches(tasks, query, t => [t.title]);
    if (directTasks.length === 0) {
      directTasks = index.taskFuse.search(query).map(r => r.item);
    }
  }

  // ── 5. Tasks: everything on the matched cases, plus direct title hits ───
  const matchedCaseIds = new Set(matchedCases.map(c => c.id));
  const taskPool = new Map<string, Task>();
  for (const t of tasks) {
    if (t.caseId && matchedCaseIds.has(t.caseId)) taskPool.set(t.id, t);
  }
  for (const t of directTasks) taskPool.set(t.id, t);

  // ── 6. Rank tasks by absolute distance from TODAY (past or future) ──────
  const today = startOfDay(now);
  const rankedTasks = [...taskPool.values()].sort((a, b) => {
    const da = Math.abs(differenceInCalendarDays(startOfDay(new Date(a.date)), today));
    const db = Math.abs(differenceInCalendarDays(startOfDay(new Date(b.date)), today));
    if (da !== db) return da - db;
    return a.title.localeCompare(b.title);
  });

  // ── 7. Truncate each section independently ─────────────────────────────
  const caseResults: CaseResult[] = matchedCases.slice(0, SECTION_LIMIT).map(caseItem => ({
    caseItem,
    caseNumber: displayCaseNumber(caseItem),
    client: clients.find(c => c.id === caseItem.clientId),
  }));

  const taskResults: TaskResult[] = rankedTasks.slice(0, SECTION_LIMIT).map(task => {
    const caseItem = task.caseId ? cases.find(c => c.id === task.caseId) : undefined;
    return { task, caseItem, caseNumber: caseItem ? displayCaseNumber(caseItem) : undefined };
  });

  const clientResults = matchedClients.slice(0, SECTION_LIMIT);

  return {
    clients: clientResults,
    cases: caseResults,
    tasks: taskResults,
    isEmpty: clientResults.length === 0 && caseResults.length === 0 && taskResults.length === 0,
  };
}
