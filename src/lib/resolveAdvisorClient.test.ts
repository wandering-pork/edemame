import { describe, it, expect } from 'vitest';
import { resolveAdvisorClient } from './resolveAdvisorClient';
import type { Client } from '../types';

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'client-1',
    name: 'Jane Doe',
    dob: '1990-01-01',
    phone: '',
    email: '',
    address: '',
    ...overrides,
  };
}

describe('resolveAdvisorClient', () => {
  it('prefers a supplied clientId over name/DOB matching', () => {
    const target = makeClient({ id: 'client-9', name: 'Someone Else', dob: '2000-01-01' });
    const clients = [makeClient({ id: 'client-1' }), target];
    const result = resolveAdvisorClient(clients, { fullName: 'Jane Doe', dob: '1990-01-01' }, 'client-9');
    expect(result).toEqual({ kind: 'existing', client: target });
  });

  it('falls back to name/DOB matching when the given clientId does not resolve', () => {
    const match = makeClient({ id: 'client-1', name: 'Jane Doe', dob: '1990-01-01' });
    const clients = [match];
    const result = resolveAdvisorClient(clients, { fullName: 'Jane Doe', dob: '1990-01-01' }, 'missing-id');
    expect(result).toEqual({ kind: 'existing', client: match });
  });

  it('matches on normalized name + exact DOB', () => {
    const match = makeClient({ id: 'client-1', name: '  Jane   Doe ', dob: '1990-01-01' });
    const clients = [match];
    const result = resolveAdvisorClient(clients, { fullName: 'jane doe', dob: '1990-01-01' });
    expect(result).toEqual({ kind: 'existing', client: match });
  });

  it('normalizes whitespace and case for name matching', () => {
    const match = makeClient({ id: 'client-1', name: 'JANE DOE', dob: '1990-01-01' });
    const clients = [match];
    const result = resolveAdvisorClient(clients, { fullName: '  jane    doe  ', dob: '1990-01-01' });
    expect(result).toEqual({ kind: 'existing', client: match });
  });

  it('returns new with candidates when the same name has a different DOB', () => {
    const candidate = makeClient({ id: 'client-1', name: 'Jane Doe', dob: '1990-01-01' });
    const clients = [candidate];
    const result = resolveAdvisorClient(clients, { fullName: 'Jane Doe', dob: '1985-05-05' });
    expect(result).toEqual({ kind: 'new', sameNameCandidates: [candidate] });
  });

  it('returns new with candidates when DOB is missing on the input', () => {
    const candidate = makeClient({ id: 'client-1', name: 'Jane Doe', dob: '1990-01-01' });
    const clients = [candidate];
    const result = resolveAdvisorClient(clients, { fullName: 'Jane Doe', dob: '' });
    expect(result).toEqual({ kind: 'new', sameNameCandidates: [candidate] });
  });

  it('returns new with candidates when DOB is missing on the existing client', () => {
    const candidate = makeClient({ id: 'client-1', name: 'Jane Doe', dob: '' });
    const clients = [candidate];
    const result = resolveAdvisorClient(clients, { fullName: 'Jane Doe', dob: '1990-01-01' });
    expect(result).toEqual({ kind: 'new', sameNameCandidates: [candidate] });
  });

  it('returns new with no candidates when no client shares the name', () => {
    const clients = [makeClient({ id: 'client-1', name: 'Someone Else' })];
    const result = resolveAdvisorClient(clients, { fullName: 'Jane Doe', dob: '1990-01-01' });
    expect(result).toEqual({ kind: 'new', sameNameCandidates: [] });
  });
});
