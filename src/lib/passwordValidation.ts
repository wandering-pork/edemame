/**
 * Shared password validation for account creation (LandingPage.tsx's sign-up
 * form) and password reset (pages/ResetPassword.tsx), so both surfaces agree
 * on the same minimum-length rule.
 */
export const MIN_PASSWORD_LENGTH = 6;

/**
 * Returns an error message if `password`/`confirm` don't satisfy the rules,
 * or `null` if they're valid.
 */
export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirm) {
    return 'The two passwords do not match.';
  }
  return null;
}
