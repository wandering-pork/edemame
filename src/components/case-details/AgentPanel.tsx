import React from 'react';
import { Sparkles, Plus, Send, Github, Check, X } from 'lucide-react';
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
            <div key={i} className="text-[13px] font-extrabold text-gray-900 dark:text-white leading-relaxed">
              {renderInline(b.text)}
            </div>
          );
        }
        if (b.kind === 'b') {
          return (
            <div key={i} className="text-xs font-bold text-gray-900 dark:text-white leading-relaxed mt-3.5">
              {renderInline(b.text)}
            </div>
          );
        }
        if (b.kind === 'li') {
          return (
            <div key={i} className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed mt-1.5 pl-3 break-words">
              <span className="text-edamame mr-1.5">·</span>
              {renderInline(b.text)}
            </div>
          );
        }
        return (
          <div key={i} className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed mt-2 break-words">
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
      <div className="text-xs text-gray-400 dark:text-slate-500 italic mt-2">
        Draft discarded — no issue was filed.
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-200 dark:border-slate-700">
        <Github size={13} className="text-gray-500 dark:text-slate-400" />
        <span className="text-[11px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
          Drafted GitHub issue
        </span>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-xs font-bold text-gray-900 dark:text-white break-words">{draft.title}</p>
        <p className="text-xs text-gray-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed mt-1.5 break-words">
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
          <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-200 dark:border-slate-700">
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
              className="btn-press flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
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

interface AgentPanelProps {
  conversations: FocusConversation[];
  activeConv?: FocusConversation;
  activeConvId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  chatInput: string;
  setChatInput: (v: string) => void;
  isSending: boolean;
  onSend: () => void;
  onSuggested: (msg: string) => void;
  suggestedChips: string[];
  chatEndRef: React.RefObject<HTMLDivElement>;
  /** Message id of a drafted issue currently being filed (Confirm clicked, awaiting response). */
  filingIssueMessageId?: string | null;
  onConfirmIssueDraft: (messageId: string) => void;
  onCancelIssueDraft: (messageId: string) => void;
}

export const AgentPanel: React.FC<AgentPanelProps> = ({
  conversations,
  activeConv,
  activeConvId,
  onSelectConversation,
  onNewChat,
  chatInput,
  setChatInput,
  isSending,
  onSend,
  onSuggested,
  suggestedChips,
  chatEndRef,
  filingIssueMessageId,
  onConfirmIssueDraft,
  onCancelIssueDraft,
}) => {
  const isEmpty = !activeConv || activeConv.messages.length === 0;

  return (
    <aside className="ed-agent xl:sticky xl:top-4 self-start flex flex-col bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden xl:max-h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3.5 border-b border-gray-100 dark:border-slate-800 flex-shrink-0">
        <Sparkles size={15} className="text-edamame" strokeWidth={1.8} />
        <span className="text-[13px] font-bold text-gray-900 dark:text-white">Agent</span>
        <span className="text-[11px] text-gray-400 dark:text-slate-500">
          {conversations.length} chat{conversations.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={onNewChat}
          className="ml-auto flex items-center gap-1 text-[11.5px] font-semibold text-edamame hover:text-edamame-600 transition-colors"
        >
          <Plus size={12} strokeWidth={2.2} />
          New
        </button>
      </div>

      {/* Conversation switcher */}
      {conversations.length > 1 && (
        <div className="flex gap-1 px-3 py-2 border-b border-gray-100 dark:border-slate-800 overflow-x-auto custom-scrollbar flex-shrink-0">
          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => onSelectConversation(conv.id)}
              className={`flex-shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-colors truncate max-w-[90px] ${
                activeConvId === conv.id
                  ? 'bg-edamame/10 text-edamame-700 dark:text-edamame-400'
                  : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800'
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
          <div className="flex flex-col items-center justify-center h-full text-center px-2 pb-8">
            <div className="w-10 h-10 rounded-2xl bg-edamame/10 dark:bg-edamame/15 flex items-center justify-center mb-3">
              <Sparkles size={18} className="text-edamame dark:text-edamame-400" />
            </div>
            <p className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">Edamame Agent</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 leading-relaxed">
              Ask anything about this case — I already know the context, client details, and outstanding tasks.
            </p>
            <div className="flex flex-wrap justify-center gap-1.5 mt-4">
              {suggestedChips.map(chip => (
                <button
                  key={chip}
                  onClick={() => onSuggested(chip)}
                  className="btn-press text-[11px] font-semibold px-2.5 py-1.5 rounded-full border border-edamame/35 text-edamame-700 dark:text-edamame-400 bg-edamame/[0.07] hover:bg-edamame/15 transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
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
            {/* Suggested actions after the latest assistant turn */}
            {activeConv!.messages[activeConv!.messages.length - 1]?.role === 'assistant' && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {suggestedChips.map(chip => (
                  <button
                    key={chip}
                    onClick={() => onSuggested(chip)}
                    className="btn-press text-[11px] font-semibold px-2.5 py-1.5 rounded-full border border-edamame/35 text-edamame-700 dark:text-edamame-400 bg-edamame/[0.07] hover:bg-edamame/15 transition-colors"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}
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

      {/* Input */}
      <div className="flex items-center gap-2 px-3.5 py-3 border-t border-gray-100 dark:border-slate-800 flex-shrink-0">
        <input
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
          }}
          placeholder="Ask about this case…"
          className="flex-1 min-w-0 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-[12.5px] text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-slate-500 outline-none focus:border-edamame focus-ring transition-all"
        />
        <button
          onClick={onSend}
          disabled={!chatInput.trim() || isSending}
          className="btn-press flex-shrink-0 w-8 h-8 rounded-lg bg-edamame hover:bg-edamame-600 text-white flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Send size={14} />
        </button>
      </div>
    </aside>
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
      <div className="text-[10px] text-gray-400 dark:text-slate-500 mt-3">{time}</div>
    </div>
  );
};

export default AgentPanel;
