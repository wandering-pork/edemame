import React, { useMemo, useState } from 'react';
import { Search, Sparkles, Send, Plus, ListChecks, StickyNote, CalendarCheck, Wand2, Package, FolderKanban, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import type { CaseTabKind, CaseToolKind, CaseViewKind, FocusChatMessage, FocusConversation } from '../../types';

export interface WorkspaceCatalogItem {
  kind: CaseTabKind;
  label: string;
  description: string;
}

export interface MessageRecommendation {
  kind: CaseTabKind;
  label: string;
}

const VIEW_ICONS: Record<CaseViewKind, React.ElementType> = {
  tasks: CalendarCheck,
  checklist: ListChecks,
  notes: StickyNote,
};

const TOOL_ICONS: Record<CaseToolKind, React.ElementType> = {
  'checklist-generator': Wand2,
  'auto-packager': Package,
  'bundle-builder-820': FolderKanban,
};

interface WorkspaceProps {
  viewCatalog: WorkspaceCatalogItem[];
  toolCatalog: WorkspaceCatalogItem[];
  recommendedViewKinds: CaseTabKind[];
  recommendedToolKinds: CaseTabKind[];
  onOpen: (kind: CaseTabKind) => void;

  // Chat with Edamame — refreshes recommendations dynamically
  conversationMessages: FocusChatMessage[];
  chatInput: string;
  setChatInput: (v: string) => void;
  isSending: boolean;
  onSend: () => void;
  onNewChat: () => void;
  messageRecommendations: Record<string, MessageRecommendation[]>;
  chatEndRef: React.RefObject<HTMLDivElement>;
}

function CatalogSection({
  title,
  items,
  recommended,
  onOpen,
  icons,
}: {
  title: string;
  items: WorkspaceCatalogItem[];
  recommended: CaseTabKind[];
  onOpen: (kind: CaseTabKind) => void;
  icons: Record<string, React.ElementType>;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? items.filter(i => i.label.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)) : items;
    if (q) return base;
    // AI-recommended first (heuristic order from parent), then the rest
    const recSet = new Set(recommended);
    return [...base].sort((a, b) => {
      const ra = recSet.has(a.kind) ? recommended.indexOf(a.kind) : 999;
      const rb = recSet.has(b.kind) ? recommended.indexOf(b.kind) : 999;
      return ra - rb;
    });
  }, [items, query, recommended]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[12.5px] font-bold text-gray-900 dark:text-white">{title}</span>
      </div>
      <div className="relative mb-3">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 dark:text-slate-600" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={`Quick search ${title.toLowerCase()}…`}
          className="w-full pl-8 pr-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-[12px] text-gray-700 dark:text-slate-200 outline-none focus:border-edamame transition-colors"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {filtered.map(item => {
          const Icon = icons[item.kind] || Sparkles;
          const isRecommended = !query && recommended.includes(item.kind);
          return (
            <button
              key={item.kind}
              onClick={() => onOpen(item.kind)}
              className="group relative text-left flex items-start gap-2.5 p-3 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-edamame transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-edamame/10 dark:bg-edamame/15 flex items-center justify-center flex-shrink-0">
                <Icon size={15} className="text-edamame" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12.5px] font-bold text-gray-900 dark:text-white truncate">{item.label}</span>
                  {isRecommended && (
                    <span className="text-[9px] font-bold px-1.5 py-px rounded-full bg-edamame/10 text-edamame-700 dark:text-edamame-400 flex-shrink-0">AI PICK</span>
                  )}
                </div>
                <p className="text-[10.5px] text-gray-400 dark:text-slate-500 mt-0.5 leading-snug">{item.description}</p>
              </div>
              <ExternalLink size={12} className="absolute top-3 right-3 text-gray-200 dark:text-slate-700 group-hover:text-edamame transition-colors" />
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-6 text-[12px] text-gray-400 dark:text-slate-500">
            No matches for "{query}".
          </div>
        )}
      </div>
    </div>
  );
}

export const Workspace: React.FC<WorkspaceProps> = ({
  viewCatalog,
  toolCatalog,
  recommendedViewKinds,
  recommendedToolKinds,
  onOpen,
  conversationMessages,
  chatInput,
  setChatInput,
  isSending,
  onSend,
  onNewChat,
  messageRecommendations,
  chatEndRef,
}) => {
  const labelFor = (kind: CaseTabKind) =>
    [...viewCatalog, ...toolCatalog].find(i => i.kind === kind)?.label || kind;

  return (
    <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
      {/* View + Tools */}
      <div className="space-y-6 min-w-0">
        <CatalogSection title="View" items={viewCatalog} recommended={recommendedViewKinds} onOpen={onOpen} icons={VIEW_ICONS} />
        <CatalogSection title="Tools" items={toolCatalog} recommended={recommendedToolKinds} onOpen={onOpen} icons={TOOL_ICONS} />
      </div>

      {/* Chat with Edamame */}
      <aside className="flex flex-col bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden max-h-[560px]">
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-gray-100 dark:border-slate-800 flex-shrink-0">
          <Sparkles size={15} className="text-edamame" strokeWidth={1.8} />
          <span className="text-[13px] font-bold text-gray-900 dark:text-white">Chat with Edamame</span>
          <button onClick={onNewChat} className="ml-auto flex items-center gap-1 text-[11.5px] font-semibold text-edamame hover:text-edamame-600 transition-colors">
            <Plus size={12} strokeWidth={2.2} /> New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 custom-scrollbar min-w-0">
          {conversationMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-2 pb-8">
              <div className="w-10 h-10 rounded-2xl bg-edamame/10 dark:bg-edamame/15 flex items-center justify-center mb-3">
                <Sparkles size={18} className="text-edamame dark:text-edamame-400" />
              </div>
              <p className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">Not sure where to start?</p>
              <p className="text-xs text-gray-400 dark:text-slate-500 leading-relaxed">
                Tell Edamame what you're trying to do and the View / Tools suggestions above will refresh.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {conversationMessages.map(msg => (
                <div key={msg.id} className="min-w-0">
                  {msg.role === 'user' ? (
                    <div className="flex justify-end">
                      <div className="max-w-[90%] rounded-xl rounded-br-sm bg-edamame text-white px-3 py-2">
                        <p className="text-[12.5px] whitespace-pre-wrap leading-relaxed break-words">{msg.content}</p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[12.5px] text-gray-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                      {messageRecommendations[msg.id]?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {messageRecommendations[msg.id].map(rec => (
                            <button
                              key={rec.kind}
                              onClick={() => onOpen(rec.kind)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-edamame-700 dark:text-edamame-400 underline decoration-edamame/40 hover:decoration-edamame transition-colors"
                            >
                              {labelFor(rec.kind)}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="text-[10px] text-gray-300 dark:text-slate-600 mt-1.5">{format(new Date(msg.createdAt), 'HH:mm')}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {isSending && (
            <div className="flex items-center gap-1 pl-1 mt-4">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-slate-600 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-slate-600 animate-bounce" style={{ animationDelay: '120ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-slate-600 animate-bounce" style={{ animationDelay: '240ms' }} />
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="flex items-center gap-2 px-3.5 py-3 border-t border-gray-100 dark:border-slate-800 flex-shrink-0">
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            placeholder="What are you trying to do?"
            className="flex-1 min-w-0 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-[12.5px] text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-slate-500 outline-none focus:border-edamame transition-all"
          />
          <button
            onClick={onSend}
            disabled={!chatInput.trim() || isSending}
            className="flex-shrink-0 w-8 h-8 rounded-lg bg-edamame hover:bg-edamame-600 text-white flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send size={14} />
          </button>
        </div>
      </aside>
    </div>
  );
};

export default Workspace;
