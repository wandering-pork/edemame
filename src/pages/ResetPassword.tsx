import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, KeyRound, XCircle } from 'lucide-react';
import { LogoBrand } from '@/components/LogoBrand';
import { useAuth } from '@/contexts/AuthContext';
import { validateNewPassword } from '@/lib/passwordValidation';

type Status = 'checking' | 'ready' | 'expired' | 'done';

/**
 * `/reset-password` — reached from the "Send reset link" email
 * (AuthContext.tsx's resetPassword() sets `redirectTo` to this route).
 * Supabase's client detects the recovery token in the URL on load and
 * establishes a short-lived recovery session automatically (firing
 * onAuthStateChange with PASSWORD_RECOVERY, which AuthProvider already
 * subscribes to) — so by the time AuthContext's `loading` flips to false,
 * `session` being set is what tells us the link was valid.
 *
 * This route sits outside ProtectedRoute/ProfileProvider entirely (see
 * App.tsx's AppRoutes, sibling to "/", "/login", "/register") so it works
 * before a user has a profile, and so nothing in the app-shell tree can
 * redirect the recovery session away before this form renders.
 */
export const ResetPassword: React.FC = () => {
  const { session, loading, updatePassword } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState<Status>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    setStatus((prev) => (prev === 'done' ? prev : session ? 'ready' : 'expired'));
  }, [loading, session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validateNewPassword(password, confirm);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    // Also stamp password_set: true, the same flag api/_lib/firms.ts's
    // invite flow checks (see lib/firmInvites.ts's needsAccountSetup()) —
    // otherwise an invited user who resets their password here (rather than
    // through the account-setup form) would still get gated by
    // AccountSetupGate on their next load.
    const { error: updateError } = await updatePassword(password, { password_set: true });
    setSubmitting(false);

    if (updateError) {
      setError(updateError);
      return;
    }
    setStatus('done');
  };

  return (
    <div className="min-h-screen bg-paper dark:bg-plate flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <LogoBrand />
        </div>

        {status === 'checking' && (
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-edamame-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-ink-soft dark:text-plate-ink-soft text-sm">Checking your link...</p>
          </div>
        )}

        {status === 'expired' && (
          <div className="text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h1 className="font-ibm-sans text-xl font-semibold text-ink dark:text-plate-ink mb-2">
              This link has expired or was already used
            </h1>
            <p className="text-ink-soft dark:text-plate-ink-soft text-sm mb-6">
              Request a new password reset link and try again.
            </p>
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="px-6 py-3 rounded-xl text-base font-medium bg-edamame-500 hover:bg-edamame-600 text-white shadow-md hover:shadow-lg transition-all"
            >
              Back to sign in
            </button>
          </div>
        )}

        {status === 'ready' && (
          <>
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-xl bg-edamame-500 text-white flex items-center justify-center mx-auto mb-5">
                <KeyRound className="w-7 h-7" />
              </div>
              <h1 className="font-ibm-sans text-2xl font-semibold text-ink dark:text-plate-ink mb-2">
                Set a new password
              </h1>
              <p className="text-ink-soft dark:text-plate-ink-soft text-sm">
                Choose a new password for your account.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor="reset-pw" className="block text-sm font-semibold text-ink-soft dark:text-plate-ink-soft mb-2">
                  New password
                </label>
                <input
                  id="reset-pw"
                  type="password"
                  autoFocus
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="focus-ring w-full px-4 py-3 rounded-xl border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card text-ink dark:text-plate-ink outline-none transition-all"
                />
              </div>
              <div>
                <label htmlFor="reset-pw-confirm" className="block text-sm font-semibold text-ink-soft dark:text-plate-ink-soft mb-2">
                  Confirm new password
                </label>
                <input
                  id="reset-pw-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="focus-ring w-full px-4 py-3 rounded-xl border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card text-ink dark:text-plate-ink outline-none transition-all"
                />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className={`w-full px-6 py-3 rounded-xl text-base font-medium transition-all duration-200 ${
                  !submitting
                    ? 'bg-edamame-500 hover:bg-edamame-600 text-white shadow-md hover:shadow-lg cursor-pointer'
                    : 'bg-paper-2 dark:bg-plate-card text-ink-faint dark:text-plate-ink-faint cursor-not-allowed'
                }`}
              >
                {submitting ? 'Saving...' : 'Save new password'}
              </button>
            </form>
          </>
        )}

        {status === 'done' && (
          <div className="text-center">
            <CheckCircle2 className="w-12 h-12 text-edamame-500 mx-auto mb-4" />
            <h1 className="font-ibm-sans text-xl font-semibold text-ink dark:text-plate-ink mb-2">
              Password updated
            </h1>
            <p className="text-ink-soft dark:text-plate-ink-soft text-sm mb-6">
              You're signed in with your new password.
            </p>
            <button
              type="button"
              onClick={() => navigate('/dashboard', { replace: true })}
              className="px-6 py-3 rounded-xl text-base font-medium bg-edamame-500 hover:bg-edamame-600 text-white shadow-md hover:shadow-lg transition-all"
            >
              Continue to dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
