import React, { useEffect, useState } from 'react';
import { Sparkles, Plus, Send, Github, Check, X, ChevronDown } from 'lucide-react';
import { BrandImage } from '../BrandImage';
import { format } from 'date-fns';
import type { FocusChatMessage, FocusConversation } from '../../types';

// ---------------------------------------------------------------------------
// Rich message rendering — turns the assistant's markdown-ish reply into
// headings / paragraphs / bullet lists so the panel never shows raw markdown.
// ---------------------------------------------------------------------------

type Block =
  | { kind: 'h'; text: string }
  | { kind: 'b'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'li'; text: string };

function parseRichText(raw: string): Block[] {
  const lines = raw.replace(/\r/g, '').split('\n');
  const blocks: Block[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    // Headings: markdown # / ## / ###
    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      blocks.push({ kind: h[1].length <= 1 ? 'h' : 'b', text: h[2] });
      continue;
    }
    // Bullets: -, *, • or numbered lists
    const li = t.match(/^([-*•]|\d+[.)])\s+(.*)$/);
    if (li) {
      blocks.push({ kind: 'li', text: li[2] });
      continue;
    }
    // A short line that is entirely bold reads as a sub-heading
    const bold = t.match(/^\*\*(.+)\*\*:?$/);
    if (bold) {
      blocks.push({ kind: 'b', text: bold[1] });
      continue;
    }
    blocks.push({ kind: 'p', text: t });
  }
  return blocks;
}

// Strip inline markdown emphasis markers (**bold**, *italic*, `code`)
function stripInline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[^*])\*(?!\*)([^*]+)\*/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1');
}

// Splits a line into plain-text segments and markdown links ([text](url)),
// so assistant replies that cite a GitHub issue link (e.g. the duplicate-check
// flow, or a confirmed "issue filed" message) render as real anchors instead
// of raw markdown syntax.
function renderInline(s: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = linkRe.exec(s))) {
    if (m.index > lastIndex) {
      nodes.push(<React.Fragment key={key++}>{stripInline(s.slice(lastIndex, m.index))}</React.Fragment>);
    }
    nodes.push(
      <a
        key={key++}
        href={m[2]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-edamame hover:text-edamame-600 underline underline-offset-2 font-semibold"
      >
        {m[1]}
      </a>
    );
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < s.length) {
    nodes.push(<React.Fragment key={key++}>{stripInline(s.slice(lastIndex))}</React.Fragment>);
  }
  return nodes;
}

const RichMessage: React.FC<{ text: string }> = ({ text }) => {
  const blocks = parseRichText(text);
  return (
    <div>
      {blocks.map((b, i) => {
        if (b.kind === 'h') {
          return (
            <div key={i} className="text-[13px] font-extrabold text-ink dark:text-plate-ink leading-relaxed">
              {renderInline(b.text)}
            </div>
          );
        }
        if (b.kind === 'b') {
          return (
            <div key={i} className="text-xs font-bold text-ink dark:text-plate-ink leading-relaxed mt-3.5">
              {renderInline(b.text)}
            </div>
          );
        }
        if (b.kind === 'li') {
          return (
            <div key={i} className="text-xs text-ink-soft dark:text-plate-ink-soft leading-relaxed mt-1.5 pl-3 break-words">
              <span className="text-edamame mr-1.5">·</span>
              {renderInline(b.text)}
            </div>
          );
        }
        return (
          <div key={i} className="text-xs text-ink-soft dark:text-plate-ink-soft leading-relaxed mt-2 break-words">
            {renderInline(b.text)}
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Drafted GitHub issue card — the agentic defect/feature-request flow
// (GitHub issue #15). Rendered instead of plain text when a chat turn
// resulted in a drafted issue awaiting the user's explicit Confirm/Cancel.
// ---------------------------------------------------------------------------

const IssueDraftCard: React.FC<{
  message: FocusChatMessage;
  isSubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ message, isSubmitting, onConfirm, onCancel }) => {
  const draft = message.issueDraft;
  if (!draft) return null;

  if (message.issueDraftResolved === 'cancelled') {
    return (
      <div className="text-xs text-ink-faint dark:text-plate-ink-faint italic mt-2">
        Draft discarded — no issue was filed.
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card/60 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-ink/15 dark:border-plate-ink/20">
        <Github size={13} className="text-ink-soft dark:text-plate-ink-soft" />
        <span className="text-[11px] font-bold text-ink-soft dark:text-plate-ink-soft uppercase tracking-wide">
          Drafted GitHub issue
        </span>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-xs font-bold text-ink dark:text-plate-ink break-words">{draft.title}</p>
        <p className="text-xs text-ink-soft dark:text-plate-ink-soft whitespace-pre-wrap leading-relaxed mt-1.5 break-words">
          {draft.body}
        </p>
      </div>
      {message.issueDraftResolved !== 'filed' && (
        <>
          <div className="px-3 pb-2 -mt-0.5 text-[10.5px] text-amber-700 dark:text-amber-400 leading-relaxed">
            Filing posts this title and body to the <strong>public</strong> GitHub repo{' '}
            <span className="font-mono">wandering-pork/edemame</span> — visible to anyone on the internet.
            Review it for client-identifying details before confirming.
          </div>
          <div className="flex items-center gap-2 px-3 py-2 border-t border-ink/15 dark:border-plate-ink/20">
            <button
              onClick={onConfirm}
              disabled={isSubmitting}
              className="btn-press flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-edamame hover:bg-edamame-600 text-white transition-colors disabled:opacity-50"
            >
              <Check size={12} strokeWidth={2.5} />
              {isSubmitting ? 'Filing…' : 'Confirm & File Publicly'}
            </button>
            <button
              onClick={onCancel}
              disabled={isSubmitting}
              className="btn-press flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-ink/20 dark:border-plate-ink/25 text-ink-soft dark:text-plate-ink-soft hover:bg-paper-2 dark:hover:bg-plate-card transition-colors disabled:opacity-50"
            >
              <X size={12} strokeWidth={2.5} />
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
};

/** A suggested next step for the case (`lib/caseOverview.ts`'s `suggestQuickActions()`). */
export interface EdieSuggestion {
  id: string;
  label: string;
  detail?: string;
  onSelect: () => void;
}

/** One of Edie's fixed AI skills (draft cover letter, summarise, …). */
export interface EdieSkill {
  id: string;
  label: string;
  /** Tooltip saying what the skill does — e.g. that it asks Edie in the chat. */
  title?: string;
  onSelect: () => void;
}

interface EdiePanelProps {
  onClose: () => void;
  /** Under the name in the header, e.g. "Case assistant". */
  subtitle: string;
  /** Heading over the suggestions and skills. */
  helpHeading: string;
  /** Suggested next steps; omit for a page with none (the section then shows skills only). */
  suggestions?: EdieSuggestion[];
  skills: EdieSkill[];
  /** Shown in the message area before the first message. */
  emptyText: string;
  placeholder: string;
  conversations: FocusConversation[];
  activeConv?: FocusConversation;
  activeConvId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  chatInput: string;
  setChatInput: (v: string) => void;
  isSending: boolean;
  onSend: () => void;
  chatEndRef: React.RefObject<HTMLDivElement>;
  /** Focused when the panel opens. */
  inputRef: React.RefObject<HTMLInputElement>;
  /** Message id of a drafted issue currently being filed (Confirm clicked, awaiting response). */
  filingIssueMessageId?: string | null;
  onConfirmIssueDraft: (messageId: string) => void;
  onCancelIssueDraft: (messageId: string) => void;
}

/** Suggested next steps as stacked cards (label + detail). */
const SuggestionCards: React.FC<{ actions: EdieSuggestion[] }> = ({ actions }) => (
  <div className="space-y-2">
    {actions.map(action => (
      <button
        key={action.id}
        type="button"
        onClick={action.onSelect}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-ink/10 dark:border-plate-ink/15 bg-paper dark:bg-plate text-left hover:border-edamame transition-colors"
      >
        <span className="w-7 h-7 rounded-lg bg-edamame/10 text-edamame-700 dark:text-edamame-400 flex items-center justify-center flex-shrink-0">
          <Sparkles size={13} />
        </span>
        <span className="min-w-0">
          <span className="block text-[12.5px] font-semibold text-ink dark:text-plate-ink">{action.label}</span>
          {action.detail && <span className="block text-[11px] text-ink-faint dark:text-plate-ink-faint truncate">{action.detail}</span>}
        </span>
      </button>
    ))}
  </div>
);


/**
 * The inside of Edie's panel: header, suggestions and skills, and the chat.
 * The panel frame itself is `components/edie/EdieShell.tsx` (on every page);
 * Case Details renders this into it with its case's suggestions and chat,
 * and every other page gets the general version (`EdieGeneral.tsx`).
 *
 * Edie holds AI help only, so nothing in it is reachable another way on the
 * page: navigation lives in the tab row, case admin in Case actions, and
 * document tools on the tab their data belongs to.
 */
export const EdiePanel: React.FC<EdiePanelProps> = ({
  onClose,
  subtitle,
  helpHeading,
  suggestions,
  skills,
  emptyText,
  placeholder,
  conversations,
  activeConv,
  activeConvId,
  onSelectConversation,
  onNewChat,
  chatInput,
  setChatInput,
  isSending,
  onSend,
  chatEndRef,
  inputRef,
  filingIssueMessageId,
  onConfirmIssueDraft,
  onCancelIssueDraft,
}) => {
  const isEmpty = !activeConv || activeConv.messages.length === 0;
  // Once a conversation is under way the suggestions fold into one row, so
  // the chat gets the height. They unfold again for an empty chat.
  const [helpOpen, setHelpOpen] = useState(true);
  useEffect(() => { setHelpOpen(isEmpty); }, [isEmpty, activeConvId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  const chipCls = 'btn-press text-[11.5px] font-semibold px-2.5 py-1.5 rounded-full border border-edamame/35 text-edamame-700 dark:text-edamame-400 bg-edamame/[0.07] hover:bg-edamame/15 transition-colors';

  return (
    <div
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
      className="flex flex-col h-full min-h-0"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-ink/10 dark:border-plate-ink/15 flex-shrink-0">
        <span className="w-9 h-9 rounded-xl bg-edamame/10 dark:bg-edamame/15 flex items-center justify-center flex-shrink-0">
          <BrandImage variant="mark" alt="" className="w-7 h-7 object-contain" />
        </span>
        <div className="min-w-0">
          <div className="text-[14px] font-bold text-ink dark:text-plate-ink leading-tight">Edie</div>
          <div className="text-[11px] text-ink-faint dark:text-plate-ink-faint">{subtitle}</div>
        </div>
        <button
          onClick={onNewChat}
          className="ml-auto flex items-center gap-1 text-[11.5px] font-semibold text-edamame hover:text-edamame-600 transition-colors"
        >
          <Plus size={12} strokeWidth={2.2} />
          New chat
        </button>
        <button
          onClick={onClose}
          aria-label="Close Edie"
          title="Close (Esc or Ctrl+J)"
          className="p-1.5 rounded-lg text-ink-faint dark:text-plate-ink-faint hover:text-ink dark:hover:text-plate-ink hover:bg-paper dark:hover:bg-plate transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Suggestions + skills */}
      <div className="border-b border-ink/10 dark:border-plate-ink/15 flex-shrink-0">
        <button
          onClick={() => setHelpOpen(o => !o)}
          aria-expanded={helpOpen}
          className="w-full flex items-center gap-1.5 px-4 pt-3 pb-2 text-left"
        >
          <span className="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint dark:text-plate-ink-faint truncate">
            {helpHeading}
          </span>
          {!helpOpen && !!suggestions?.length && (
            <span className="text-[10px] font-bold px-1.5 py-px rounded-full bg-edamame/10 text-edamame-700 dark:text-edamame-400">{suggestions.length}</span>
          )}
          <ChevronDown size={13} className={`ml-auto flex-shrink-0 text-ink-faint dark:text-plate-ink-faint transition-transform ${helpOpen ? 'rotate-180' : ''}`} />
        </button>
        {helpOpen && (
          <div className="px-4 pb-3.5 space-y-3 max-h-[45vh] overflow-y-auto custom-scrollbar">
            {suggestions && (suggestions.length > 0 ? (
              <SuggestionCards actions={suggestions} />
            ) : (
              <p className="text-[12px] text-ink-faint dark:text-plate-ink-faint">Nothing needs doing right now.</p>
            ))}
            <div>
              {suggestions && <div className="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint dark:text-plate-ink-faint mb-1.5">Skills</div>}
              <div className="flex flex-wrap gap-1.5">
                {skills.map(skill => (
                  <button key={skill.id} onClick={skill.onSelect} title={skill.title} className={chipCls}>
                    {skill.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Conversation switcher */}
      {conversations.length > 1 && (
        <div className="flex gap-1 px-3 py-2 border-b border-ink/10 dark:border-plate-ink/15 overflow-x-auto custom-scrollbar flex-shrink-0">
          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => onSelectConversation(conv.id)}
              className={`flex-shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-colors truncate max-w-[110px] ${
                activeConvId === conv.id
                  ? 'bg-edamame/10 text-edamame-700 dark:text-edamame-400'
                  : 'text-ink-faint dark:text-plate-ink-faint hover:text-ink-soft dark:hover:text-plate-ink-soft hover:bg-paper dark:hover:bg-plate'
              }`}
            >
              {conv.title || 'Chat'}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 custom-scrollbar min-w-0">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <p className="text-[12.5px] text-ink-faint dark:text-plate-ink-faint leading-relaxed">{emptyText}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeConv!.messages.map(msg => (
              <MessageView
                key={msg.id}
                message={msg}
                isFilingIssue={filingIssueMessageId === msg.id}
                onConfirmIssueDraft={() => onConfirmIssueDraft(msg.id)}
                onCancelIssueDraft={() => onCancelIssueDraft(msg.id)}
              />
            ))}
          </div>
        )}
        {isSending && (
          <div className="flex items-center gap-1 pl-1 mt-4" aria-label="Edie is replying">
            <span className="w-1.5 h-1.5 rounded-full bg-ink/20 dark:bg-plate-ink/20 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-ink/20 dark:bg-plate-ink/20 animate-bounce" style={{ animationDelay: '120ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-ink/20 dark:bg-plate-ink/20 animate-bounce" style={{ animationDelay: '240ms' }} />
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-3.5 py-3 border-t border-ink/10 dark:border-plate-ink/15 flex-shrink-0">
        <input
          ref={inputRef}
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
          }}
          placeholder={placeholder}
          aria-label="Message Edie"
          className="flex-1 min-w-0 bg-paper dark:bg-plate border border-ink/15 dark:border-plate-ink/20 rounded-lg px-3 py-2 text-[12.5px] text-ink dark:text-plate-ink-soft placeholder-ink-soft/50 dark:placeholder-plate-ink-soft/50 outline-none focus:border-edamame focus-ring transition-all"
        />
        <button
          onClick={onSend}
          disabled={!chatInput.trim() || isSending}
          aria-label="Send"
          className="btn-press flex-shrink-0 w-8 h-8 rounded-lg bg-edamame hover:bg-edamame-600 text-white flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
};

const MessageView: React.FC<{
  message: FocusChatMessage;
  isFilingIssue: boolean;
  onConfirmIssueDraft: () => void;
  onCancelIssueDraft: () => void;
}> = ({ message, isFilingIssue, onConfirmIssueDraft, onCancelIssueDraft }) => {
  const time = format(new Date(message.createdAt), 'HH:mm');
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-xl rounded-br-sm bg-edamame text-white px-3 py-2">
          <p className="text-[12.5px] whitespace-pre-wrap leading-relaxed break-words">{message.content}</p>
          <p className="text-[10px] mt-1 text-white/50 text-right">{time}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <RichMessage text={message.content} />
      {message.kind === 'issue-draft' && (
        <IssueDraftCard
          message={message}
          isSubmitting={isFilingIssue}
          onConfirm={onConfirmIssueDraft}
          onCancel={onCancelIssueDraft}
        />
      )}
      <div className="text-[10px] text-ink-faint dark:text-plate-ink-faint mt-3">{time}</div>
    </div>
  );
};

export default EdiePanel;
