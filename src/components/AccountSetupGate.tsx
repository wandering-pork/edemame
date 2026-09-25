import React, { useCallback, useEffect, useState } from 'react';
import { LogoBrand } from '@/components/LogoBrand';
import { AccountSetupForm } from '@/components/AccountSetupForm';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { needsAccountSetup } from '@/lib/firmInvites';

/**
 * App-wide enforcement of lib/firmInvites.ts's needsAccountSetup() (Bug 2 of
 * the invite/sign-up fix — see the PR description). Previously this was only
 * checked in pages/InviteAccept.tsx right after accepting an invite via the
 * emailed token link — anyone who joined a firm another way (the in-app
 * PendingInvitationsBanner, CreateFirmGate's own invitation list, or simply
 * landing anywhere in the app while already signed in from a stale session)
 * was never asked to set a name/password, leaving them unable to sign back
 * in once that session ended.
 *
 * Wraps the authenticated app-shell tree in App.tsx (inside ProtectedRoute,
 * outside ProfileProvider/FirmProvider/StorageGate) so it runs before any
 * onboarding, firm-creation or in-app-banner content — but never on the
 * public routes ("/", "/login", "/register", "/reset-password") or on
 * /invite/:token, which already runs this same check as part of its own
 * accept flow (see pages/InviteAccept.tsx) and shares this file's
 * AccountSetupForm rather than duplicating it.
 *
 * `invited_at` isn't part of AuthContext's own (narrower) AuthUser type, so
 * this reads it off a fresh `supabase.auth.getUser()` call instead — the
 * same reason pages/InviteAccept.tsx does the same thing after accepting.
 */
export const AccountSetupGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user: authUser } = useAuth();
  const [checked, setChecked] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  const checkUser = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getUser();
      setNeedsSetup(needsAccountSetup(data.user));
    } catch (err) {
      console.error('AccountSetupGate: failed to check account setup status:', err);
      // Fail open — don't block the app shell if the check itself errors.
      setNeedsSetup(false);
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    // Re-check whenever the signed-in user identity changes (e.g. after
    // sign-out/sign-in in the same tab), not just once on mount.
    setChecked(false);
    checkUser();
  }, [authUser?.id, checkUser]);

  const handleSuccess = useCallback(() => {
    // Re-check rather than optimistically flipping needsSetup to false, so
    // the gate reflects whatever Supabase actually persisted.
    checkUser();
  }, [checkUser]);

  // Don't flash the gate while the fresh getUser() call is still in flight.
  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="w-8 h-8 border-2 border-edamame-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (needsSetup) {
    return (
      <div className="min-h-screen bg-paper dark:bg-plate flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-8">
            <LogoBrand />
          </div>
          <AccountSetupForm
            description="Set a password so you can sign in again next time."
            onSuccess={handleSuccess}
          />
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AccountSetupGate;
