import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Client, Case, Task } from '../types';
import { Search, Plus, User, Users, Phone, Mail, MapPin, ChevronDown, ChevronUp, Briefcase, Upload, Globe, FileText, Camera } from 'lucide-react';
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

export const Clients: React.FC<ClientsProps> = ({ clients, cases, tasks, onAddClient, onUpdateClient }) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newClient, setNewClient] = useState<Partial<Client>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isPassportScannerOpen, setIsPassportScannerOpen] = useState(false);

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm)
  );

  const getClientCases = (clientId: string) => {
    return cases.filter(c => c.clientId === clientId);
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
    setIsModalOpen(true);
  };

  const handleSaveClient = () => {
    if (!newClient.name || !newClient.email) return;

    if (editingId) {
      onUpdateClient({
        id: editingId,
        name: newClient.name!,
        dob: newClient.dob || '',
        phone: newClient.phone || '',
        email: newClient.email!,
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
        email: newClient.email!,
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
    setNewClient({
      ...newClient,
      name: data.name,
      dob: data.dob,
      nationality: data.nationality,
      passportNumber: data.passportNumber,
      passportExpiry: data.passportExpiry,
      gender: data.gender,
    });
    setIsPassportScannerOpen(false);
  };

  return (
    <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-gray-50 dark:bg-slate-950 min-h-screen transition-colors duration-200 page-enter">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white font-fredoka tracking-tight">
              Clients
            </h1>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
              Manage client profiles and case history.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <div className="relative flex-1 sm:flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" size={16} />
              <input
                type="text"
                placeholder="Search clients..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl text-sm outline-none focus:border-edamame/50 dark:focus:border-edamame/30 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 transition-colors"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setIsCsvModalOpen(true)}
                className="btn-press flex items-center justify-center gap-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 px-4 py-2.5 rounded-xl font-medium transition-colors text-sm whitespace-nowrap"
              >
                <Upload size={15} />
                Import
              </button>
              <button
                onClick={() => handleOpenModal()}
                className="btn-press flex items-center justify-center gap-2 bg-edamame hover:bg-edamame-600 text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-edamame/25 text-sm whitespace-nowrap"
              >
                <Plus size={16} />
                Add Client
              </button>
            </div>
          </div>
        </div>

        {/* Clients list */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-gray-100 dark:border-slate-800 bg-gray-50/80 dark:bg-slate-800/60">
          <div className="col-span-5 md:col-span-4 text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">Name</div>
          <div className="col-span-5 md:col-span-4 text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">Contact</div>
          <div className="col-span-2 hidden md:block text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">D.O.B</div>
          <div className="col-span-2 text-right text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">Actions</div>
        </div>

        {filteredClients.length === 0 ? (
          <div className="py-16 text-center">
            <div className="flex flex-col items-center gap-3 text-gray-400 dark:text-slate-600">
              <Users size={32} className="opacity-30" />
              <span className="text-sm">No clients found.</span>
            </div>
          </div>
        ) : (
          filteredClients.map(client => (
            <div key={client.id} className="border-b border-gray-50 dark:border-slate-800/80 last:border-0">
              <div
                className="grid grid-cols-12 gap-4 px-5 py-4 items-center cursor-pointer hover:bg-gray-50/80 dark:hover:bg-slate-800/40 transition-colors"
                onClick={() => toggleExpand(client.id)}
              >
                <div className="col-span-5 md:col-span-4 flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-edamame/10 dark:bg-edamame/15 text-edamame-700 dark:text-edamame-400 flex items-center justify-center font-bold text-xs flex-shrink-0 uppercase">
                    {client.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                  </div>
                  <div className="font-semibold text-gray-900 dark:text-white text-sm truncate">{client.name}</div>
                </div>

                <div className="col-span-5 md:col-span-4 flex flex-col gap-0.5 min-w-0">
                  <div className="text-xs text-gray-600 dark:text-slate-300 flex items-center gap-1.5 truncate">
                    <Mail size={11} className="text-gray-400 flex-shrink-0" />
                    {client.email}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-slate-500 flex items-center gap-1.5">
                    <Phone size={10} className="flex-shrink-0" />
                    {client.phone}
                  </div>
                </div>

                <div className="col-span-2 hidden md:block text-sm text-gray-500 dark:text-slate-400">
                  {client.dob ? format(new Date(client.dob), 'dd MMM yyyy') : '—'}
                </div>

                <div className="col-span-2 flex items-center justify-end gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/visa-advisor?clientId=${client.id}`); }}
                    className="text-xs font-semibold text-gray-400 hover:text-edamame-600 dark:hover:text-edamame-400 transition-colors px-2 py-1 hover:bg-edamame/8 rounded-lg"
                  >
                    Visa Check
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleOpenModal(client); }}
                    className="text-xs font-semibold text-gray-400 hover:text-edamame-600 dark:hover:text-edamame-400 transition-colors px-2 py-1 hover:bg-edamame/8 rounded-lg"
                  >
                    Edit
                  </button>
                  <button className="text-gray-400 dark:text-slate-600 hover:text-gray-600 dark:hover:text-slate-400 transition-colors">
                    {expandedClientId === client.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                </div>
              </div>

              {/* Case history expansion */}
              {expandedClientId === client.id && (
                <div className="px-5 pb-5 pt-1 bg-gray-50/60 dark:bg-slate-800/20 border-t border-gray-100 dark:border-slate-800/60">
                  <div className="ml-12">
                    <h3 className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                      <Briefcase size={12} />
                      Case History
                    </h3>

                    {getClientCases(client.id).length === 0 ? (
                      <p className="text-xs text-gray-400 dark:text-slate-600 italic">No cases linked to this client.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {getClientCases(client.id).map(c => {
                          const progress = getCaseProgress(c.id);
                          return (
                            <div key={c.id} className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-3.5 card-lift">
                              <div className="flex justify-between items-start mb-2.5 gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                    <span className="text-[10px] font-mono bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-500 px-1.5 py-0.5 rounded">
                                      #{c.id.substring(0, 8)}
                                    </span>
                                    <span className="font-semibold text-gray-900 dark:text-white text-sm truncate">{c.title}</span>
                                  </div>
                                  <p className="text-xs text-gray-400 dark:text-slate-500 line-clamp-1">{c.description}</p>
                                </div>
                                <span className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
                                  progress.percent === 100
                                    ? 'bg-edamame/10 text-edamame-700 dark:bg-edamame/15 dark:text-edamame-400'
                                    : 'bg-blue-50 text-blue-700 dark:bg-blue-900/25 dark:text-blue-400'
                                }`}>
                                  {progress.label}
                                </span>
                              </div>
                              <div className="h-1.5 w-full bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full progress-fill ${
                                    progress.percent === 100 ? 'bg-edamame' : 'bg-blue-500'
                                  }`}
                                  style={{ width: `${progress.percent}%` }}
                                />
                              </div>
                              <div className="mt-1.5 text-[10px] text-gray-400 dark:text-slate-600 text-right">
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
          ))
        )}
      </div>

      {/* Add/Edit Client Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/50 dark:bg-black/70 p-4 backdrop-blur-sm">
          <div className="modal-content bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 dark:border-slate-800">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800">
              <h3 className="font-semibold text-lg text-gray-900 dark:text-white">
                {editingId ? 'Edit Client Profile' : 'Add New Client'}
              </h3>
            </div>
            
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {!editingId && (
                <div className="bg-edamame/8 dark:bg-edamame/12 border border-edamame/30 dark:border-edamame/20 rounded-xl p-4 mb-2 flex items-center gap-3">
                  <Camera size={18} className="text-edamame-600 dark:text-edamame-400 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white mb-0.5">Scan Passport</p>
                    <p className="text-xs text-gray-600 dark:text-slate-400">Upload a passport photo to auto-fill client details</p>
                  </div>
                  <button
                    onClick={() => setIsPassportScannerOpen(true)}
                    className="btn-press px-4 py-2 bg-edamame hover:bg-edamame-600 text-white text-xs font-semibold rounded-lg transition-all whitespace-nowrap"
                  >
                    Scan
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1 uppercase">Full Name</label>
                <div className="relative">
                   <User className="absolute left-3 top-2.5 text-gray-400" size={16} />
                   <input 
                    type="text"
                    value={newClient.name || ''}
                    onChange={(e) => setNewClient({...newClient, name: e.target.value})}
                    className="w-full pl-10 pr-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 text-gray-900 dark:text-white outline-none"
                    placeholder="e.g. John Doe"
                   />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1 uppercase">Date of Birth</label>
                <input 
                  type="date"
                  value={newClient.dob || ''}
                  onChange={(e) => setNewClient({...newClient, dob: e.target.value})}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 text-gray-900 dark:text-white outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1 uppercase">Email</label>
                   <div className="relative">
                      <Mail className="absolute left-3 top-2.5 text-gray-400" size={16} />
                      <input 
                        type="email"
                        value={newClient.email || ''}
                        onChange={(e) => setNewClient({...newClient, email: e.target.value})}
                        className="w-full pl-10 pr-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 text-gray-900 dark:text-white outline-none"
                        placeholder="john@example.com"
                      />
                   </div>
                 </div>
                 <div>
                   <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1 uppercase">Phone</label>
                   <div className="relative">
                      <Phone className="absolute left-3 top-2.5 text-gray-400" size={16} />
                      <input 
                        type="text"
                        value={newClient.phone || ''}
                        onChange={(e) => setNewClient({...newClient, phone: e.target.value})}
                        className="w-full pl-10 pr-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 text-gray-900 dark:text-white outline-none"
                        placeholder="+61 400..."
                      />
                   </div>
                 </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1 uppercase">Residential Address</label>
                <div className="relative">
                   <MapPin className="absolute left-3 top-2.5 text-gray-400" size={16} />
                   <textarea
                    rows={2}
                    value={newClient.address || ''}
                    onChange={(e) => setNewClient({...newClient, address: e.target.value})}
                    className="w-full pl-10 pr-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 text-gray-900 dark:text-white outline-none resize-none"
                    placeholder="123 Street Name, Suburb, State, Postcode"
                   />
                </div>
              </div>

              {/* Passport & Identity Fields */}
              <div className="pt-2 border-t border-gray-100 dark:border-slate-800">
                <p className="text-xs text-gray-400 dark:text-slate-500 mb-3 uppercase font-medium tracking-wider">Passport & Identity (Optional)</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1 uppercase">Passport Number</label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-2.5 text-gray-400" size={16} />
                    <input
                      type="text"
                      value={newClient.passportNumber || ''}
                      onChange={(e) => setNewClient({...newClient, passportNumber: e.target.value})}
                      className="w-full pl-10 pr-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 text-gray-900 dark:text-white outline-none"
                      placeholder="e.g. PA1234567"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1 uppercase">Passport Expiry</label>
                  <input
                    type="date"
                    value={newClient.passportExpiry || ''}
                    onChange={(e) => setNewClient({...newClient, passportExpiry: e.target.value})}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 text-gray-900 dark:text-white outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1 uppercase">Nationality</label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-2.5 text-gray-400" size={16} />
                    <input
                      type="text"
                      value={newClient.nationality || ''}
                      onChange={(e) => setNewClient({...newClient, nationality: e.target.value})}
                      className="w-full pl-10 pr-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 text-gray-900 dark:text-white outline-none"
                      placeholder="e.g. Australian"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1 uppercase">Gender</label>
                  <select
                    value={newClient.gender || ''}
                    onChange={(e) => setNewClient({...newClient, gender: e.target.value})}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 text-gray-900 dark:text-white outline-none"
                  >
                    <option value="">-- Select --</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-2">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveClient}
                disabled={!newClient.name || !newClient.email}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 dark:hover:bg-green-500 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
