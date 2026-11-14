import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEdie } from '../../contexts/EdieContext';
import { EdiePanel, type EdieSkill } from './EdiePanel';
import { useEdieChat } from './useEdieChat';

const GENERAL_SCOPE = 'general';

/**
 * Edie on pages without a case: "how do I…" help about Edamame (answered
 * from the user manual) and general immigration questions. These chats have
 * no case to belong to, so they're kept for the browser session only.
 */
export const EdieGeneral: React.FC = () => {
  const { setOpen, generalConversations, setGeneralConversations } = useEdie();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const chat = useEdieChat({
    scopeKey: GENERAL_SCOPE,
    caseId: GENERAL_SCOPE,
    load: async () => generalConversations,
    save: setGeneralConversations,
    getCaseContext: () => undefined,
  });

  /** Starts a message for the user to finish (Report a problem). */
  const prefill = (text: string) => {
    chat.setChatInput(text);
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const askTitle = 'Asks Edie in the chat';
  const skills: EdieSkill[] = [
    { id: 'how-new-case', label: 'How do I start a case?', title: askTitle, onSelect: () => void chat.sendText('How do I start a new case?') },
    { id: 'how-work-plans', label: 'How do Work Plans work?', title: askTitle, onSelect: () => void chat.sendText('How do Work Plans and phases work?') },
    { id: 'check-eligibility', label: 'Check eligibility', title: 'Opens the Visa Advisor', onSelect: () => navigate('/visa-advisor') },
    { id: 'report-problem', label: 'Report a problem', title: 'Starts a message for you to finish and send', onSelect: () => prefill('I think something in Edamame is not working as it should: ') },
  ];

  return (
    <EdiePanel
      onClose={() => setOpen(false)}
      subtitle="AI assistant"
      helpHeading="Ask Edie"
      skills={skills}
      emptyText="Ask how to do something in Edamame, or a general immigration question. Open a case to ask about that case."
      placeholder="Ask Edie…"
      conversations={chat.conversations}
      activeConv={chat.activeConv}
      activeConvId={chat.activeConvId}
      onSelectConversation={chat.setActiveConvId}
      onNewChat={chat.createConversation}
      chatInput={chat.chatInput}
      setChatInput={chat.setChatInput}
      isSending={chat.isSending}
      onSend={chat.sendMessage}
      chatEndRef={chat.chatEndRef}
      inputRef={inputRef}
      filingIssueMessageId={chat.filingIssueMessageId}
      onConfirmIssueDraft={chat.confirmIssueDraft}
      onCancelIssueDraft={chat.cancelIssueDraft}
    />
  );
};

export default EdieGeneral;
