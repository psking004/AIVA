/**
 * AIVA Data Storage
 * Ingested Documents & Knowledge Vault Horizon
 *
 * Connected directly to @aiva/api-client getDocuments, uploadDocument, deleteDocument.
 * Real data only. Truthful empty states.
 */

'use client';

import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aivaClient } from '@aiva/api-client';
import { Document } from '@aiva/types';
import {
  FolderLock,
  UploadCloud,
  FileText,
  FileCode,
  FileArchive,
  Trash2,
  Search,
} from 'lucide-react';

interface DataStorageProps {
  fullScreen?: boolean;
}

export function DataStorage({ fullScreen }: DataStorageProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Real backend query
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: () => aivaClient.getDocuments(),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => aivaClient.uploadDocument(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setIsUploading(false);
    },
    onError: () => {
      setIsUploading(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => aivaClient.deleteDocument(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIsUploading(true);
      uploadMutation.mutate(e.target.files[0]);
    }
  };

  const formatFileSize = (bytes?: bigint | number) => {
    if (!bytes) return '0 B';
    const numBytes = Number(bytes);
    if (numBytes < 1024) return `${numBytes} B`;
    if (numBytes < 1024 * 1024) return `${(numBytes / 1024).toFixed(1)} KB`;
    return `${(numBytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (_mimeType?: string, fileName?: string) => {
    if (fileName?.endsWith('.ts') || fileName?.endsWith('.js') || fileName?.endsWith('.json')) {
      return <FileCode size={18} className="text-cyan-glow" />;
    }
    if (fileName?.endsWith('.zip') || fileName?.endsWith('.tar')) {
      return <FileArchive size={18} className="text-violet-glow" />;
    }
    return <FileText size={18} className="text-amber-solar" />;
  };

  const filteredDocs = documents.filter((doc: Document) => {
    const q = searchQuery.toLowerCase();
    const titleMatch = doc.title?.toLowerCase().includes(q);
    const nameMatch = doc.fileName?.toLowerCase().includes(q);
    return titleMatch || nameMatch;
  });

  return (
    <div className={`aiva-panel rounded-2xl aiva-border flex flex-col ${fullScreen ? 'h-full' : ''}`}>
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
        aria-label="Upload document file"
      />

      {/* Header */}
      <div className="h-16 px-6 aiva-border-b flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg aiva-panel border border-cyan-glow/40 flex items-center justify-center">
            <FolderLock size={16} className="text-cyan-glow" />
          </div>
          <div>
            <h2 className="font-telemetry text-sm font-bold text-on-surface uppercase tracking-wider">
              Data Storage Horizon
            </h2>
            <p className="text-[10px] font-telemetry text-on-dim">
              {documents.length} ingested documents
            </p>
          </div>
        </div>

        {/* Search & Upload */}
        <div className="flex items-center gap-3">
          <div className="relative w-48 sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-dim" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search storage..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl aiva-panel aiva-border text-xs text-on-surface placeholder:text-on-dim focus:outline-none focus:border-cyan-glow/50 font-body"
            />
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="px-3.5 py-1.5 rounded-xl bg-cyan-glow text-obsidian-950 font-telemetry text-xs font-bold tracking-wider hover:bg-cyan-glow/90 shadow-aiva-cyan flex items-center gap-1.5 transition-all disabled:opacity-50"
          >
            <UploadCloud size={14} />
            <span>{isUploading ? 'Ingesting...' : 'Ingest Document'}</span>
          </button>
        </div>
      </div>

      {/* Documents Grid */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto max-h-[650px] scrollbar-hide">
        {filteredDocs.map((doc: Document) => (
          <div
            key={doc.id}
            className="p-5 rounded-2xl aiva-panel-elevated aiva-border hover:aiva-border-cyan transition-all flex flex-col justify-between group"
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl aiva-panel aiva-border flex items-center justify-center shrink-0">
                {getFileIcon(doc.mimeType, doc.fileName)}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-telemetry text-sm font-bold text-on-surface truncate group-hover:text-cyan-glow transition-colors">
                  {doc.title || doc.fileName}
                </h3>
                <p className="text-[11px] font-body text-on-dim truncate mt-0.5">
                  {doc.fileName}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-telemetry text-on-dim">
              <div className="flex items-center gap-2">
                <span>{formatFileSize(doc.fileSize)}</span>
                <span>•</span>
                <span className={doc.isProcessed ? 'text-emerald-pulse' : 'text-amber-solar'}>
                  {doc.isProcessed ? 'Indexed' : 'Processing'}
                </span>
              </div>

              <button
                onClick={() => deleteMutation.mutate(doc.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-on-dim hover:text-red-400 transition-all rounded"
                title="Purge Document"
                aria-label="Purge Document"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}

        {filteredDocs.length === 0 && !isLoading && (
          <div className="col-span-3 py-16 text-center text-on-dim text-xs font-body">
            No documents stored. Ingest a document to establish semantic vector indexing.
          </div>
        )}
      </div>
    </div>
  );
}
