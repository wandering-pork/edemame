import React, { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Users,
  X,
} from 'lucide-react';
import type { Case, Client, Task, TeamMember, TeamMemberRole, TeamMemberStatus } from '../types';

interface TeamMembersProps {
  teamMembers: TeamMember[];
  cases: Case[];
  clients: Client[];
  tasks: Task[];
  onAddMember: (member: TeamMember) => void;
  onUpdateMember: (member: TeamMember) => void;
  onDeleteMember: (id: string) => void;
}

const roleOptions: { value: TeamMemberRole; label: string }[] = [
  { value: 'partner', label: 'Partner' },
  { value: 'lawyer', label: 'Lawyer' },
  { value: 'assistant', label: 'Assistant' },
];

const statusOptions: { value: TeamMemberStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'busy', label: 'Busy' },
  { value: 'offline', label: 'Offline' },
];

const statusStyle: Record<TeamMemberStatus, { dot: string; bg: string; text: string; label: string }> = {
  available: { dot: '#10B981', bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-[#047857] dark:text-[#4ADE80]', label: 'Available' },
  busy: { dot: '#F59E0B', bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-[#B45309] dark:text-[#FBBF24]', label: 'Busy' },
  offline: { dot: '#94A3B8', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300', label: 'Offline' },
};

/** Deterministic 0-360 hue from a string id, for pastel avatar backgrounds — matches Clients/CaseManager. */
const hueFromId = (id: string): number => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
};

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map(p => p[0]!.toUpperCase())
    .slice(0, 2)
    .join('');
}

export const TeamMembers: React.FC<TeamMembersProps> = ({
  teamMembers,
  cases: _cases,
  clients: _clients,
  tasks,
  onAddMember,
  onUpdateMember,
  onDeleteMember,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<{ name: string; email: string; role: TeamMemberRole; status: TeamMemberStatus }>(
    { name: '', email: '', role: 'lawyer', status: 'available' },
  );
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return teamMembers.filter(m =>
      m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || m.role.includes(q),
    );
  }, [teamMembers, searchTerm]);

  const openTaskCount = (memberId: string) => tasks.filter(t => t.assignedTo === memberId && !t.isCompleted).length;

  const openCreate = () => {
    setIsCreating(true);
    setEditing(null);
    setForm({ name: '', email: '', role: 'lawyer', status: 'available' });
  };

  const openEdit = (m: TeamMember) => {
    setEditing(m);
    setIsCreating(false);
    setForm({ name: m.name, email: m.email, role: m.role, status: m.status });
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.email.trim()) return;
    if (editing) {
      onUpdateMember({
        ...editing,
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        status: form.status,
        avatar: editing.avatar || initialsOf(form.name.trim()),
      });
    } else {
      const newMember: TeamMember = {
        id: `tm-${uuidv4()}`,
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        status: form.status,
        avatar: initialsOf(form.name.trim()),
        caseCount: 0,
        activeTaskCount: 0,
        joinedAt: new Date().toISOString(),
      };
      onAddMember(newMember);
    }
    setEditing(null);
    setIsCreating(false);
  };

  const handleDelete = (id: string) => {
    onDeleteMember(id);
    setConfirmDeleteId(null);
  };

  const modalOpen = isCreating || !!editing;

  return (
    <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-white dark:bg-slate-900 min-h-screen transition-colors duration-200 page-enter">
      <div className="max-w-[1440px] mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-[26px] md:text-[27px] font-extrabold tracking-[-0.035em] text-gray-900 dark:text-slate-100">
              Team Members
            </h1>
            <p className="text-[13px] text-gray-500 dark:text-slate-400 mt-1">
              People with access to this workspace
            </p>
          </div>
          <button
            onClick={openCreate}
            className="btn-press focus-ring inline-flex items-center gap-1.5 bg-edamame-500 hover:bg-edamame-700 text-white px-4 py-2.5 rounded-xl font-bold text-[13px] whitespace-nowrap transition-colors"
          >
            <Plus size={16} strokeWidth={1.8} /> Invite
          </button>
        </div>

        {/* Search */}
        <div className="relative max-w-xs mt-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" size={16} strokeWidth={1.8} />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search members..."
            className="focus-ring w-full pl-9 pr-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 focus:border-edamame-500 rounded-xl text-[13px] outline-none transition-colors text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500"
          />
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden mt-5">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-3 px-5 py-[11px] bg-gray-50/80 dark:bg-slate-800/60">
            <div className="col-span-4 text-[9.5px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.11em]">Member</div>
            <div className="col-span-3 text-[9.5px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.11em]">Role</div>
            <div className="col-span-2 text-[9.5px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.11em]">Open tasks</div>
            <div className="col-span-2 text-[9.5px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.11em]">Status</div>
            <div className="col-span-1 text-right text-[9.5px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.11em]">Actions</div>
          </div>

          {filtered.length === 0 ? (
            <div className="py-16 text-center border-t border-gray-100 dark:border-slate-800">
              <div className="flex flex-col items-center gap-3 text-gray-400 dark:text-slate-600">
                <Users size={32} className="opacity-30" strokeWidth={1.8} />
                <span className="text-sm">No team members found.</span>
              </div>
            </div>
          ) : (
            filtered.map(m => {
              const hue = hueFromId(m.id);
              const ss = statusStyle[m.status];
              return (
                <div key={m.id} className="border-t border-gray-100 dark:border-slate-800/80">
                  <div className="table-row-hover grid grid-cols-12 gap-3 px-5 py-[13px] items-center hover:bg-gray-50/80 dark:hover:bg-slate-800/40">
                    <div className="col-span-4 flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] flex-shrink-0"
                        style={{ background: `oklch(0.93 0.05 ${hue})`, color: `oklch(0.42 0.12 ${hue})` }}
                      >
                        {m.avatar || initialsOf(m.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 dark:text-white text-[13px] tracking-[-0.01em] truncate">{m.name}</div>
                        <div className="text-[11px] text-gray-400 dark:text-slate-500 truncate">{m.email}</div>
                      </div>
                    </div>

                    <div className="col-span-3 text-[12.5px] text-gray-600 dark:text-slate-300 capitalize">
                      {roleOptions.find(r => r.value === m.role)?.label || m.role}
                    </div>

                    <div className="col-span-2 text-[12.5px] text-gray-600 dark:text-slate-300">
                      {openTaskCount(m.id)}
                    </div>

                    <div className="col-span-2">
                      <span className={`inline-flex items-center gap-1.5 text-[10.5px] font-bold px-2.5 py-[3px] rounded-md ${ss.bg} ${ss.text}`}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: ss.dot }} />
                        {ss.label}
                      </span>
                    </div>

                    <div className="col-span-1 flex items-center justify-end gap-3">
                      <button
                        onClick={() => openEdit(m)}
                        aria-label="Edit member"
                        className="text-gray-400 dark:text-slate-500 hover:text-edamame-600 dark:hover:text-edamame-400 transition-colors"
                      >
                        <Pencil size={14} strokeWidth={1.8} />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(m.id)}
                        aria-label="Remove member"
                        className="text-gray-400 dark:text-slate-500 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} strokeWidth={1.8} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Create/Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center p-4 z-50 modal-backdrop">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full modal-content">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {editing ? 'Edit Member' : 'Invite Member'}
              </h2>
              <button
                onClick={() => { setEditing(null); setIsCreating(false); }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">Full name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="focus-ring w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="focus-ring w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white outline-none transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">Role</label>
                  <select
                    value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value as TeamMemberRole })}
                    className="focus-ring w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white outline-none transition-all"
                  >
                    {roleOptions.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value as TeamMemberStatus })}
                    className="focus-ring w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white outline-none transition-all"
                  >
                    {statusOptions.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-6 border-t border-gray-200 dark:border-slate-700">
              <button
                onClick={() => { setEditing(null); setIsCreating(false); }}
                className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || !form.email.trim()}
                className="btn-press ml-auto px-4 py-2 text-sm font-semibold text-white bg-edamame-500 hover:bg-edamame-600 disabled:bg-gray-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {editing ? 'Save changes' : 'Send invite'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center p-4 z-50 modal-backdrop">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 modal-content">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Remove team member?</h2>
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-5">
              Their cases and tasks will remain but will lose their owner/assignee.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                className="btn-press flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
