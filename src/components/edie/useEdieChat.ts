import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../contexts/AuthContext';
import type { FocusChatMessage, FocusConversation } from '../../types';

interface UseEdieChatOptions {
  /** Conversations are reloaded whenever this changes (e.g. the case id). */
  scopeKey: string;
  /** Stored on each new conversation (`FocusConversation.caseId`). */
  caseId: string;
  load: () => Promise<FocusConversation[]>;
  save: (conversations: FocusConversation[]) => void;
  /** Case facts sent with every message; undefined outside a case. */
  getCaseContext: () => string | undefined;
}

export interface EdieChat {
  conversations: FocusConversation[];
  activeConv?: FocusConversation;
  activeConvId: string | null;
  setActiveConvId: (id: string) => void;
  chatInput: string;
  setChatInput: (value: string) => void;
  isSending: boolean;
  createConversation: () => void;
  sendMessage: () => Promise<void>;
  filingIssueMessageId: string | null;
  confirmIssueDraft: (messageId: string) => Promise<void>;
  cancelIssueDraft: (messageId: string) => void;
  chatEndRef: React.RefObject<HTMLDivElement>;
}

/**
 * Edie's chat: conversations, sending to `/api/focus-chat`, and the agentic
 * GitHub issue flow (GitHub issue #15). Shared by the case chat (Case
 * Details, stored per case in `repos.chat`) and the general chat on every
 * other page.
 *
 * A drafted issue is never filed automatically: only `confirmIssueDraft`
 * calls `/api/file-github-issue`, the one endpoint that posts the issue.
 */
export function useEdieChat({ scopeKey, caseId, load, save, getCaseContext }: UseEdieChatOptions): EdieChat {
  const { session } = useAuth();
  const [conversations, setConversations] = useState<FocusConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [filingIssueMessageId, setFilingIssueMessageId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Callers pass fresh closures every render; read them through refs so the
  // handlers below don't go stale and don't need them as dependencies.
  const loadRef = useRef(load);
  const saveRef = useRef(save);
  const contextRef = useRef(getCaseContext);
  loadRef.current = load;
  saveRef.current = save;
  contextRef.current = getCaseContext;

  const activeConv = conversations.find(c => c.id === activeConvId);

  useEffect(() => {
    let cancelled = false;
    loadRef.current().then(convs => {
      if (cancelled) return;
      setConversations(convs);
      setActiveConvId(convs[0]?.id ?? null);
    }).catch(() => {
      if (!cancelled) { setConversations([]); setActiveConvId(null); }
    });
    return () => { cancelled = true; };
  }, [scopeKey]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv?.messages]);

  /** Applies `update` to the conversation list and persists the result. */
  const updateConvs = useCallback((update: (prev: FocusConversation[]) => FocusConversation[]) => {
    setConversations(prev => {
      const next = update(prev);
      saveRef.current(next);
      return next;
    });
  }, []);

  const appendMessage = useCallback((convId: string, message: FocusChatMessage) => {
    updateConvs(prev => prev.map(c => (c.id === convId ? { ...c, messages: [...c.messages, message] } : c)));
  }, [updateConvs]);

  const createConversation = useCallback(() => {
    const conv: FocusConversation = {
      id: uuidv4(),
      caseId,
      title: `Chat ${conversations.length + 1}`,
      messages: [],
      createdAt: new Date().toISOString(),
    };
    updateConvs(prev => [conv, ...prev]);
    setActiveConvId(conv.id);
  }, [caseId, conversations.length, updateConvs]);

  const authHeaders = useCallback((): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  }), [session]);

  const sendMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || isSending) return;

    let convId = activeConvId;
    let history = conversations.find(c => c.id === convId)?.messages ?? [];
    if (!convId) {
      convId = uuidv4();
      const conv: FocusConversation = { id: convId, caseId, title: text.slice(0, 40), messages: [], createdAt: new Date().toISOString() };
      updateConvs(prev => [conv, ...prev]);
      setActiveConvId(convId);
      history = [];
    }

    const userMsg: FocusChatMessage = { id: uuidv4(), role: 'user', content: text, createdAt: new Date().toISOString() };
    const targetId = convId;
    updateConvs(prev => prev.map(c => {
      if (c.id !== targetId) return c;
      return { ...c, title: c.messages.length === 0 ? text.slice(0, 40) : c.title, messages: [...c.messages, userMsg] };
    }));
    setChatInput('');
    setIsSending(true);

    try {
      const historyMessages = [...history, userMsg];
      // Per-conversation cap on agent-filed issues (see api/focus-chat.ts).
      const issuesFiledInSession = historyMessages.filter(m => m.kind === 'issue-filed').length;
      const response = await fetch('/api/focus-chat', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          messages: historyMessages.map(m => ({ role: m.role, content: m.content })),
          caseContext: contextRef.current(),
          issuesFiledInSession,
        }),
      });
      const data = await response.json();
      const assistantMsg: FocusChatMessage =
        data.kind === 'issue-draft' && data.draft
          ? {
              id: uuidv4(),
              role: 'assistant',
              content: "I think this is worth tracking — here's a drafted GitHub issue for your review.",
              createdAt: new Date().toISOString(),
              kind: 'issue-draft',
              issueDraft: { title: data.draft.title, body: data.draft.body },
            }
          : {
              id: uuidv4(),
              role: 'assistant',
              content: data.reply || 'Sorry, I could not generate a response.',
              createdAt: new Date().toISOString(),
              kind: 'text',
            };
      appendMessage(targetId, assistantMsg);
    } catch {
      appendMessage(targetId, {
        id: uuidv4(),
        role: 'assistant',
        content: 'Connection error. Please check your API key and try again.',
        createdAt: new Date().toISOString(),
      });
    } finally {
      setIsSending(false);
    }
  }, [chatInput, isSending, activeConvId, conversations, caseId, updateConvs, appendMessage, authHeaders]);

  const patchMessage = useCallback((convId: string, messageId: string, patch: Partial<FocusChatMessage>) => {
    updateConvs(prev => prev.map(c => (
      c.id !== convId ? c : { ...c, messages: c.messages.map(m => (m.id === messageId ? { ...m, ...patch } : m)) }
    )));
  }, [updateConvs]);

  const cancelIssueDraft = useCallback((messageId: string) => {
    if (activeConvId) patchMessage(activeConvId, messageId, { issueDraftResolved: 'cancelled' });
  }, [activeConvId, patchMessage]);

  const confirmIssueDraft = useCallback(async (messageId: string) => {
    const convId = activeConvId;
    const conv = conversations.find(c => c.id === convId);
    const message = conv?.messages.find(m => m.id === messageId);
    if (!convId || !message?.issueDraft || filingIssueMessageId) return;

    const issuesFiledInSession = conv!.messages.filter(m => m.kind === 'issue-filed').length;
    setFilingIssueMessageId(messageId);
    try {
      const response = await fetch('/api/file-github-issue', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ title: message.issueDraft.title, body: message.issueDraft.body, issuesFiledInSession }),
      });
      const data = await response.json();
      if (!response.ok) {
        patchMessage(convId, messageId, { issueDraftResolved: 'cancelled' });
        appendMessage(convId, {
          id: uuidv4(),
          role: 'assistant',
          content: data.error || 'Failed to file the GitHub issue. Please try again or file it manually.',
          createdAt: new Date().toISOString(),
          kind: 'text',
        });
        return;
      }
      patchMessage(convId, messageId, { issueDraftResolved: 'filed' });
      appendMessage(convId, {
        id: uuidv4(),
        role: 'assistant',
        content: `Done — filed [#${data.number}](${data.url}).`,
        createdAt: new Date().toISOString(),
        kind: 'issue-filed',
        issueUrl: data.url,
        issueNumber: data.number,
      });
    } catch {
      patchMessage(convId, messageId, { issueDraftResolved: 'cancelled' });
    } finally {
      setFilingIssueMessageId(null);
    }
  }, [activeConvId, conversations, filingIssueMessageId, authHeaders, patchMessage, appendMessage]);

  return {
    conversations,
    activeConv,
    activeConvId,
    setActiveConvId,
    chatInput,
    setChatInput,
    isSending,
    createConversation,
    sendMessage,
    filingIssueMessageId,
    confirmIssueDraft,
    cancelIssueDraft,
    chatEndRef,
  };
}
