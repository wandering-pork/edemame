import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Firm, FirmFormerMember, FirmMemberRow, FirmRole } from '../types';
import { mapFirmDirectoryToTeamMembers } from '../lib/firmDirectory';
import { resolveMemberDisplayName } from '../lib/memberDirectory';
import type { TeamMember } from '../types';
import { resolveCurrentFirm, type ActiveMembership } from '../lib/firmSwitch';
import { useAuth } from './AuthContext';
import { useProfile } from './ProfileContext';

// Firms are cloud-only (docs/plans/step-1-foundations.md, Decisions #1): a
// linked local folder belongs to one person by construction, so local mode
// never has a firm — `useFirm()` returns firm: null there and the app
// behaves exactly as a single-user install.
const DEV_OFFLINE_AUTH = import.meta.env.DEV && import.meta.env.VITE_DEV_OFFLINE_AUTH === 'true';

interface FirmContextValue {
  firm: Firm | null;
  /** null while loading, in local mode, or when the signed-in user has no firm yet (see CreateFirmGate). */
  role: FirmRole | null;
  members: FirmMemberRow[];
  /** Alias for `members` (every directory row, active and disabled) — see Step 1 · 1G.6's plan wording. `members` is kept for existing call sites. */
  allMembers: FirmMemberRow[];
  /** Active members mapped to the existing TeamMember shape — see lib/firmDirectory.ts. Assignee/owner pickers read this. */
  teamMembers: TeamMember[];
  /** Step 1 · 1G.6 — people removed from (or who left) the current firm, kept only so old work can still show a name. Never used for permissions or pickers. */
  formerMembers: FirmFormerMember[];
  /** Resolves a userId to a display name for *past* work (task assignee, case owner, activity actor): active -> "Name (disabled)" -> "Name (former member)" -> null if truly unknown. See lib/memberDirectory.ts. */
  memberNameFor: (userId: string | undefined | null) => string | null;
  /** Every firm the signed-in user is an active member of (Step 1 · 1G.5) — drives the Sidebar switcher and Settings -> Firm. */
  memberships: ActiveMembership[];
  loading: boolean;
  refreshDirectory: () => Promise<void>;
  createFirm: (name: string) => Promise<string>;
  /** Sets profiles.current_firm_id to `firmId` and reloads, the same pattern as the storage-mode switch — cloud repositories are built for one firm. */
  switchFirm: (firmId: string) => Promise<void>;
  /** Deletes the caller's own membership in `firmId` (leave_firm RPC), then reloads. Throws the RPC's friendly error (e.g. last-owner) for the caller to display inline. */
  leaveFirm: (firmId: string) => Promise<void>;
  /** One-time "you no longer have access to X" message (see resolveCurrentFirm in lib/firmSwitch.ts), or null. */
  lostAccessNotice: string | null;
  dismissLostAccessNotice: () => void;
}

const FirmContext = createContext<FirmContextValue | null>(null);

function rowFromRpc(r: any): FirmMemberRow {
  return {
    userId: r.user_id,
    email: r.email,
    fullName: r.full_name,
    role: r.role,
    status: r.status,
    availability: r.availability,
    joinedAt: r.joined_at,
    jobTitle: r.job_title ?? null,
  };
}

/** sessionStorage read/write, wrapped in try/catch (private browsing, blocked storage, etc. — see LostAccess notice in the 1G.5 plan). */
function lostAccessNoticeKey(userId: string, firmId: string): string {
  return `edamame:lost-firm-notice:${userId}:${firmId}`;
}

function hasShownLostAccessNotice(userId: string, firmId: string): boolean {
  try {
    return sessionStorage.getItem(lostAccessNoticeKey(userId, firmId)) === '1';
  } catch {
    return false;
  }
}

function markLostAccessNoticeShown(userId: string, firmId: string): void {
  try {
    sessionStorage.setItem(lostAccessNoticeKey(userId, firmId), '1');
  } catch {
    // Ignore — worst case the notice shows again next load.
  }
}

export function FirmProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { profile, refetchProfile, updateProfile } = useProfile();
  const [firm, setFirm] = useState<Firm | null>(null);
  const [members, setMembers] = useState<FirmMemberRow[]>([]);
  const [formerMembers, setFormerMembers] = useState<FirmFormerMember[]>([]);
  const [memberships, setMemberships] = useState<ActiveMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [lostAccessNotice, setLostAccessNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (DEV_OFFLINE_AUTH || !user || profile?.storageMode !== 'cloud') {
      setFirm(null);
      setMembers([]);
      setFormerMembers([]);
      setMemberships([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Every firm this user is an active member of, most-recently-joined
      // first — the fallback resolveCurrentFirm() below uses when
      // current_firm_id is unset or no longer valid.
      const { data: membershipRows, error: membershipErr } = await supabase
        .from('firm_members')
        .select('firm_id, role, firms(name)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: false });
      if (membershipErr) throw membershipErr;

      const activeMemberships: ActiveMembership[] = (membershipRows ?? []).map((r: any) => ({
        firmId: r.firm_id,
        firmName: r.firms?.name ?? 'that firm',
        role: r.role,
      }));
      setMemberships(activeMemberships);

      const resolution = resolveCurrentFirm(profile.currentFirmId, activeMemberships);

      // Self-heal (currentFirmId was unset) and lost-access (currentFirmId
      // named a firm we're no longer an active member of) both land here —
      // either way profiles.current_firm_id should track what we actually
      // resolved to.
      if (resolution.firmId !== (profile.currentFirmId ?? null)) {
        try {
          await updateProfile({ currentFirmId: resolution.firmId });
        } catch (err) {
          console.error('Could not update current_firm_id after resolving firm access:', err);
        }
      }

      if (resolution.lostFirmId && user && !hasShownLostAccessNotice(user.id, resolution.lostFirmId)) {
        // Access to the old firm is already gone, so its name usually can't
        // be read any more (RLS hides it) — fall back to "that firm" per the
        // 1G.5 plan rather than failing the whole load over a cosmetic label.
        let lostFirmName = 'that firm';
        try {
          const { data } = await supabase.from('firms').select('name').eq('id', resolution.lostFirmId).maybeSingle();
          if (data?.name) lostFirmName = data.name;
        } catch {
          // Ignore — keep the generic fallback.
        }
        setLostAccessNotice(`You no longer have access to ${lostFirmName}.`);
        markLostAccessNoticeShown(user.id, resolution.lostFirmId);
      }

      if (!resolution.firmId) {
        setFirm(null);
        setMembers([]);
        setFormerMembers([]);
        return;
      }

      const [{ data: firmRow, error: firmErr }, { data: dirRows, error: dirErr }, { data: formerRows, error: formerErr }] = await Promise.all([
        supabase.from('firms').select('id, name').eq('id', resolution.firmId).maybeSingle(),
        supabase.rpc('firm_member_directory', { f: resolution.firmId }),
        supabase.from('firm_former_members').select('user_id, full_name, email, removed_at').eq('firm_id', resolution.firmId),
      ]);
      if (firmErr) throw firmErr;
      if (dirErr) throw dirErr;
      if (formerErr) throw formerErr;

      setFirm(firmRow ? { id: firmRow.id, name: firmRow.name } : null);
      setMembers((dirRows ?? []).map(rowFromRpc));
      setFormerMembers((formerRows ?? []).map((r: any) => ({
        userId: r.user_id, fullName: r.full_name, email: r.email, removedAt: r.removed_at,
      })));
    } catch (err) {
      console.error('Failed to load firm context:', err);
      setFirm(null);
      setMembers([]);
      setFormerMembers([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile?.storageMode, profile?.currentFirmId]);

  useEffect(() => {
    load();
  }, [load]);

  const createFirm = useCallback(async (name: string): Promise<string> => {
    const { data, error } = await supabase.rpc('create_firm', { firm_name: name });
    if (error) throw error;
    await refetchProfile();
    return data as string;
  }, [refetchProfile]);

  // Cloud repositories are built for one firm (repositories/cloud/index.ts's
  // createCloudRepositories(userId, firmId)), so switching which firm is
  // "current" needs the same full reload the storage-mode switch already
  // uses rather than reconciling in-memory state against a swapped backend.
  const switchFirm = useCallback(async (firmId: string) => {
    await updateProfile({ currentFirmId: firmId });
    window.location.reload();
  }, [updateProfile]);

  const leaveFirm = useCallback(async (firmId: string) => {
    const { error } = await supabase.rpc('leave_firm', { f: firmId });
    if (error) throw error;
    window.location.reload();
  }, []);

  const dismissLostAccessNotice = useCallback(() => setLostAccessNotice(null), []);

  const role = useMemo<FirmRole | null>(() => {
    if (!user) return null;
    return members.find(m => m.userId === user.id)?.role ?? null;
  }, [members, user]);

  const teamMembers = useMemo(() => mapFirmDirectoryToTeamMembers(members), [members]);

  const memberNameFor = useCallback(
    (userId: string | undefined | null) => resolveMemberDisplayName(userId, members, formerMembers)?.name ?? null,
    [members, formerMembers],
  );

  const value = useMemo<FirmContextValue>(() => ({
    firm, role, members, allMembers: members, teamMembers, formerMembers, memberNameFor, memberships, loading,
    refreshDirectory: load, createFirm, switchFirm, leaveFirm, lostAccessNotice, dismissLostAccessNotice,
  }), [firm, role, members, teamMembers, formerMembers, memberNameFor, memberships, loading, load, createFirm, switchFirm, leaveFirm, lostAccessNotice, dismissLostAccessNotice]);

  return <FirmContext.Provider value={value}>{children}</FirmContext.Provider>;
}

export function useFirm(): FirmContextValue {
  const ctx = useContext(FirmContext);
  if (!ctx) throw new Error('useFirm must be used within FirmProvider');
  return ctx;
}
