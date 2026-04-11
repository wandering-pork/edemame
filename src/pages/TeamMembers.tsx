import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import {
  Plus,
  Pencil,
  Trash2,
  Mail,
  Briefcase,
  CheckCircle2,
  X,
  Search,
  ArrowLeft,
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

const statusDot: Record<TeamMemberStatus, string> = {
  available: 'bg-emerald-500',
  busy: 'bg-amber-500',
  offline: 'bg-slate-400',
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
  cases,
  clients,
  tasks,
  onAddMember,
  onUpdateMember,
  onDeleteMember,
}) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(teamMembers[0]?.id ?? null);
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

  const selected = teamMembers.find(m => m.id === selectedId) || null;

  const memberCases = useMemo(() => {
    if (!selected) return [];
    return cases.filter(c => c.caseOwner === selected.id);
  }, [cases, selected]);

  const memberTasks = useMemo(() => {
    if (!selected) return [];
    return tasks.filter(t => t.assignedTo === selected.id);
  }, [tasks, selected]);

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
      setSelectedId(newMember.id);
    }
    setEditing(null);
    setIsCreating(false);
  };

  const handleDelete = (id: string) => {
    onDeleteMember(id);
    setConfirmDeleteId(null);
    if (selectedId === id) {
      setSelectedId(teamMembers.find(m => m.id !== id)?.id ?? null);
    }
  };

  const modalOpen = isCreating || !!editing;

  return (
    <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-white dark:bg-slate-900 min-h-screen transition-colors duration-200 page-enter">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
          <div>
            <button
              onClick={() => navigate('/team')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-edamame-500 transition-colors mb-2"
            >
              <ArrowLeft size={14} /> Back to Team Dashboard
            </button>
            <h1 className="text-3xl md:text-4xl font-ibm-serif font-bold text-slate-900 dark:text-white mb-2">
              Team Members
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-400">
              Add, remove, and update your firm's collaborators
            </p>
          </div>
          <button
            onClick={openCreate}
            className="btn-press inline-flex items-center gap-2 bg-edamame-500 hover:bg-edamame-600 text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-edamame-500/30 text-sm"
          >
            <Plus size={16} /> Add Member
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List */}
          <section className="lg:col-span-1">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search members..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 outline-none transition-all text-slate-900 dark:text-white placeholder-slate-400"
              />
            </div>
            <div className="space-y-2">
              {filtered.map(m => {
                const isSelected = m.id === selectedId;
                return (
                  <button
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-edamame-500 bg-edamame-50 dark:bg-edamame-900/20 ring-2 ring-edamame-500/20'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="relative w-11 h-11 rounded-full bg-gradient-to-br from-edamame-400 to-edamame-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                      {m.avatar || initialsOf(m.name)}
                      <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-slate-800 ${statusDot[m.status]}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white text-sm truncate">{m.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate capitalize">{m.role}</p>
                    </div>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-center text-sm text-slate-500 dark:text-slate-400 py-6">No members found.</p>
              )}
            </div>
          </section>

          {/* Detail */}
          <section className="lg:col-span-2">
            {!selected ? (
              <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-slate-500 dark:text-slate-400">
                Select a team member to view their details.
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
                {/* Header */}
                <div className="p-6 pb-4 flex items-start gap-5">
                  <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-edamame-400 to-edamame-600 text-white flex items-center justify-center font-ibm-serif font-bold text-2xl flex-shrink-0">
                    {selected.avatar || initialsOf(selected.name)}
                    <span className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-[3px] border-white dark:border-slate-800 ${statusDot[selected.status]}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-2xl font-ibm-serif font-bold text-slate-900 dark:text-white truncate">
                      {selected.name}
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 capitalize">{selected.role}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <Mail size={12} /> {selected.email}
                      </span>
                      {selected.joinedAt && (
                        <span>Joined {format(new Date(selected.joinedAt), 'MMM yyyy')}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEdit(selected)}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      aria-label="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(selected.id)}
                      className="p-2 rounded-lg border border-rose-200 dark:border-rose-900/50 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                      aria-label="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 border-y border-slate-100 dark:border-slate-700">
                  <div className="p-5 text-center border-r border-slate-100 dark:border-slate-700">
                    <p className="text-3xl font-ibm-serif font-bold text-slate-900 dark:text-white">{memberCases.length}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-1">Cases</p>
                  </div>
                  <div className="p-5 text-center border-r border-slate-100 dark:border-slate-700">
                    <p className="text-3xl font-ibm-serif font-bold text-slate-900 dark:text-white">
                      {memberTasks.filter(t => !t.isCompleted).length}
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-1">Open Tasks</p>
                  </div>
                  <div className="p-5 text-center">
                    <p className="text-3xl font-ibm-serif font-bold text-edamame-500">
                      {memberTasks.filter(t => t.isCompleted).length}
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-1">Completed</p>
                  </div>
                </div>

                {/* Cases list */}
                <div className="p-6">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                    <Briefcase size={14} /> Owned Cases
                  </h3>
                  {memberCases.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No cases assigned.</p>
                  ) : (
                    <div className="space-y-2">
                      {memberCases.map(c => {
                        const client = clients.find(cl => cl.id === c.clientId);
                        return (
                          <button
                            key={c.id}
                            onClick={() => navigate(`/cases/${c.id}`)}
                            className="w-full text-left flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-edamame-300 dark:hover:border-edamame-700 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-all"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{c.title}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{client?.name || 'Unknown'}</p>
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                              {c.status.replace('_', ' ')}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Tasks list */}
                <div className="px-6 pb-6">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                    <CheckCircle2 size={14} /> Assigned Tasks
                  </h3>
                  {memberTasks.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No tasks assigned.</p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {memberTasks.slice(0, 10).map(t => (
                        <div
                          key={t.id}
                          className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700"
                        >
                          <CheckCircle2
                            size={14}
                            className={t.isCompleted ? 'text-edamame-500' : 'text-slate-300 dark:text-slate-600'}
                          />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm truncate ${t.isCompleted ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                              {t.title}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">{t.date}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Create/Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center p-4 z-50 modal-backdrop">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full modal-content">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-ibm-serif font-bold text-slate-900 dark:text-white">
                {editing ? 'Edit Member' : 'Add Member'}
              </h2>
              <button
                onClick={() => { setEditing(null); setIsCreating(false); }}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Full name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Role</label>
                  <select
                    value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value as TeamMemberRole })}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all"
                  >
                    {roleOptions.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value as TeamMemberStatus })}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all"
                  >
                    {statusOptions.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => { setEditing(null); setIsCreating(false); }}
                className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || !form.email.trim()}
                className="ml-auto px-4 py-2 text-sm font-semibold text-white bg-edamame-500 hover:bg-edamame-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {editing ? 'Save changes' : 'Add member'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center p-4 z-50 modal-backdrop">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 modal-content">
            <h2 className="text-lg font-ibm-serif font-bold text-slate-900 dark:text-white mb-2">Remove team member?</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-5">
              Their cases and tasks will remain but will lose their owner/assignee.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-rose-500 hover:bg-rose-600 rounded-lg transition-colors"
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
