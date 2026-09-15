import React, { useState, useEffect, useCallback } from 'react';
import { CaseNote } from '../types';
import { useRepositories } from '../contexts/RepositoryContext';
import { format } from 'date-fns';
import { MessageSquare, Trash2, Plus } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface CaseNotesProps {
  caseId: string;
}

export const CaseNotes: React.FC<CaseNotesProps> = ({ caseId }) => {
  const repos = useRepositories();
  const [notes, setNotes] = useState<CaseNote[]>([]);
  const [newContent, setNewContent] = useState('');
  const [loading, setLoading] = useState(true);

  const loadNotes = useCallback(async () => {
    const fetched = await repos.caseNotes.getByCaseId(caseId);
    // Sort newest first
    setNotes(fetched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    setLoading(false);
  }, [repos.caseNotes, caseId]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const handleAddNote = async () => {
    const trimmed = newContent.trim();
    if (!trimmed) return;

    const note: CaseNote = {
      id: uuidv4(),
      caseId,
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    await repos.caseNotes.create(note);
    setNewContent('');
    await loadNotes();
  };

  const handleDeleteNote = async (id: string) => {
    await repos.caseNotes.delete(id);
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleAddNote();
    }
  };

  return (
    <div className="bg-paper-2 dark:bg-plate-card rounded-2xl shadow-sm border border-ink/15 dark:border-plate-ink/20 p-6">
      <h2 className="text-sm font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-wider mb-4 flex items-center gap-2">
        <MessageSquare size={16} />
        Case Notes
        <span className="ml-1 px-2 py-0.5 bg-paper-2 dark:bg-plate-card text-ink-soft dark:text-plate-ink-soft text-xs rounded-full">
          {notes.length}
        </span>
      </h2>

      {/* Add note form */}
      <div className="mb-6">
        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-4 py-3 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-xl focus:ring-2 focus:ring-edamame outline-none text-ink dark:text-plate-ink resize-none text-sm"
          rows={3}
          placeholder="Add a note... (Ctrl+Enter to submit)"
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={handleAddNote}
            disabled={!newContent.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-edamame hover:bg-edamame-600 text-white font-bold rounded-xl shadow-lg shadow-edamame/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed text-sm"
          >
            <Plus size={16} />
            Add Note
          </button>
        </div>
      </div>

      {/* Notes list */}
      {loading ? (
        <div className="text-center text-ink-faint dark:text-plate-ink-faint py-6 text-sm italic">
          Loading notes...
        </div>
      ) : notes.length === 0 ? (
        <div className="text-center text-ink-faint dark:text-plate-ink-faint py-6 text-sm italic border border-dashed border-ink/15 dark:border-plate-ink/20 rounded-xl">
          No notes yet. Add one above.
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="group relative bg-paper-2 dark:bg-plate-card/50 rounded-xl p-4 border border-ink/10 dark:border-plate-ink/15 hover:border-ink/20 dark:hover:border-plate-ink/25 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink-soft dark:text-plate-ink-soft whitespace-pre-wrap break-words">
                    {note.content}
                  </p>
                  <p className="text-xs text-ink-faint dark:text-plate-ink-faint mt-2">
                    {format(new Date(note.createdAt), 'MMM d, yyyy \'at\' h:mm a')}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteNote(note.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-ink-faint dark:text-plate-ink-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all shrink-0"
                  title="Delete note"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
