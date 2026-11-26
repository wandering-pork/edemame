import { describe, expect, it } from 'vitest';
import {
  AI_BUSY_FALLBACK_MESSAGE,
  AiBusyError,
  aiErrorMessage,
  readAiBusyMessage,
  throwForAiResponse,
} from './aiErrors';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('readAiBusyMessage', () => {
  it("returns the server's message for ai_busy", async () => {
    expect(await readAiBusyMessage(json(503, { code: 'ai_busy', error: 'Busy, try later.' }))).toBe('Busy, try later.');
  });

  it('falls back to the default message when ai_busy has no text', async () => {
    expect(await readAiBusyMessage(json(503, { code: 'ai_busy' }))).toBe(AI_BUSY_FALLBACK_MESSAGE);
  });

  it('treats a non-JSON gateway timeout as busy', async () => {
    expect(await readAiBusyMessage(new Response('An error occurred', { status: 504 }))).toBe(AI_BUSY_FALLBACK_MESSAGE);
  });

  it('returns null for other failures', async () => {
    expect(await readAiBusyMessage(json(502, { code: 'ai_error', error: 'nope' }))).toBeNull();
    expect(await readAiBusyMessage(json(400, { error: 'Missing required fields' }))).toBeNull();
  });
});

describe('throwForAiResponse / aiErrorMessage', () => {
  it('throws AiBusyError for busy responses, shown as-is', async () => {
    const err = await throwForAiResponse(json(503, { code: 'ai_busy', error: 'Busy.' }), 'Generic').catch(e => e);
    expect(err).toBeInstanceOf(AiBusyError);
    expect(aiErrorMessage(err, 'Generic')).toBe('Busy.');
  });

  it('throws a plain Error otherwise, shown as the caller fallback', async () => {
    const err = await throwForAiResponse(json(500, { error: 'boom' }), 'Generic').catch(e => e);
    expect(err).not.toBeInstanceOf(AiBusyError);
    expect(aiErrorMessage(err, 'Caller fallback')).toBe('Caller fallback');
  });
});
