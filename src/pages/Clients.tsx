import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Client, Case, Task } from '../types';
import { Search, Plus, User, Users, Phone, Mail, MapPin, ChevronDown, ChevronUp, Briefcase, Upload, Globe, FileText, Scan, Check } from 'lucide-react';
import { CsvImport } from '../components/CsvImport';
import { PassportScanner } from '../components/PassportScanner';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';

interface ClientsProps {
  clients: Client[];
  cases: Case[];
  tasks: Task[];
  onAddClient: (client: Client) => void;
  onUpdateClient: (client: Client) => void;
}

// Deterministic pastel hue from a client id/name, per design system.
const hueFromId = (id: string): number => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
};

const getInitials = (name: string) =>
  name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

export const Clients: React.FC<ClientsProps> = ({ clients, cases, tasks, onAddClient, onUpdateClient }) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newClient, setNewClient] = useState<Partial<Client>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isPassportScannerOpen, setIsPassportScannerOpen] = useState(false);
  const [justScanned, setJustScanned] = useState(false);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Deep link from the global search bar: /clients with { focusClientId }.
  const location = useLocation();
  const focusClientId = (location.state as { focusClientId?: string } | null)?.focusClientId;
  useEffect(() => {
    if (!focusClientId) return;
    if (!clients.some(c => c.id === focusClientId)) return;
    setSearchTerm('');
    setExpandedClientId(focusClientId);
    // Let the expanded row render before scrolling to it. The router state is
    // cleared only afterwards — clearing it up front would change
    // `focusClientId`, re-run this effect and cancel the timer before it fires.
    const id = window.setTimeout(() => {
      rowRefs.current[focusClientId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      navigate('.', { replace: true, state: null });
    }, 50);
    return () => window.clearTimeout(id);
  }, [focusClientId, clients]);

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm)
  );

  const getClientCases = (clientId: string) => {
    return cases.filter(c => c.clientId === clientId || c.applicantId === clientId);
  };

  // Only meaningful when a case splits the engaging customer from the applicant
  // (applicantId set and different from clientId) — otherwise it's one person
  // playing both roles and no badge is needed.
  const getClientRolesForCase = (c: Case, clientId: string): ('Customer' | 'Applicant')[] => {
    if (!c.applicantId || c.applicantId === c.clientId) return [];
    const roles: ('Customer' | 'Applicant')[] = [];
    if (c.clientId === clientId) roles.push('Customer');
    if (c.applicantId === clientId) roles.push('Applicant');
    return roles;
  };

  // "Active case" = most recently started case that isn't closed, falling back to any case.
  const getActiveCase = (clientId: string) => {
    const clientCases = getClientCases(clientId);
    if (clientCases.length === 0) return null;
    const open = clientCases.filter(c => c.status !== 'closed');
    const pool = open.length > 0 ? open : clientCases;
    return [...pool].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0];
  };

  const getCaseProgress = (caseId: string) => {
    const caseTasks = tasks.filter(t => t.caseId === caseId);
    if (caseTasks.length === 0) return { percent: 0, label: 'No Tasks' };

    const completedCount = caseTasks.filter(t => t.isCompleted).length;
    const percent = Math.round((completedCount / caseTasks.length) * 100);

    return {
      percent,
      label: percent === 100 ? 'Completed' : `In Progress (${percent}%)`
    };
  };

  const handleOpenModal = (client?: Client) => {
    if (client) {
      setNewClient({ ...client });
      setEditingId(client.id);
    } else {
      setNewClient({});
      setEditingId(null);
    }
    setJustScanned(false);
    setIsModalOpen(true);
  };

  const handleSaveClient = () => {
    if (!newClient.name) return;

    if (editingId) {
      onUpdateClient({
        id: editingId,
        name: newClient.name!,
        dob: newClient.dob || '',
        phone: newClient.phone || '',
        email: newClient.email || '',
        address: newClient.address || '',
        passportNumber: newClient.passportNumber || undefined,
        passportExpiry: newClient.passportExpiry || undefined,
        nationality: newClient.nationality || undefined,
        gender: newClient.gender || undefined,
      });
    } else {
      onAddClient({
        id: uuidv4(),
        name: newClient.name!,
        dob: newClient.dob || '',
        phone: newClient.phone || '',
        email: newClient.email || '',
        address: newClient.address || '',
        passportNumber: newClient.passportNumber || undefined,
        passportExpiry: newClient.passportExpiry || undefined,
        nationality: newClient.nationality || undefined,
        gender: newClient.gender || undefined,
      });
    }
    setIsModalOpen(false);
  };

  const toggleExpand = (id: string) => {
    setExpandedClientId(expandedClientId === id ? null : id);
  };

  const handlePassportScanResult = (data: {
    name: string;
    dob: string;
    nationality: string;
    passportNumber: string;
    passportExpiry: string;
    gender: string;
  }) => {
    setNewClient(prev => ({
      ...prev,
      name: data.name,
      dob: data.dob,
      nationality: data.nationality,
      passportNumber: data.passportNumber,
      passportExpiry: data.passportExpiry,
      gender: data.gender,
    }));
    setJustScanned(true);
    setIsPassportScannerOpen(false);
  };

  return (
    <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-paper dark:bg-plate min-h-screen transition-colors duration-200 page-enter">
      <div className="max-w-[1440px] mx-auto">
        {/* Header */}
        <div className="flex flex-col gap-4 mb-5">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <h1 className="text-[26px] font-extrabold text-ink dark:text-plate-ink tracking-[-0.035em]">
                Clients
              </h1>
              <p className="text-[13px] text-ink-soft dark:text-plate-ink-soft mt-1">
                Manage client profiles and case history
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsCsvModalOpen(true)}
                className="btn-press focus-ring flex items-center justify-center gap-[7px] bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 text-ink-soft dark:text-plate-ink-soft hover:border-edamame hover:text-edamame-600 dark:hover:text-edamame-400 px-[15px] py-[9px] rounded-[10px] font-semibold transition-colors text-[13px] whitespace-nowrap"
              >
                <Upload size={16} strokeWidth={1.8} />
                Import
              </button>
              <button
                onClick={() => handleOpenModal()}
                className="btn-press flex items-center justify-center gap-[7px] bg-edamame hover:bg-edamame-700 text-white px-4 py-[9px] rounded-[10px] font-bold transition-colors text-[13px] whitespace-nowrap"
              >
                <Plus size={16} strokeWidth={1.8} />
                Add Client
              </button>
            </div>
          </div>

          <div className="relative sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint dark:text-plate-ink-faint" size={16} strokeWidth={1.8} />
            <input
              type="text"
              placeholder="Search clients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-xl text-sm outline-none focus:border-edamame/50 dark:focus:border-edamame/30 text-ink dark:text-plate-ink placeholder-ink-soft/50 dark:placeholder-plate-ink-soft/50 transition-colors"
            />
          </div>
        </div>

        {/* Clients list */}
        <div className="bg-paper-2 dark:bg-plate-card rounded-xl border border-ink/15 dark:border-plate-ink/20 shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-3 px-5 py-[11px] bg-paper-2/80 dark:bg-plate-card/60">
            <div className="col-span-3 text-[9.5px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.11em]">Name</div>
            <div className="col-span-3 text-[9.5px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.11em]">Contact</div>
            <div className="col-span-2 hidden lg:block text-[9.5px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.11em]">Visa status</div>
            <div className="col-span-2 hidden md:block text-[9.5px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.11em]">Active case</div>
            <div className="col-span-1 hidden md:block text-[9.5px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.11em]">D.O.B</div>
            <div className="col-span-3 md:col-span-1 text-right text-[9.5px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.11em]">Actions</div>
          </div>

          {filteredClients.length === 0 ? (
            <div className="py-16 text-center border-t border-ink/10 dark:border-plate-ink/15">
              <div className="flex flex-col items-center gap-3 text-ink-faint dark:text-plate-ink-faint">
                <Users size={32} className="opacity-30" strokeWidth={1.8} />
                <span className="text-sm">No clients found.</span>
              </div>
            </div>
          ) : (
            filteredClients.map(client => {
              const hue = hueFromId(client.id || client.name);
              const activeCase = getActiveCase(client.id);
              // Approximation: no visaSubclass/expiry field is fed to this page today —
              // the active case title stands in for a "visa status" chip until that data exists.
              const verified = Boolean(client.passportNumber && client.passportExpiry);

              return (
                <div
                  key={client.id}
                  ref={el => { rowRefs.current[client.id] = el; }}
                  className="border-t border-ink/10 dark:border-plate-ink/20"
                >
                  <div
                    className="table-row-hover grid grid-cols-12 gap-3 px-5 py-[13px] items-center hover:bg-paper-2/80 dark:hover:bg-plate-card/40"
                    onClick={() => toggleExpand(client.id)}
                  >
                    <div className="col-span-3 flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] flex-shrink-0"
                        style={{
                          background: `oklch(0.93 0.05 ${hue})`,
                          color: `oklch(0.42 0.12 ${hue})`,
                        }}
                      >
                        {getInitials(client.name)}
                      </div>
                      <span className="font-semibold text-ink dark:text-plate-ink text-[13px] tracking-[-0.01em] truncate">{client.name}</span>
                    </div>

                    <div className="col-span-3 min-w-0">
                      <div className="text-xs text-ink-soft dark:text-plate-ink-soft truncate">{client.email || '—'}</div>
                      <div className="text-[11px] text-ink-faint dark:text-plate-ink-faint mt-0.5">{client.phone || '—'}</div>
                    </div>

                    <div className="col-span-2 hidden lg:flex items-center gap-1.5 min-w-0">
                      {activeCase ? (
                        <>
                          <span className="text-[11px] font-bold px-2 py-[3px] rounded-md bg-paper-2 dark:bg-plate-card text-ink-soft dark:text-plate-ink-soft truncate">
                            {activeCase.title}
                          </span>
                          {verified && (
                            <span title="Passport verified" className="inline-flex items-center gap-[3px] text-[9.5px] font-bold text-edamame-700 dark:text-edamame-400 flex-shrink-0">
                              <Check size={11} strokeWidth={2.5} />
                              VEVO
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-ink-soft/40 dark:text-plate-ink-soft/40">—</span>
                      )}
                    </div>

                    <div className="col-span-2 hidden md:block text-xs text-ink-soft dark:text-plate-ink-soft truncate">
                      {activeCase ? activeCase.title : '—'}
                    </div>

                    <div className="col-span-1 hidden md:block text-xs text-ink-faint dark:text-plate-ink-faint">
                      {client.dob ? format(new Date(client.dob), 'dd MMM yyyy') : '—'}
                    </div>

                    <div className="col-span-3 md:col-span-1 flex items-center justify-end gap-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/visa-advisor?clientId=${client.id}`); }}
                        className="text-xs font-semibold text-edamame-600 dark:text-edamame-400 hover:text-edamame-700 dark:hover:text-edamame-300 transition-colors"
                      >
                        Visa Check
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleOpenModal(client); }}
                        className="text-xs font-semibold text-ink-soft dark:text-plate-ink-soft hover:text-ink-soft dark:hover:text-plate-ink transition-colors"
                      >
                        Edit
                      </button>
                      <button className="text-ink-faint dark:text-plate-ink-faint hover:text-ink-soft dark:hover:text-plate-ink-soft transition-colors">
                        {expandedClientId === client.id ? <ChevronUp size={15} strokeWidth={1.8} /> : <ChevronDown size={15} strokeWidth={1.8} />}
                      </button>
                    </div>
                  </div>

                  {/* Case history expansion */}
                  {expandedClientId === client.id && (
                    <div className="px-5 pb-5 pt-1 bg-paper-2/60 dark:bg-plate-card/40 border-t border-ink/10 dark:border-plate-ink/20">
                      <div className="sm:ml-[38px]">
                        <h3 className="text-[10px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.11em] mb-3 flex items-center gap-1.5">
                          <Briefcase size={12} strokeWidth={1.8} />
                          Case History
                        </h3>

                        {getClientCases(client.id).length === 0 ? (
                          <p className="text-xs text-ink-faint dark:text-plate-ink-faint italic">No cases linked to this client.</p>
                        ) : (
                          <div className="space-y-2.5">
                            {getClientCases(client.id).map(c => {
                              const progress = getCaseProgress(c.id);
                              const roles = getClientRolesForCase(c, client.id);
                              return (
                                <div key={c.id} className="bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-xl p-3.5 card-lift">
                                  <div className="flex justify-between items-start mb-2.5 gap-3">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                        <span className="text-[10px] font-mono bg-paper-2 dark:bg-plate-card text-ink-soft dark:text-plate-ink-soft px-1.5 py-0.5 rounded">
                                          #{c.id.substring(0, 8)}
                                        </span>
                                        <span className="font-semibold text-ink dark:text-plate-ink text-sm truncate">{c.title}</span>
                                        {roles.map(role => (
                                          <span
                                            key={role}
                                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${
                                              role === 'Applicant'
                                                ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/25 dark:text-purple-400'
                                                : 'bg-amber-50 text-amber-700 dark:bg-amber-900/25 dark:text-amber-400'
                                            }`}
                                          >
                                            {role}
                                          </span>
                                        ))}
                                      </div>
                                      <p className="text-xs text-ink-faint dark:text-plate-ink-faint line-clamp-1">{c.description}</p>
                                    </div>
                                    <span className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
                                      progress.percent === 100
                                        ? 'bg-edamame/10 text-edamame-700 dark:bg-edamame/15 dark:text-edamame-400'
                                        : 'bg-blue-50 text-blue-700 dark:bg-blue-900/25 dark:text-blue-400'
                                    }`}>
                                      {progress.label}
                                    </span>
                                  </div>
                                  <div className="h-1.5 w-full bg-paper-2 dark:bg-plate-card rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full progress-fill ${
                                        progress.percent === 100 ? 'bg-edamame' : 'bg-blue-500'
                                      }`}
                                      style={{ width: `${progress.percent}%` }}
                                    />
                                  </div>
                                  <div className="mt-1.5 text-[10px] text-ink-faint dark:text-plate-ink-faint text-right">
                                    Started {format(new Date(c.startDate), 'MMM d, yyyy')}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Add/Edit Client Modal */}
        {isModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/55 p-4 backdrop-blur-sm"
            onClick={() => setIsModalOpen(false)}
          >
            <div
              className="modal-content bg-paper-2 dark:bg-plate-card rounded-2xl shadow-2xl w-[560px] max-w-[92vw] max-h-[88vh] overflow-y-auto custom-scrollbar border border-ink/10 dark:border-plate-ink/15 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-[17px] font-bold text-ink dark:text-plate-ink tracking-[-0.015em]">
                  {editingId ? 'Edit Client Profile' : 'Add New Client'}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-faint dark:text-plate-ink-faint hover:bg-paper-2 dark:hover:bg-plate-card hover:text-ink-soft dark:hover:text-plate-ink transition-colors"
                  aria-label="Close"
                >
                  &times;
                </button>
              </div>

              {!editingId && (
                <div className="flex items-center gap-3 mt-4 px-4 py-3 rounded-[11px] bg-edamame/8 dark:bg-edamame/12 border border-edamame/25 dark:border-edamame/20">
                  <Scan size={18} strokeWidth={1.8} className="text-edamame-600 dark:text-edamame-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-bold text-ink dark:text-plate-ink">Scan Passport</p>
                    <p className="text-[11px] text-ink-soft dark:text-plate-ink-soft mt-0.5">
                      {justScanned ? 'Details auto-filled from the scanned passport.' : 'Upload a passport photo to auto-fill client details'}
                    </p>
                  </div>
                  <button
                    onClick={() => setIsPassportScannerOpen(true)}
                    className="btn-press flex-shrink-0 flex items-center gap-1.5 px-[15px] py-[7px] rounded-lg bg-edamame hover:bg-edamame-700 text-white text-xs font-bold transition-colors"
                  >
                    {justScanned && <Check size={13} strokeWidth={2.5} />}
                    {justScanned ? 'Scanned' : 'Scan'}
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-[13px] mt-[18px]">
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.08em] mb-[5px]">Full name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint dark:text-plate-ink-faint" size={16} strokeWidth={1.8} />
                    <input
                      type="text"
                      value={newClient.name || ''}
                      onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                      className="focus-ring w-full pl-10 pr-3 py-[9px] bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-[9px] focus:border-edamame text-[13px] text-ink dark:text-plate-ink outline-none transition-colors"
                      placeholder="e.g. John Doe"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.08em] mb-[5px]">Date of birth</label>
                  <input
                    type="date"
                    value={newClient.dob || ''}
                    onChange={(e) => setNewClient({ ...newClient, dob: e.target.value })}
                    className="focus-ring w-full px-3 py-2 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-[9px] focus:border-edamame text-[13px] text-ink dark:text-plate-ink outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.08em] mb-[5px]">Phone</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint dark:text-plate-ink-faint" size={16} strokeWidth={1.8} />
                    <input
                      type="text"
                      value={newClient.phone || ''}
                      onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                      className="focus-ring w-full pl-10 pr-3 py-[9px] bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-[9px] focus:border-edamame text-[13px] text-ink dark:text-plate-ink outline-none transition-colors"
                      placeholder="+61 400…"
                    />
                  </div>
                </div>

                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.08em] mb-[5px]">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint dark:text-plate-ink-faint" size={16} strokeWidth={1.8} />
                    <input
                      type="email"
                      value={newClient.email || ''}
                      onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                      className="focus-ring w-full pl-10 pr-3 py-[9px] bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-[9px] focus:border-edamame text-[13px] text-ink dark:text-plate-ink outline-none transition-colors"
                      placeholder="john@example.com"
                    />
                  </div>
                </div>

                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.08em] mb-[5px]">Residential address</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-2.5 text-ink-faint dark:text-plate-ink-faint" size={16} strokeWidth={1.8} />
                    <textarea
                      rows={2}
                      value={newClient.address || ''}
                      onChange={(e) => setNewClient({ ...newClient, address: e.target.value })}
                      className="focus-ring w-full pl-10 pr-3 py-[9px] bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-[9px] focus:border-edamame text-[13px] text-ink dark:text-plate-ink outline-none transition-colors resize-none"
                      placeholder="123 Street Name, Suburb, State, Postcode"
                    />
                  </div>
                </div>
              </div>

              <div className="text-[10px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.08em] mt-5 pt-4 border-t border-ink/10 dark:border-plate-ink/15">
                Passport &amp; identity (optional)
              </div>

              <div className="grid grid-cols-2 gap-[13px] mt-3">
                <div>
                  <label className="block text-[10px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.08em] mb-[5px]">Passport number</label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint dark:text-plate-ink-faint" size={16} strokeWidth={1.8} />
                    <input
                      type="text"
                      value={newClient.passportNumber || ''}
                      onChange={(e) => setNewClient({ ...newClient, passportNumber: e.target.value })}
                      className="focus-ring w-full pl-10 pr-3 py-[9px] bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-[9px] focus:border-edamame text-[13px] text-ink dark:text-plate-ink outline-none transition-colors"
                      placeholder="e.g. PA1234567"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.08em] mb-[5px]">Passport expiry</label>
                  <input
                    type="date"
                    value={newClient.passportExpiry || ''}
                    onChange={(e) => setNewClient({ ...newClient, passportExpiry: e.target.value })}
                    className="focus-ring w-full px-3 py-2 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-[9px] focus:border-edamame text-[13px] text-ink dark:text-plate-ink outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.08em] mb-[5px]">Nationality</label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint dark:text-plate-ink-faint" size={16} strokeWidth={1.8} />
                    <input
                      type="text"
                      value={newClient.nationality || ''}
                      onChange={(e) => setNewClient({ ...newClient, nationality: e.target.value })}
                      className="focus-ring w-full pl-10 pr-3 py-[9px] bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-[9px] focus:border-edamame text-[13px] text-ink dark:text-plate-ink outline-none transition-colors"
                      placeholder="e.g. Australian"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.08em] mb-[5px]">Gender</label>
                  <select
                    value={newClient.gender || ''}
                    onChange={(e) => setNewClient({ ...newClient, gender: e.target.value })}
                    className="focus-ring w-full px-3 py-2 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-[9px] focus:border-edamame text-[13px] text-ink dark:text-plate-ink outline-none transition-colors"
                  >
                    <option value="">— Select —</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Non-binary">Non-binary</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 mt-[22px]">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-[9px] text-[12.5px] font-semibold text-ink-soft dark:text-plate-ink-soft border border-ink/15 dark:border-plate-ink/20 hover:bg-paper-2 dark:hover:bg-plate-card rounded-[9px] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveClient}
                  disabled={!newClient.name}
                  className="btn-press px-5 py-[9px] text-[13px] font-bold text-white bg-edamame hover:bg-edamame-700 rounded-[9px] shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Save Profile
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Passport Scanner Modal */}
        <PassportScanner
          isOpen={isPassportScannerOpen}
          onClose={() => setIsPassportScannerOpen(false)}
          onResult={handlePassportScanResult}
        />

        {/* CSV Import Modal */}
        <CsvImport
          isOpen={isCsvModalOpen}
          onClose={() => setIsCsvModalOpen(false)}
          onImport={(importedClients) => {
            importedClients.forEach((client) => onAddClient(client));
          }}
        />
      </div>
    </div>
  );
};
