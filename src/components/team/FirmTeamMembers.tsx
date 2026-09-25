import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Users, Mail, Ban, CheckCircle2, Copy, X, RotateCcw, Trash2, ArrowRightLeft } from 'lucide-react';
import { useFirm } from '@/contexts/FirmContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { isTaskClosed } from '@/lib/taskStatus';
import { isCaseClosed } from '@/lib/caseStage';
import {
  firmRoleLabel, firmJobTitleLabel, initialsOfName, canManageMembers, canManageMember, grantableRoles, FIRM_JOB_TITLES,
} from '@/lib/firmDirectory';
import { inviteHintFor, type InviteHint } from '@/lib/inviteHints';
import { friendlyMemberLifecycleError } from '@/lib/memberLifecycleErrors';
import type { Case, FirmJobTitle, FirmMemberRow, FirmRole, Task } from '@/types';

interface PendingInvite {
  id: string;
  email: string;
  role: FirmRole;
  createdAt: string;
  expiresAt: string;
}

const availabilityStyle: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  available: { dot: '#10B981', bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-[#047857] dark:text-[#4ADE80]', label: 'Available' },
  busy: { dot: '#F59E0B', bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-[#B45309] dark:text-[#FBBF24]', label: 'Busy' },
  offline: { dot: '#94A3B8', bg: 'bg-paper-2 dark:bg-plate-card', text: 'text-ink-soft dark:text-plate-ink-soft', label: 'Offline' },
};

const hueFromId = (id: string): number => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
};

interface FirmTeamMembersProps {
  tasks: Task[];
  /** Step 1 · 1G.6 — cases, so Disable/Remove's "hand over their work" panel can list cases the member owns. */
  cases: Case[];
  onUpdateTask: (task: Task) => void;
  onUpdateCase: (caseItem: Case) => void;
}

/**
 * Cloud mode's Team Members page (Step 1 · 1F) — the firm's real member
 * directory, invites, and roles. RLS is the real enforcement everywhere
 * here; the role checks below only decide what the UI offers.
 */
export const FirmTeamMembers: React.FC<FirmTeamMembersProps> = ({ tasks, cases, onUpdateTask, onUpdateCase }) => {
  const { firm, role, members, loading, refreshDirectory } = useFirm();
  const { user, session } = useAuth();
  // Step 1 · 1G.2: owners and admins manage members; admins additionally
  // can't touch other admins/owners (canManageMember, checked per row) and
  // may only grant the Member role (grantableRoles).
  const canManage = canManageMembers(role);
  const myGrantableRoles = useMemo(() => grantableRoles(role), [role]);

  const [searchTerm, setSearchTerm] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<FirmRole>('member');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [lastInviteSent, setLastInviteSent] = useState<boolean | null>(null);
  const [lastInviteEmail, setLastInviteEmail] = useState<string | null>(null);

  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);

  // Step 1 · 1G.3: as the user types, check the address against the
  // already-loaded members + pending invites for an instant hint — the
  // server's firm_email_status stays the authority (see handleInvite).
  const inviteHint: InviteHint | null = useMemo(
    () => inviteHintFor(inviteEmail, members, pendingInvites),
    [inviteEmail, members, pendingInvites]
  );

  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendResult, setResendResult] = useState<
    { id: string; sent: boolean; inviteLink: string } | { id: string; error: string } | null
  >(null);

  // Step 1 · 1G.6: Disable and Remove both open this panel first, so the
  // member's open work can be handed to someone else before either action
  // runs. `kind` is null when the panel is closed.
  const [lifecycle, setLifecycle] = useState<{ member: FirmMemberRow; kind: 'disable' | 'remove' } | null>(null);
  const [lifecycleReassignTo, setLifecycleReassignTo] = useState<string>('');
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [lifecycleConfirming, setLifecycleConfirming] = useState(false);

  const openLifecyclePanel = (member: FirmMemberRow, kind: 'disable' | 'remove') => {
    setLifecycle({ member, kind });
    setLifecycleReassignTo('');
    setLifecycleError(null);
    setLifecycleConfirming(false);
  };

  const closeLifecyclePanel = () => {
    setLifecycle(null);
    setLifecycleReassignTo('');
    setLifecycleError(null);
    setLifecycleConfirming(false);
    setLifecycleBusy(false);
  };

  const openTasksForLifecycle = useMemo(
    () => (lifecycle ? tasks.filter(t => t.assignedTo === lifecycle.member.userId && !isTaskClosed(t)) : []),
    [lifecycle, tasks],
  );
  const openCasesForLifecycle = useMemo(
    () => (lifecycle ? cases.filter(c => c.caseOwner === lifecycle.member.userId && !isCaseClosed(c)) : []),
    [lifecycle, cases],
  );
  const hasWorkToHandOver = openTasksForLifecycle.length > 0 || openCasesForLifecycle.length > 0;
  const reassignCandidates = useMemo(
    () => members.filter(m => m.status === 'active' && m.userId !== lifecycle?.member.userId),
    [members, lifecycle],
  );

  const runLifecycleAction = async () => {
    if (!lifecycle || !firm) return;
    setLifecycleBusy(true);
    setLifecycleError(null);
    try {
      // Hand over open work first, if any — plain bulk updates through the
      // same App.tsx callbacks used everywhere else, so activity events are
      // written as usual.
      const target = lifecycleReassignTo || undefined;
      for (const t of openTasksForLifecycle) {
        onUpdateTask({ ...t, assignedTo: target });
      }
      for (const c of openCasesForLifecycle) {
        onUpdateCase({ ...c, caseOwner: target });
      }

      if (lifecycle.kind === 'disable') {
        const { error } = await supabase.from('firm_members').update({ status: 'disabled' }).eq('firm_id', firm.id).eq('user_id', lifecycle.member.userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('remove_member', { f: firm.id, p_user_id: lifecycle.member.userId });
        if (error) throw error;
      }
      await refreshDirectory();
      closeLifecyclePanel();
    } catch (err) {
      console.error(`Failed to ${lifecycle.kind} member:`, err);
      setLifecycleError(friendlyMemberLifecycleError(err));
      setLifecycleBusy(false);
    }
  };

  const loadPendingInvites = async () => {
    if (!firm || !canManage) { setPendingInvites([]); return; }
    setInvitesLoading(true);
    try {
      const { data, error } = await supabase
        .from('firm_invites')
        .select('id, email, role, created_at, expires_at')
        .eq('firm_id', firm.id)
        .is('accepted_at', null)
        .is('revoked_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPendingInvites((data ?? []).map((r: any) => ({
        id: r.id, email: r.email, role: r.role, createdAt: r.created_at, expiresAt: r.expires_at,
      })));
    } catch (err) {
      console.error('Failed to load pending invites:', err);
      setPendingInvites([]);
    } finally {
      setInvitesLoading(false);
    }
  };

  useEffect(() => {
    loadPendingInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firm?.id, canManage]);

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return members.filter(m =>
      m.fullName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || m.role.includes(q),
    );
  }, [members, searchTerm]);

  const openTaskCount = (userId: string) => tasks.filter(t => t.assignedTo === userId && !isTaskClosed(t)).length;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firm || !session?.access_token || !inviteEmail.trim()) return;
    if (inviteHint?.kind === 'already_member') return;
    const email = inviteEmail.trim();
    setInviting(true);
    setInviteError(null);
    setLastInviteLink(null);
    setLastInviteSent(null);
    setLastInviteEmail(null);
    try {
      const res = await fetch('/api/invite-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ firmId: firm.id, email, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Step 1 · 1G.3: the server is the authority — map its 409 codes to
        // the same wording the inline hint already showed, rather than a
        // generic error, for whichever of the two caught it first.
        if (data?.code === 'already_member') {
          setInviteError('Already in your firm — no invite was sent.');
        } else if (data?.code === 'disabled_member') {
          setInviteError('This person is disabled in your firm — re-enable them instead of inviting them again.');
        } else {
          setInviteError(data?.error || 'Could not send the invite.');
        }
        return;
      }
      setLastInviteLink(data.inviteLink);
      setLastInviteSent(!!data.sent);
      setLastInviteEmail(email);
      setInviteEmail('');
      await loadPendingInvites();
    } catch (err) {
      console.error('Failed to invite team member:', err);
      setInviteError('Could not send the invite — check your connection and try again.');
    } finally {
      setInviting(false);
    }
  };

  // Step 1 · 1G.3: Resend calls the endpoint directly with the pending
  // invite's own email + role (a server-side resend rotates the token and
  // revokes the old one) instead of reopening the invite form.
  const handleResendInvite = async (inv: PendingInvite) => {
    if (!firm || !session?.access_token) return;
    setResendingId(inv.id);
    setResendResult(null);
    try {
      const res = await fetch('/api/invite-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ firmId: firm.id, email: inv.email, role: inv.role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResendResult({ id: inv.id, error: data?.error || 'Could not resend the invite.' });
        return;
      }
      setResendResult({ id: inv.id, sent: !!data.sent, inviteLink: data.inviteLink });
      await loadPendingInvites();
    } catch (err) {
      console.error('Failed to resend invite:', err);
      setResendResult({ id: inv.id, error: 'Could not resend — check your connection and try again.' });
    } finally {
      setResendingId(null);
    }
  };

  const handleRevoke = async (inviteId: string) => {
    try {
      const { error } = await supabase.from('firm_invites').update({ revoked_at: new Date().toISOString() }).eq('id', inviteId);
      if (error) throw error;
      await loadPendingInvites();
    } catch (err) {
      console.error('Failed to revoke invite:', err);
    }
  };

  const [rowError, setRowError] = useState<{ userId: string; message: string } | null>(null);

  const handleChangeRole = async (userId: string, newRole: FirmRole) => {
    if (!firm) return;
    setRowError(null);
    try {
      const { error } = await supabase.from('firm_members').update({ role: newRole }).eq('firm_id', firm.id).eq('user_id', userId);
      if (error) throw error;
      await refreshDirectory();
    } catch (err) {
      console.error('Failed to change role:', err);
      setRowError({ userId, message: friendlyMemberLifecycleError(err) });
    }
  };

  // Only used for re-enable now — disabling a member goes through the
  // lifecycle panel above (openLifecyclePanel) so open work can be handed
  // over first. Re-enabling never orphans anything, so it stays a direct
  // one-click action.
  const handleToggleDisabled = async (userId: string, currentStatus: string) => {
    if (!firm) return;
    setRowError(null);
    const nextStatus = currentStatus === 'active' ? 'disabled' : 'active';
    try {
      const { error } = await supabase.from('firm_members').update({ status: nextStatus }).eq('firm_id', firm.id).eq('user_id', userId);
      if (error) throw error;
      await refreshDirectory();
    } catch (err) {
      console.error('Failed to change member status:', err);
      setRowError({ userId, message: friendlyMemberLifecycleError(err) });
    }
  };

  const handleAvailability = async (availability: 'available' | 'busy' | 'offline') => {
    if (!user) return;
    try {
      const { error } = await supabase.from('firm_members').update({ availability }).eq('user_id', user.id);
      if (error) throw error;
      await refreshDirectory();
    } catch (err) {
      console.error('Failed to update availability:', err);
    }
  };

  // Everyone can set their own job title; owners/admins can set a Member's
  // (never another admin's/owner's — the trigger enforces this server-side,
  // this only hides the control for a caller who couldn't do it anyway).
  const handleJobTitle = async (userId: string, jobTitle: FirmJobTitle | '') => {
    if (!firm) return;
    try {
      const { error } = await supabase
        .from('firm_members')
        .update({ job_title: jobTitle || null })
        .eq('firm_id', firm.id)
        .eq('user_id', userId);
      if (error) throw error;
      await refreshDirectory();
    } catch (err) {
      console.error('Failed to update job title:', err);
    }
  };

  const myAvailability = members.find(m => m.userId === user?.id)?.availability ?? 'available';

  return (
    <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-paper-2 dark:bg-plate-card min-h-screen transition-colors duration-200 page-enter">
      <div className="max-w-[1440px] mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-[26px] md:text-[27px] font-extrabold tracking-[-0.035em] text-ink dark:text-plate-ink">
              Team Members
            </h1>
            <p className="text-[13px] text-ink-soft dark:text-plate-ink-soft mt-1">
              {firm ? `${firm.name} — ${members.length} member${members.length === 1 ? '' : 's'}` : 'Loading firm...'}
              {!canManage && ' · read-only (owners and admins manage members)'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div>
              <label className="sr-only" htmlFor="my-availability">Your availability</label>
              <select
                id="my-availability"
                value={myAvailability}
                onChange={e => handleAvailability(e.target.value as 'available' | 'busy' | 'offline')}
                className="focus-ring px-3 py-2.5 rounded-xl border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card text-ink dark:text-plate-ink text-[13px] outline-none"
              >
                <option value="available">Available</option>
                <option value="busy">Busy</option>
                <option value="offline">Offline</option>
              </select>
            </div>
            {canManage && (
              <button
                onClick={() => { setInviteOpen(true); setInviteRole(myGrantableRoles[0] ?? 'member'); setInviteError(null); setLastInviteLink(null); setLastInviteSent(null); setLastInviteEmail(null); }}
                className="btn-press focus-ring inline-flex items-center gap-1.5 bg-edamame-500 hover:bg-edamame-700 text-white px-4 py-2.5 rounded-xl font-bold text-[13px] whitespace-nowrap transition-colors"
              >
                <Plus size={16} strokeWidth={1.8} /> Invite
              </button>
            )}
          </div>
        </div>

        <div className="relative max-w-xs mt-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint dark:text-plate-ink-faint" size={16} strokeWidth={1.8} />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search members..."
            className="focus-ring w-full pl-9 pr-4 py-2.5 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 focus:border-edamame-500 rounded-xl text-[13px] outline-none transition-colors text-ink dark:text-plate-ink placeholder-ink-soft/50 dark:placeholder-plate-ink-soft/50"
          />
        </div>

        {/* Member table */}
        <div className="bg-paper-2 dark:bg-plate-card border border-ink/10 dark:border-plate-ink/15 rounded-xl shadow-sm overflow-hidden mt-5">
          <div className="grid grid-cols-12 gap-3 px-5 py-[11px] bg-paper-2/80 dark:bg-plate-card/60">
            <div className="col-span-3 text-[9.5px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.11em]">Member</div>
            <div className="col-span-2 text-[9.5px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.11em]">Role</div>
            <div className="col-span-2 text-[9.5px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.11em]">Job title</div>
            <div className="col-span-2 text-[9.5px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.11em]">Open tasks</div>
            <div className="col-span-2 text-[9.5px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.11em]">Availability</div>
            <div className="col-span-1 text-right text-[9.5px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.11em]">Actions</div>
          </div>

          {loading ? (
            <div className="py-16 text-center border-t border-ink/10 dark:border-plate-ink/15 text-ink-faint dark:text-plate-ink-faint text-sm">Loading members...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center border-t border-ink/10 dark:border-plate-ink/15">
              <div className="flex flex-col items-center gap-3 text-ink-faint dark:text-plate-ink-faint">
                <Users size={32} className="opacity-30" strokeWidth={1.8} />
                <span className="text-sm">No team members found.</span>
              </div>
            </div>
          ) : (
            filtered.map(m => {
              const hue = hueFromId(m.userId);
              const as = availabilityStyle[m.availability];
              const isMe = m.userId === user?.id;
              // Owners can manage anyone; admins only plain Members — see
              // lib/firmDirectory.ts's canManageMember, which mirrors the
              // firm_members_guard() trigger (the real enforcement).
              const canManageThis = canManageMember(role, m.role) && !isMe;
              const myRoleOptionsForRow = role === 'owner' ? grantableRoles(role) : (m.role === 'member' ? grantableRoles(role) : []);
              return (
                <div key={m.userId} className="border-t border-ink/10 dark:border-plate-ink/20">
                  <div className="table-row-hover grid grid-cols-12 gap-3 px-5 py-[13px] items-center hover:bg-paper-2/80 dark:hover:bg-plate-card/40">
                    <div className="col-span-3 flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] flex-shrink-0"
                        style={{ background: `oklch(0.93 0.05 ${hue})`, color: `oklch(0.42 0.12 ${hue})` }}
                      >
                        {initialsOfName(m.fullName)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-ink dark:text-plate-ink text-[13px] tracking-[-0.01em] truncate">
                          {m.fullName}{isMe && ' (you)'}
                        </div>
                        <div className="text-[11px] text-ink-faint dark:text-plate-ink-faint truncate">{m.email}</div>
                      </div>
                    </div>

                    <div className="col-span-2 text-[12.5px] text-ink-soft dark:text-plate-ink-soft">
                      {canManageThis && myRoleOptionsForRow.length > 0 ? (
                        <select
                          value={m.role}
                          onChange={e => handleChangeRole(m.userId, e.target.value as FirmRole)}
                          className="focus-ring px-2 py-1 rounded-md border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card text-ink dark:text-plate-ink text-[12.5px] outline-none"
                        >
                          {myRoleOptionsForRow.map(r => <option key={r} value={r}>{firmRoleLabel(r)}</option>)}
                        </select>
                      ) : (
                        firmRoleLabel(m.role)
                      )}
                      {m.status === 'disabled' && (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-red-500">Disabled</span>
                      )}
                    </div>

                    <div className="col-span-2 text-[12.5px] text-ink-soft dark:text-plate-ink-soft">
                      {(isMe || (canManageThis)) ? (
                        <select
                          value={m.jobTitle ?? ''}
                          onChange={e => handleJobTitle(m.userId, e.target.value as FirmJobTitle | '')}
                          className="focus-ring px-2 py-1 rounded-md border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card text-ink dark:text-plate-ink text-[12.5px] outline-none max-w-full"
                        >
                          <option value="">—</option>
                          {FIRM_JOB_TITLES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      ) : (
                        firmJobTitleLabel(m.jobTitle) ?? '—'
                      )}
                    </div>

                    <div className="col-span-2 text-[12.5px] text-ink-soft dark:text-plate-ink-soft">
                      {openTaskCount(m.userId)}
                    </div>

                    <div className="col-span-2">
                      <span className={`inline-flex items-center gap-1.5 text-[10.5px] font-bold px-2.5 py-[3px] rounded-md ${as.bg} ${as.text}`}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: as.dot }} />
                        {as.label}
                      </span>
                    </div>

                    <div className="col-span-1 flex items-center justify-end gap-3">
                      {canManageThis && (
                        <button
                          onClick={() => m.status === 'active' ? openLifecyclePanel(m, 'disable') : handleToggleDisabled(m.userId, m.status)}
                          aria-label={m.status === 'active' ? 'Disable member' : 'Re-enable member'}
                          title={m.status === 'active' ? 'Disable member' : 'Re-enable member'}
                          className="text-ink-faint dark:text-plate-ink-faint hover:text-red-500 transition-colors"
                        >
                          {m.status === 'active' ? <Ban size={14} strokeWidth={1.8} /> : <CheckCircle2 size={14} strokeWidth={1.8} />}
                        </button>
                      )}
                      {canManageThis && (
                        <button
                          onClick={() => openLifecyclePanel(m, 'remove')}
                          aria-label="Remove member"
                          title="Remove member"
                          className="text-ink-faint dark:text-plate-ink-faint hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={14} strokeWidth={1.8} />
                        </button>
                      )}
                    </div>
                  </div>
                  {rowError && rowError.userId === m.userId && (
                    <p className="px-5 pb-2.5 text-[11px] text-red-500">{rowError.message}</p>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Pending invites */}
        {canManage && (
          <div className="mt-6">
            <h2 className="text-sm font-bold text-ink dark:text-plate-ink mb-3">Pending invites</h2>
            <div className="bg-paper-2 dark:bg-plate-card border border-ink/10 dark:border-plate-ink/15 rounded-xl shadow-sm overflow-hidden">
              {invitesLoading ? (
                <div className="py-8 text-center text-ink-faint dark:text-plate-ink-faint text-sm">Loading...</div>
              ) : pendingInvites.length === 0 ? (
                <div className="py-8 text-center text-ink-faint dark:text-plate-ink-faint text-sm">No pending invites.</div>
              ) : (
                pendingInvites.map(inv => {
                  const canGrantThisRole = myGrantableRoles.includes(inv.role);
                  const result = resendResult && resendResult.id === inv.id ? resendResult : null;
                  return (
                    <div key={inv.id} className="border-t first:border-t-0 border-ink/10 dark:border-plate-ink/20 px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-ink dark:text-plate-ink text-[13px] truncate">{inv.email}</div>
                          <div className="text-[11px] text-ink-faint dark:text-plate-ink-faint">
                            {firmRoleLabel(inv.role)} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <button
                            onClick={() => handleResendInvite(inv)}
                            disabled={!canGrantThisRole || resendingId === inv.id}
                            title={canGrantThisRole ? 'Resend invite' : `You can't grant the ${firmRoleLabel(inv.role)} role`}
                            className="text-ink-faint dark:text-plate-ink-faint hover:text-edamame-600 dark:hover:text-edamame-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <RotateCcw size={14} strokeWidth={1.8} className={resendingId === inv.id ? 'animate-spin' : ''} />
                          </button>
                          <button
                            onClick={() => handleRevoke(inv.id)}
                            title="Revoke invite"
                            className="text-ink-faint dark:text-plate-ink-faint hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={14} strokeWidth={1.8} />
                          </button>
                        </div>
                      </div>
                      {result && 'error' in result && (
                        <p className="mt-2 text-[11px] text-red-500">{result.error}</p>
                      )}
                      {result && !('error' in result) && (
                        <div className="mt-2 rounded-lg bg-edamame-50 dark:bg-edamame-950 border border-edamame-200 dark:border-edamame-800 p-2.5">
                          <p className="text-[11px] text-ink-soft dark:text-plate-ink-soft mb-1.5 flex items-center gap-1.5">
                            <Mail size={12} />
                            {result.sent
                              ? 'Invite re-sent.'
                              : `${inv.email} already has an Edamame account, so no email was sent — send them this link:`}
                          </p>
                          <div className="flex items-center gap-2">
                            <input readOnly value={result.inviteLink} className="flex-1 text-[11px] px-2 py-1 rounded border border-ink/15 dark:border-plate-ink/20 bg-paper dark:bg-plate-card text-ink dark:text-plate-ink" />
                            <button
                              type="button"
                              onClick={() => navigator.clipboard?.writeText(result.inviteLink)}
                              className="p-1.5 rounded-md text-ink-faint hover:text-edamame-600 transition-colors"
                              title="Copy link"
                            >
                              <Copy size={13} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Invite modal */}
      {inviteOpen && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center p-4 z-50 modal-backdrop">
          <div className="bg-paper-2 dark:bg-plate-card rounded-2xl shadow-2xl max-w-md w-full modal-content">
            <div className="flex items-center justify-between p-6 border-b border-ink/15 dark:border-plate-ink/20">
              <h2 className="text-lg font-bold text-ink dark:text-plate-ink">Invite a team member</h2>
              <button onClick={() => setInviteOpen(false)} className="p-1 hover:bg-paper-2 dark:hover:bg-plate-card rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleInvite} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-ink-soft dark:text-plate-ink-soft mb-2">Email</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  className="focus-ring w-full px-4 py-2 rounded-lg border border-ink/15 dark:border-plate-ink/20 bg-paper dark:bg-plate-card text-ink dark:text-plate-ink outline-none transition-all"
                />
                {inviteHint && (
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs text-ink-soft dark:text-plate-ink-soft">
                    <span>{inviteHint.message}</span>
                    {inviteHint.kind === 'disabled_member' && inviteHint.userId && (
                      <button
                        type="button"
                        onClick={() => { handleToggleDisabled(inviteHint.userId!, 'disabled'); setInviteOpen(false); }}
                        className="btn-press focus-ring flex-shrink-0 px-2.5 py-1 rounded-md bg-edamame-500 hover:bg-edamame-700 text-white font-semibold text-[11px] transition-colors"
                      >
                        Re-enable
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-ink-soft dark:text-plate-ink-soft mb-2">Role</label>
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value as FirmRole)}
                  className="focus-ring w-full px-4 py-2 rounded-lg border border-ink/15 dark:border-plate-ink/20 bg-paper dark:bg-plate-card text-ink dark:text-plate-ink outline-none transition-all"
                >
                  {myGrantableRoles.map(r => <option key={r} value={r}>{firmRoleLabel(r)}</option>)}
                </select>
              </div>
              {inviteError && <p className="text-sm text-red-500">{inviteError}</p>}
              {lastInviteLink && lastInviteEmail && (
                <div className="rounded-lg bg-edamame-50 dark:bg-edamame-950 border border-edamame-200 dark:border-edamame-800 p-3">
                  <p className="text-xs text-ink-soft dark:text-plate-ink-soft mb-1.5 flex items-center gap-1.5">
                    <Mail size={13} />
                    {lastInviteSent
                      ? `Invite email sent to ${lastInviteEmail}`
                      : `${lastInviteEmail} already has an Edamame account, so no email was sent — send them this link:`}
                  </p>
                  <div className="flex items-center gap-2">
                    <input readOnly value={lastInviteLink} className="flex-1 text-xs px-2 py-1.5 rounded border border-ink/15 dark:border-plate-ink/20 bg-paper dark:bg-plate-card text-ink dark:text-plate-ink" />
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(lastInviteLink)}
                      className="p-1.5 rounded-md text-ink-faint hover:text-edamame-600 transition-colors"
                      title="Copy link"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setInviteOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-ink-soft dark:text-plate-ink-soft hover:bg-paper-2 dark:hover:bg-plate-card rounded-lg transition-colors"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={inviting || !inviteEmail.trim() || inviteHint?.kind === 'already_member'}
                  className="btn-press ml-auto px-4 py-2 text-sm font-semibold text-white bg-edamame-500 hover:bg-edamame-600 disabled:bg-ink/20 dark:disabled:bg-plate-ink/20 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  {inviting ? 'Sending...' : 'Send invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Step 1 · 1G.6: Disable/Remove lifecycle panel — hand over open
          work first, then (for Remove) an inline confirm, then the action. */}
      {lifecycle && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center p-4 z-50 modal-backdrop">
          <div className="bg-paper-2 dark:bg-plate-card rounded-2xl shadow-2xl max-w-md w-full modal-content">
            <div className="flex items-center justify-between p-6 border-b border-ink/15 dark:border-plate-ink/20">
              <h2 className="text-lg font-bold text-ink dark:text-plate-ink">
                {lifecycle.kind === 'disable' ? 'Disable' : 'Remove'} {lifecycle.member.fullName}
              </h2>
              <button onClick={closeLifecyclePanel} className="p-1 hover:bg-paper-2 dark:hover:bg-plate-card rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {hasWorkToHandOver && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowRightLeft size={14} className="text-ink-faint dark:text-plate-ink-faint" strokeWidth={1.8} />
                    <p className="text-sm font-semibold text-ink dark:text-plate-ink">Hand over their work first</p>
                  </div>
                  <p className="text-xs text-ink-soft dark:text-plate-ink-soft mb-3">
                    {lifecycle.member.fullName} has {openTasksForLifecycle.length} open task{openTasksForLifecycle.length === 1 ? '' : 's'}
                    {openCasesForLifecycle.length > 0 && ` and owns ${openCasesForLifecycle.length} open case${openCasesForLifecycle.length === 1 ? '' : 's'}`}.
                    Choose who picks them up.
                  </p>
                  <ul className="text-xs text-ink-soft dark:text-plate-ink-soft mb-3 space-y-1 max-h-24 overflow-y-auto pr-1">
                    {openTasksForLifecycle.map(t => (
                      <li key={t.id} className="truncate">Task: {t.title}</li>
                    ))}
                    {openCasesForLifecycle.map(c => (
                      <li key={c.id} className="truncate">Case: {c.title}</li>
                    ))}
                  </ul>
                  <label className="block text-xs font-semibold text-ink-soft dark:text-plate-ink-soft mb-1.5">Reassign to</label>
                  <select
                    value={lifecycleReassignTo}
                    onChange={e => setLifecycleReassignTo(e.target.value)}
                    className="focus-ring w-full px-3 py-2 rounded-lg border border-ink/15 dark:border-plate-ink/20 bg-paper dark:bg-plate-card text-ink dark:text-plate-ink text-sm outline-none"
                  >
                    <option value="">Leave unassigned</option>
                    {reassignCandidates.map(m => (
                      <option key={m.userId} value={m.userId}>{m.fullName}</option>
                    ))}
                  </select>
                </div>
              )}

              {lifecycle.kind === 'remove' && (
                lifecycleConfirming ? (
                  <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
                    <p className="text-sm text-ink dark:text-plate-ink">
                      <strong>{lifecycle.member.fullName}</strong> will lose access to this firm and be removed
                      from the team. Their past work keeps their name.
                    </p>
                  </div>
                ) : null
              )}

              {lifecycleError && <p className="text-sm text-red-500">{lifecycleError}</p>}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeLifecyclePanel}
                  className="px-4 py-2 text-sm font-semibold text-ink-soft dark:text-plate-ink-soft hover:bg-paper-2 dark:hover:bg-plate-card rounded-lg transition-colors"
                >
                  Cancel
                </button>
                {lifecycle.kind === 'remove' && !lifecycleConfirming ? (
                  <button
                    type="button"
                    onClick={() => setLifecycleConfirming(true)}
                    className="btn-press ml-auto px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
                  >
                    Continue
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={runLifecycleAction}
                    disabled={lifecycleBusy}
                    className="btn-press ml-auto px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                  >
                    {lifecycleBusy ? 'Working...' : lifecycle.kind === 'disable' ? 'Disable member' : 'Remove member'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FirmTeamMembers;
