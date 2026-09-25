import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { LogoBrand } from '@/components/LogoBrand';
import { AccountSetupForm } from '@/components/AccountSetupForm';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { supabase } from '@/lib/supabaseClient';
import { needsAccountSetup } from '@/lib/firmInvites';

type Status = 'loading' | 'warn-local' | 'accepting' | 'setup' | 'accepted' | 'error';

/**
 * `/invite/:token` — reached from the link in the invite email
 * (api/invite-member.ts sends `${origin}/invite/{token}`). This route sits
 * behind ProtectedRoute, inside ProfileProvider (see App.tsx's AppRoutes)
 * but outside FirmProvider/the normal app-shell tree, so it works for a
 * brand-new user who hasn't onboarded yet: ProtectedRoute redirects a
 * signed-out visitor to /login with `state.from` set to this URL, and
 * LandingPage's sign-in flow returns them here once authenticated.
 *
 * Step 1 · 1G.4 adds two things before accepting goes through:
 *   - a local-mode warning (joining a firm switches storage_mode to
 *     'cloud' — the accept_invite_by_token RPC does that as part of the
 *     same transaction, so this screen exists purely to ask first);
 *   - a "finish setting up your account" step for a first-time invitee who
 *     was never asked to set a password (see lib/firmInvites.ts's
 *     needsAccountSetup()).
 * "Go to dashboard" always does a full navigation so Profile/Firm contexts
 * reload against the new profile/firm rather than a stale null profile
 * (which would otherwise send an invitee to /onboarding).
 */
export const InviteAccept: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { session } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [firmName, setFirmName] = useState<string | null>(null);

  const acceptInvite = async () => {
    if (!token || !session?.access_token) return;
    setStatus('accepting');
    setError(null);
    try {
      const res = await fetch('/api/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Could not accept this invite.');
        setStatus('error');
        return;
      }
      setFirmName(data?.firmName ?? null);

      // Re-read the auth user so we see the invited_at/user_metadata that
      // was current at sign-in (session.user can be stale). getUser() is
      // fine here — outside AuthContext's own AuthUser type, which doesn't
      // carry invited_at — see lib/firmInvites.ts's InviteSetupCandidate.
      const { data: userData } = await supabase.auth.getUser();
      if (needsAccountSetup(userData.user)) {
        setStatus('setup');
      } else {
        setStatus('accepted');
      }
    } catch (err) {
      console.error('Failed to accept invite:', err);
      setError('Could not accept this invite — check your connection and try again.');
      setStatus('error');
    }
  };

  useEffect(() => {
    if (!token || !session?.access_token) return;
    if (profileLoading) return;
    if (status !== 'loading') return;
    if (profile?.storageMode === 'local') {
      setStatus('warn-local');
      return;
    }
    acceptInvite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, session?.access_token, profileLoading, profile?.storageMode, status]);

  const goToDashboard = () => {
    // Full navigation, not react-router's navigate(): Profile/Firm contexts
    // need to re-fetch against the just-accepted invite (new firm, possibly
    // a new profile row or storage_mode flip) rather than reconciling
    // in-memory state — the same pattern Settings' storage-mode switch and
    // FirmContext.switchFirm use.
    window.location.assign('/dashboard');
  };

  return (
    <div className="min-h-screen bg-paper dark:bg-plate flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center mb-8">
          <LogoBrand />
        </div>

        {(status === 'loading' || status === 'accepting') && (
          <>
            <div className="w-8 h-8 border-2 border-edamame-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-ink-soft dark:text-plate-ink-soft text-sm">Accepting your invite...</p>
          </>
        )}

        {status === 'warn-local' && (
          <div className="text-left">
            <h1 className="font-ibm-sans text-xl font-semibold text-ink dark:text-plate-ink mb-4 text-center">
              Firms only work with cloud storage
            </h1>
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10 px-4 py-4 text-sm text-amber-800 dark:text-amber-300 mb-6">
              <p>
                Joining this firm will switch your account to cloud storage now. Your local folder isn't changed,
                moved or deleted — it stays on this computer as it is.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={acceptInvite}
                className="px-6 py-3 rounded-xl text-base font-medium bg-edamame-500 hover:bg-edamame-600 text-white shadow-md hover:shadow-lg transition-all"
              >
                Switch to cloud and join
              </button>
              <button
                type="button"
                onClick={() => navigate('/dashboard', { replace: true })}
                className="px-6 py-3 rounded-xl text-base font-medium text-ink-soft dark:text-plate-ink-soft hover:bg-black/5 dark:hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
            </div>
            <p className="text-center text-xs text-ink-faint dark:text-plate-ink-faint mt-4">
              Cancelling leaves the invite pending — you can come back to it any time from this same link.
            </p>
          </div>
        )}

        {status === 'setup' && (
          <AccountSetupForm
            description={`You're in${firmName ? ` at ${firmName}` : ''}! Set a name and password so you can sign back in later.`}
            onSuccess={() => setStatus('accepted')}
          />
        )}

        {status === 'accepted' && (
          <>
            <CheckCircle2 className="w-12 h-12 text-edamame-500 mx-auto mb-4" />
            <h1 className="font-ibm-sans text-xl font-semibold text-ink dark:text-plate-ink mb-2">
              You're in{firmName ? ` at ${firmName}` : ''}!
            </h1>
            <p className="text-ink-soft dark:text-plate-ink-soft text-sm mb-6">
              Your account has been added to the firm.
            </p>
            <button
              onClick={goToDashboard}
              className="px-6 py-3 rounded-xl text-base font-medium bg-edamame-500 hover:bg-edamame-600 text-white shadow-md hover:shadow-lg transition-all"
            >
              Go to dashboard
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h1 className="font-ibm-sans text-xl font-semibold text-ink dark:text-plate-ink mb-2">
              Couldn't accept this invite
            </h1>
            <p className="text-ink-soft dark:text-plate-ink-soft text-sm mb-6">{error}</p>
            <Link to="/dashboard" className="text-edamame-600 dark:text-edamame-400 hover:underline text-sm">
              Go to dashboard
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

export default InviteAccept;
