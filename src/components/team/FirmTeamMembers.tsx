import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Users, Mail, Ban, CheckCircle2, Copy, X, RotateCcw, Trash2 } from 'lucide-react';
import { useFirm } from '@/contexts/FirmContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { isTaskClosed } from '@/lib/taskStatus';
import { firmRoleLabel, initialsOfName, canManageMembers } from '@/lib/firmDirectory';
import type { FirmRole, Task } from '@/types';

interface PendingInvite {
  id: string;
  email: string;
  role: FirmRole;
  createdAt: string;
  expiresAt: string;
}

const roleOptions: { value: FirmRole; label: string }[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'agent', label: 'Agent' },
  { value: 'paralegal', label: 'Paralegal' },
];

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
}

/**
 * Cloud mode's Team Members page (Step 1 · 1F) — the firm's real member
 * directory, invites, and roles. RLS is the real enforcement everywhere
 * here; the role checks below only decide what the UI offers.
 */
export const FirmTeamMembers: React.FC<FirmTeamMembersProps> = ({ tasks }) => {
  const { firm, role, members, loading, refreshDirectory } = useFirm();
  const { user, session } = useAuth();
  const isOwner = canManageMembers(role);

  const [searchTerm, setSearchTerm] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<FirmRole>('paralegal');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);

  const loadPendingInvites = async () => {
    if (!firm || !isOwner) { setPendingInvites([]); return; }
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
  }, [firm?.id, isOwner]);

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
    setInviting(true);
    setInviteError(null);
    setLastInviteLink(null);
    try {
      const res = await fetch('/api/invite-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ firmId: firm.id, email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteError(data?.error || 'Could not send the invite.');
        return;
      }
      setLastInviteLink(data.inviteLink);
      setInviteEmail('');
      await loadPendingInvites();
    } catch (err) {
      console.error('Failed to invite team member:', err);
      setInviteError('Could not send the invite — check your connection and try again.');
    } finally {
      setInviting(false);
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

  const handleChangeRole = async (userId: string, newRole: FirmRole) => {
    if (!firm) return;
    try {
      const { error } = await supabase.from('firm_members').update({ role: newRole }).eq('firm_id', firm.id).eq('user_id', userId);
      if (error) throw error;
      await refreshDirectory();
    } catch (err) {
      console.error('Failed to change role (the firm may need to keep at least one active owner):', err);
    }
  };

  const handleToggleDisabled = async (userId: string, currentStatus: string) => {
    if (!firm) return;
    const nextStatus = currentStatus === 'active' ? 'disabled' : 'active';
    try {
      const { error } = await supabase.from('firm_members').update({ status: nextStatus }).eq('firm_id', firm.id).eq('user_id', userId);
      if (error) throw error;
      await refreshDirectory();
    } catch (err) {
      console.error('Failed to change member status (the firm may need to keep at least one active owner):', err);
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
              {!isOwner && ' · read-only (owners manage members)'}
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
            {isOwner && (
              <button
                onClick={() => { setInviteOpen(true); setInviteError(null); setLastInviteLink(null); }}
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
            <div className="col-span-4 text-[9.5px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.11em]">Member</div>
            <div className="col-span-3 text-[9.5px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.11em]">Role</div>
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
              return (
                <div key={m.userId} className="border-t border-ink/10 dark:border-plate-ink/20">
                  <div className="table-row-hover grid grid-cols-12 gap-3 px-5 py-[13px] items-center hover:bg-paper-2/80 dark:hover:bg-plate-card/40">
                    <div className="col-span-4 flex items-center gap-2.5 min-w-0">
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

                    <div className="col-span-3 text-[12.5px] text-ink-soft dark:text-plate-ink-soft">
                      {isOwner && !isMe ? (
                        <select
                          value={m.role}
                          onChange={e => handleChangeRole(m.userId, e.target.value as FirmRole)}
                          className="focus-ring px-2 py-1 rounded-md border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card text-ink dark:text-plate-ink text-[12.5px] outline-none"
                        >
                          {roleOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      ) : (
                        firmRoleLabel(m.role)
                      )}
                      {m.status === 'disabled' && (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-red-500">Disabled</span>
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
                      {isOwner && !isMe && (
                        <button
                          onClick={() => handleToggleDisabled(m.userId, m.status)}
                          aria-label={m.status === 'active' ? 'Disable member' : 'Re-enable member'}
                          title={m.status === 'active' ? 'Disable member' : 'Re-enable member'}
                          className="text-ink-faint dark:text-plate-ink-faint hover:text-red-500 transition-colors"
                        >
                          {m.status === 'active' ? <Ban size={14} strokeWidth={1.8} /> : <CheckCircle2 size={14} strokeWidth={1.8} />}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pending invites */}
        {isOwner && (
          <div className="mt-6">
            <h2 className="text-sm font-bold text-ink dark:text-plate-ink mb-3">Pending invites</h2>
            <div className="bg-paper-2 dark:bg-plate-card border border-ink/10 dark:border-plate-ink/15 rounded-xl shadow-sm overflow-hidden">
              {invitesLoading ? (
                <div className="py-8 text-center text-ink-faint dark:text-plate-ink-faint text-sm">Loading...</div>
              ) : pendingInvites.length === 0 ? (
                <div className="py-8 text-center text-ink-faint dark:text-plate-ink-faint text-sm">No pending invites.</div>
              ) : (
                pendingInvites.map(inv => (
                  <div key={inv.id} className="border-t first:border-t-0 border-ink/10 dark:border-plate-ink/20 flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-ink dark:text-plate-ink text-[13px] truncate">{inv.email}</div>
                      <div className="text-[11px] text-ink-faint dark:text-plate-ink-faint">
                        {firmRoleLabel(inv.role)} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <button
                        onClick={() => { setInviteOpen(true); setInviteEmail(inv.email); setInviteRole(inv.role); setInviteError(null); setLastInviteLink(null); }}
                        title="Resend invite"
                        className="text-ink-faint dark:text-plate-ink-faint hover:text-edamame-600 dark:hover:text-edamame-400 transition-colors"
                      >
                        <RotateCcw size={14} strokeWidth={1.8} />
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
                ))
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
              </div>
              <div>
                <label className="block text-sm font-semibold text-ink-soft dark:text-plate-ink-soft mb-2">Role</label>
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value as FirmRole)}
                  className="focus-ring w-full px-4 py-2 rounded-lg border border-ink/15 dark:border-plate-ink/20 bg-paper dark:bg-plate-card text-ink dark:text-plate-ink outline-none transition-all"
                >
                  {roleOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              {inviteError && <p className="text-sm text-red-500">{inviteError}</p>}
              {lastInviteLink && (
                <div className="rounded-lg bg-edamame-50 dark:bg-edamame-950 border border-edamame-200 dark:border-edamame-800 p-3">
                  <p className="text-xs text-ink-soft dark:text-plate-ink-soft mb-1.5 flex items-center gap-1.5">
                    <Mail size={13} /> Invite email sent. You can also share this link directly:
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
                  disabled={inviting || !inviteEmail.trim()}
                  className="btn-press ml-auto px-4 py-2 text-sm font-semibold text-white bg-edamame-500 hover:bg-edamame-600 disabled:bg-ink/20 dark:disabled:bg-plate-ink/20 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  {inviting ? 'Sending...' : 'Send invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FirmTeamMembers;
