/**
 * AIVA Memory Archive
 * Semantic Knowledge & Episodic Memory Horizon
 *
 * Connected directly to @aiva/api-client getNotes, createNote, updateNote, deleteNote.
 * Real data only. Truthful empty states.
 */

'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aivaClient } from '@aiva/api-client';
import { Note } from '@aiva/types';
import {
  Brain,
  Plus,
  Search,
  Pin,
  Trash2,
  Tag,
  Clock,
  X,
} from 'lucide-react';

interface MemoryArchiveProps {
  fullScreen?: boolean;
}

export function MemoryArchive({ fullScreen }: MemoryArchiveProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Form state
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [isPinned, setIsPinned] = useState(false);

  // Real backend query
  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['notes'],
    queryFn: () => aivaClient.getNotes(),
  });

  const createNoteMutation = useMutation({
    mutationFn: () =>
      aivaClient.createNote({
        title: newTitle.trim(),
        content: newContent.trim(),
        tags: newTagInput
          ? newTagInput.split(',').map((t) => t.trim()).filter(Boolean)
          : [],
        isPinned,
        isArchived: false,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      setIsCreateOpen(false);
      setNewTitle('');
      setNewContent('');
      setNewTagInput('');
      setIsPinned(false);
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (id: string) => aivaClient.deleteNote(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes'] }),
  });

  const togglePinMutation = useMutation({
    mutationFn: (args: { id: string; isPinned: boolean }) =>
      aivaClient.updateNote(args.id, { isPinned: !args.isPinned }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes'] }),
  });

  // Filtered notes
  const filteredNotes = notes.filter((note: Note) => {
    const q = searchQuery.toLowerCase();
    const titleMatch = note.title?.toLowerCase().includes(q);
    const contentMatch = note.content?.toLowerCase().includes(q);
    const tagMatch = note.tags?.some((t) => t.toLowerCase().includes(q));
    return titleMatch || contentMatch || tagMatch;
  });

  return (
    <div className={`aiva-panel rounded-2xl aiva-border flex flex-col ${fullScreen ? 'h-full' : ''}`}>
      {/* Header */}
      <div className="h-16 px-6 aiva-border-b flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg aiva-panel border border-emerald-pulse/40 flex items-center justify-center">
            <Brain size={16} className="text-emerald-pulse" />
          </div>
          <div>
            <h2 className="font-telemetry text-sm font-bold text-on-surface uppercase tracking-wider">
              Memory Archive
            </h2>
            <p className="text-[10px] font-telemetry text-on-dim">
              {notes.length} persistent knowledge records
            </p>
          </div>
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-3">
          <div className="relative w-48 sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-dim" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search memory..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl aiva-panel aiva-border text-xs text-on-surface placeholder:text-on-dim focus:outline-none focus:border-emerald-pulse/50 font-body"
            />
          </div>

          <button
            onClick={() => setIsCreateOpen(true)}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-pulse text-obsidian-950 font-telemetry text-xs font-bold tracking-wider hover:bg-emerald-pulse/90 shadow-aiva-emerald flex items-center gap-1.5 transition-all"
          >
            <Plus size={14} />
            <span>Archive Memory</span>
          </button>
        </div>
      </div>

      {/* Memory Cards Grid */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto max-h-[650px] scrollbar-hide">
        {filteredNotes.map((note: Note) => (
          <div
            key={note.id}
            className={`p-5 rounded-2xl aiva-panel-elevated aiva-border hover:border-emerald-pulse/40 transition-all flex flex-col justify-between group ${
              note.isPinned ? 'border-l-2 border-l-emerald-pulse' : ''
            }`}
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  {note.isPinned && (
                    <Pin size={12} className="text-emerald-pulse shrink-0 fill-emerald-pulse" />
                  )}
                  <h3 className="font-telemetry text-sm font-bold text-on-surface truncate">
                    {note.title}
                  </h3>
                </div>

                <button
                  onClick={() =>
                    togglePinMutation.mutate({
                      id: note.id,
                      isPinned: note.isPinned,
                    })
                  }
                  className={`p-1 rounded text-on-dim hover:text-emerald-pulse transition-colors ${
                    note.isPinned ? 'text-emerald-pulse' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  title={note.isPinned ? 'Unpin' : 'Pin to memory apex'}
                >
                  <Pin size={12} />
                </button>
              </div>

              <p className="font-body text-xs text-on-muted leading-relaxed line-clamp-4 whitespace-pre-wrap mb-4">
                {note.content}
              </p>
            </div>

            <div>
              {/* Tags */}
              {note.tags && note.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {note.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-telemetry aiva-border text-on-dim bg-white/5"
                    >
                      <Tag size={9} />
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Bottom Metadata & Delete */}
              <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[10px] font-telemetry text-on-dim">
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  {note.createdAt ? new Date(note.createdAt).toLocaleDateString() : 'Indexed'}
                </span>

                <button
                  onClick={() => deleteNoteMutation.mutate(note.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-on-dim hover:text-red-400 transition-all rounded"
                  title="Purge Memory"
                  aria-label="Purge Memory"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          </div>
        ))}

        {filteredNotes.length === 0 && !isLoading && (
          <div className="col-span-3 py-16 text-center text-on-dim text-xs font-body">
            No memory records found. Archive a note or document summary to persist knowledge into AIVA.
          </div>
        )}
      </div>

      {/* Creation Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md aiva-panel-elevated aiva-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 aiva-border-b">
              <h3 className="font-telemetry text-sm font-bold tracking-wider text-on-surface uppercase">
                Archive Memory Record
              </h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-on-dim hover:text-on-surface p-1 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-telemetry uppercase tracking-wider text-on-dim mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Distributed Consensus Specifications"
                  className="w-full px-3 py-2 rounded-xl aiva-panel aiva-border text-sm text-on-surface focus:outline-none focus:border-emerald-pulse/50"
                />
              </div>

              <div>
                <label className="block text-[10px] font-telemetry uppercase tracking-wider text-on-dim mb-1">
                  Memory Content
                </label>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Record insights, architectural notes, or directives..."
                  rows={4}
                  className="w-full px-3 py-2 rounded-xl aiva-panel aiva-border text-sm text-on-surface focus:outline-none focus:border-emerald-pulse/50"
                />
              </div>

              <div>
                <label className="block text-[10px] font-telemetry uppercase tracking-wider text-on-dim mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  placeholder="architecture, spec, security"
                  className="w-full px-3 py-2 rounded-xl aiva-panel aiva-border text-xs text-on-surface focus:outline-none focus:border-emerald-pulse/50"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="pin-memory"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                  className="rounded border-white/20 bg-white/5 text-emerald-pulse focus:ring-0"
                />
                <label htmlFor="pin-memory" className="text-xs font-telemetry text-on-muted cursor-pointer">
                  Pin to memory apex (Priority recall)
                </label>
              </div>
            </div>

            <div className="pt-3 aiva-border-t flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-telemetry text-on-dim hover:text-on-surface aiva-border"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newTitle.trim() || !newContent.trim() || createNoteMutation.isPending}
                onClick={() => createNoteMutation.mutate()}
                className="px-5 py-2 rounded-xl bg-emerald-pulse text-obsidian-950 text-xs font-telemetry font-bold hover:bg-emerald-pulse/90 disabled:opacity-50 transition-all"
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
