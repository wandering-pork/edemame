import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { LogoBrand } from '@/components/LogoBrand';
import { useAuth } from '@/contexts/AuthContext';

type Status = 'accepting' | 'accepted' | 'error';

/**
 * `/invite/:token` — reached from the link in the invite email
 * (api/invite-member.ts sends `${origin}/invite/{token}`). This route sits
 * behind ProtectedRoute but outside ProfileProvider/FirmProvider's normal
 * app-shell tree, so it works for a brand-new user who hasn't onboarded yet:
 * ProtectedRoute redirects a signed-out visitor to /login with
 * `state.from` set to this URL, and LandingPage's sign-in flow returns them
 * here once authenticated (see App.tsx's AppRoutes).
 */
export const InviteAccept: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('accepting');
  const [error, setError] = useState<string | null>(null);
  const [firmName, setFirmName] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !session?.access_token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/accept-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error || 'Could not accept this invite.');
          setStatus('error');
          return;
        }
        setFirmName(data?.firmName ?? null);
        setStatus('accepted');
      } catch (err) {
        console.error('Failed to accept invite:', err);
        if (!cancelled) {
          setError('Could not accept this invite — check your connection and try again.');
          setStatus('error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [token, session?.access_token]);

  return (
    <div className="min-h-screen bg-paper dark:bg-plate flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center mb-8">
          <LogoBrand />
        </div>

        {status === 'accepting' && (
          <>
            <div className="w-8 h-8 border-2 border-edamame-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-ink-soft dark:text-plate-ink-soft text-sm">Accepting your invite...</p>
          </>
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
              onClick={() => navigate('/dashboard', { replace: true })}
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
