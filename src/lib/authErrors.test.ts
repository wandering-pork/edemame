import { describe, it, expect } from 'vitest';
import { mapAuthError } from './authErrors';

describe('mapAuthError', () => {
  it('maps the rate limit error to friendly copy', () => {
    expect(mapAuthError('email rate limit exceeded')).toBe(
      "We couldn't send the email right now — too many emails were sent recently. Please try again in about an hour."
    );
  });

  it('is case-insensitive and matches the Supabase error code too', () => {
    expect(mapAuthError('Email Rate Limit Exceeded')).toContain("couldn't send the email right now");
    expect(mapAuthError('over_email_send_rate_limit')).toContain("couldn't send the email right now");
  });

  it('appends the invite hint only for the sign-up context', () => {
    const signUp = mapAuthError('email rate limit exceeded', 'sign-up');
    expect(signUp).toContain('use the link in your invite email instead of creating an account.');

    const signIn = mapAuthError('email rate limit exceeded', 'sign-in');
    expect(signIn).not.toContain('invited to a firm');

    const reset = mapAuthError('email rate limit exceeded', 'reset');
    expect(reset).not.toContain('invited to a firm');
  });

  it('maps the cooldown/"only request this after" error', () => {
    expect(mapAuthError('For security purposes, you can only request this after 57 seconds.')).toBe(
      'Please wait a few seconds and try again.'
    );
  });

  it('sentence-cases and adds a full stop to unknown errors', () => {
    expect(mapAuthError('invalid login credentials')).toBe('Invalid login credentials.');
    expect(mapAuthError('Invalid login credentials')).toBe('Invalid login credentials.');
    expect(mapAuthError('Invalid login credentials.')).toBe('Invalid login credentials.');
    expect(mapAuthError('user already registered!')).toBe('User already registered!');
  });

  it('passes through null/empty input unchanged', () => {
    expect(mapAuthError(null)).toBeNull();
    expect(mapAuthError(undefined)).toBeNull();
    expect(mapAuthError('')).toBe('');
    expect(mapAuthError('   ')).toBe('');
  });
});
