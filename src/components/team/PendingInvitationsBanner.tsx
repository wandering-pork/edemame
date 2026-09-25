import React, { useEffect, useState } from 'react';
import { Building2, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { firmRoleLabel } from '@/lib/firmDirectory';
import { mapPendingInviteRows, friendlyInviteError, type PendingInvitation, type PendingInviteRpcRow } from '@/lib/firmInvites';

/**
 * Step 1 · 1G.4 — shown in the app shell (both storage modes: Supabase auth
 * exists in local mode too, so a local-mode user can still be invited into
 * a firm) whenever `my_pending_invites()` returns rows. This is how an
 * *existing* user learns about an invite without an email at all (1G.8
 * hasn't shipped real email yet) — the emailed /invite/:token link still
 * works as a fallback for everyone else.
 *
 * Loaded once per mount (not polled) — a stale banner just means the user
 * refreshes and sees it; failures are silent (console.error) and never
 * block the rest of the app.
 */
export const PendingInvitationsBanner: React.FC = () => {
  const { session } = useAuth();
  const { profile } = useProfile();
  const [invites, setInvites] = useState<PendingInvitation[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('my_pending_invites');
        if (rpcError) throw rpcError;
        if (!cancelled) setInvites(mapPendingInviteRows((data ?? []) as PendingInviteRpcRow[]));
      } catch (err) {
        console.error('Failed to load pending invitations:', err);
      }
    })();
    return () => { cancelled = true; };
    // Once per session/mount only — see the module doc comment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  const acceptInvite = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('accept_invite', { invite_id: id });
      if (rpcError) throw rpcError;
      // The RPC also flips storage_mode to 'cloud' for a local-mode user —
      // a full reload is the same pattern used elsewhere a firm switch
      // happens (FirmContext.switchFirm, Settings' storage-mode switch), so
      // every context re-initializes cleanly against the new firm.
      window.location.reload();
    } catch (err) {
      console.error('Failed to accept invite:', err);
      setError(friendlyInviteError(err, 'Could not accept this invite. Please try again.'));
      setBusyId(null);
      setConfirmingId(null);
    }
  };

  const declineInvite = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('decline_invite', { invite_id: id });
      if (rpcError) throw rpcError;
      setInvites(prev => prev.filter(inv => inv.id !== id));
    } catch (err) {
      console.error('Failed to decline invite:', err);
      setError(friendlyInviteError(err, 'Could not decline this invite. Please try again.'));
    } finally {
      setBusyId(null);
    }
  };

  if (invites.length === 0) return null;

  return (
    <div className="mx-4 mt-4 space-y-3">
      {invites.map(invite => (
        <div
          key={invite.id}
          className="flex flex-col gap-3 rounded-xl border border-edamame-500/30 bg-edamame-50 dark:bg-edamame-500/10 px-4 py-3 text-sm text-ink dark:text-plate-ink"
        >
          <div className="flex items-start gap-3">
            <Building2 className="w-5 h-5 text-edamame-600 dark:text-edamame-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold">{invite.inviterName}</span> invited you to join{' '}
              <span className="font-semibold">{invite.firmName}</span> as a {firmRoleLabel(invite.role)}
            </div>
          </div>

          {confirmingId === invite.id ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10 px-3 py-3 text-sm text-amber-800 dark:text-amber-300">
              <p className="font-semibold mb-1">Firms only work with cloud storage.</p>
              <p className="mb-3">
                Joining {invite.firmName} will switch your account to cloud storage now. Your local folder isn't
                changed, moved or deleted — it stays on this computer as it is.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => acceptInvite(invite.id)}
                  disabled={busyId === invite.id}
                  className="btn-press px-4 py-2 rounded-lg text-sm font-medium bg-edamame-500 hover:bg-edamame-600 text-white transition-all disabled:opacity-50"
                >
                  {busyId === invite.id ? 'Switching...' : 'Switch to cloud and join'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingId(null)}
                  disabled={busyId === invite.id}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-ink-soft dark:text-plate-ink-soft hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => (profile?.storageMode === 'local' ? setConfirmingId(invite.id) : acceptInvite(invite.id))}
                disabled={busyId === invite.id}
                className="btn-press px-4 py-2 rounded-lg text-sm font-medium bg-edamame-500 hover:bg-edamame-600 text-white transition-all disabled:opacity-50"
              >
                {busyId === invite.id ? 'Accepting...' : 'Accept'}
              </button>
              <button
                type="button"
                onClick={() => declineInvite(invite.id)}
                disabled={busyId === invite.id}
                className="px-4 py-2 rounded-lg text-sm font-medium text-ink-soft dark:text-plate-ink-soft hover:bg-black/5 dark:hover:bg-white/5 transition-all disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-between gap-2 text-xs text-red-500">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)} className="flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default PendingInvitationsBanner;
