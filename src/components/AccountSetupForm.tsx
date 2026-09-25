import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { validateNewPassword } from '@/lib/passwordValidation';
import { mapAuthError } from '@/lib/authErrors';

interface AccountSetupFormProps {
  /** Shown above the fields — differs slightly between /invite/:token (fresh
   * from accepting) and the app-wide AccountSetupGate (an existing invited
   * user who never went through this the first time). */
  description: string;
  submitLabel?: string;
  onSuccess: () => void;
  /** Shows a checkmark header, matching InviteAccept's existing "setup" screen. */
  showIcon?: boolean;
}

/**
 * The "finish setting up your account" form: full name + new password +
 * confirm, shared by pages/InviteAccept.tsx (right after accepting an
 * invite) and components/AccountSetupGate.tsx (any later load where
 * lib/firmInvites.ts's needsAccountSetup() is still true — e.g. the invitee
 * joined via the in-app banner instead of the token link, so this is their
 * first time seeing it). One implementation so the two surfaces can't drift.
 *
 * On submit: supabase.auth.updateUser({ password, data: { full_name,
 * password_set: true } }) — the same call InviteAccept used to make inline.
 */
export const AccountSetupForm: React.FC<AccountSetupFormProps> = ({
  description,
  submitLabel = 'Save and continue',
  onSuccess,
  showIcon = true,
}) => {
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateNewPassword(password, confirmPassword);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!fullName.trim()) {
      setError('Enter your full name.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { full_name: fullName.trim(), password_set: true },
    });
    setBusy(false);
    if (updateError) {
      setError(mapAuthError(updateError.message, 'reset'));
      return;
    }
    onSuccess();
  };

  return (
    <div className="text-left">
      {showIcon && <CheckCircle2 className="w-12 h-12 text-edamame-500 mx-auto mb-4" />}
      <h1 className="font-ibm-sans text-xl font-semibold text-ink dark:text-plate-ink mb-2 text-center">
        Finish setting up your account
      </h1>
      <p className="text-ink-soft dark:text-plate-ink-soft text-sm mb-6 text-center">{description}</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="asf-name" className="block text-sm font-semibold text-ink-soft dark:text-plate-ink-soft mb-2">
            Full name
          </label>
          <input
            id="asf-name"
            type="text"
            autoFocus
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="Jane Smith"
            className="focus-ring w-full px-4 py-3 rounded-xl border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card text-ink dark:text-plate-ink outline-none transition-all"
          />
        </div>
        <div>
          <label htmlFor="asf-pw" className="block text-sm font-semibold text-ink-soft dark:text-plate-ink-soft mb-2">
            Password
          </label>
          <input
            id="asf-pw"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="focus-ring w-full px-4 py-3 rounded-xl border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card text-ink dark:text-plate-ink outline-none transition-all"
          />
        </div>
        <div>
          <label htmlFor="asf-pw2" className="block text-sm font-semibold text-ink-soft dark:text-plate-ink-soft mb-2">
            Confirm password
          </label>
          <input
            id="asf-pw2"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            className="focus-ring w-full px-4 py-3 rounded-xl border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card text-ink dark:text-plate-ink outline-none transition-all"
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full px-6 py-3 rounded-xl text-base font-medium bg-edamame-500 hover:bg-edamame-600 text-white shadow-md hover:shadow-lg transition-all disabled:opacity-50"
        >
          {busy ? 'Saving...' : submitLabel}
        </button>
      </form>
    </div>
  );
};

export default AccountSetupForm;
