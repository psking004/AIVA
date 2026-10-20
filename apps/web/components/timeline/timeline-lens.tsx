/**
 * AIVA Temporal Coordinates
 * Calendar & Chronological Horizon Lens
 *
 * Connected directly to @aiva/api-client getEvents, createEvent, updateEvent, deleteEvent.
 * Real data only. Truthful empty states.
 */

'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aivaClient } from '@aiva/api-client';
import {
  CalendarDays,
  Plus,
  Clock,
  MapPin,
  Video,
  Trash2,
  X,
} from 'lucide-react';

interface TimelineLensProps {
  fullScreen?: boolean;
}

export function TimelineLens({ fullScreen }: TimelineLensProps) {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newStartTime, setNewStartTime] = useState('');
  const [newEndTime, setNewEndTime] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newMeetingLink, setNewMeetingLink] = useState('');

  // Real backend query
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['calendar-events'],
    queryFn: () => aivaClient.getEvents(),
  });

  const createEventMutation = useMutation({
    mutationFn: () =>
      aivaClient.createEvent({
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        startTime: new Date(newStartTime),
        endTime: newEndTime ? new Date(newEndTime) : new Date(new Date(newStartTime).getTime() + 3600000),
        location: newLocation.trim() || undefined,
        meetingLink: newMeetingLink.trim() || undefined,
        status: 'CONFIRMED',
        visibility: 'PRIVATE',
        isAllDay: false,
        attendees: [],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      setIsCreateOpen(false);
      setNewTitle('');
      setNewDescription('');
      setNewStartTime('');
      setNewEndTime('');
      setNewLocation('');
      setNewMeetingLink('');
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: (id: string) => aivaClient.deleteEvent(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calendar-events'] }),
  });

  // Sort chronologically
  const sortedEvents = [...events].sort((a: any, b: any) => {
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });

  const formatRelativeTime = (dateInput: Date | string) => {
    const d = new Date(dateInput);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));

    if (diffHours < 0 && diffHours > -24) {
      return `${Math.abs(diffHours)}h ago`;
    }
    if (diffHours >= 0 && diffHours < 24) {
      return `In ${diffHours}h`;
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`aiva-panel rounded-2xl aiva-border flex flex-col ${fullScreen ? 'h-full' : ''}`}>
      {/* Header */}
      <div className="h-16 px-6 aiva-border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg aiva-panel border border-amber-solar/40 flex items-center justify-center">
            <CalendarDays size={16} className="text-amber-solar" />
          </div>
          <div>
            <h2 className="font-telemetry text-sm font-bold text-on-surface uppercase tracking-wider">
              Temporal Coordinates
            </h2>
            <p className="text-[10px] font-telemetry text-on-dim">
              {events.length} synchronized events
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="px-3.5 py-1.5 rounded-xl bg-amber-solar text-obsidian-950 font-telemetry text-xs font-bold tracking-wider hover:bg-amber-solar/90 shadow-aiva-subtle flex items-center gap-1.5 transition-all"
        >
          <Plus size={14} />
          <span>Schedule Horizon</span>
        </button>
      </div>

      {/* Chronological Event Stream */}
      <div className="p-6 space-y-4 overflow-y-auto max-h-[650px] scrollbar-hide">
        {sortedEvents.map((event: any) => (
          <div
            key={event.id}
            className="p-5 rounded-2xl aiva-panel-elevated aiva-border hover:border-amber-solar/40 transition-all flex items-start justify-between gap-4 group"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl aiva-panel border border-amber-solar/20 flex flex-col items-center justify-center shrink-0">
                <span className="text-[9px] font-telemetry uppercase text-amber-solar font-bold">
                  {new Date(event.startTime).toLocaleDateString(undefined, { month: 'short' })}
                </span>
                <span className="font-telemetry text-sm font-bold text-on-surface">
                  {new Date(event.startTime).getDate()}
                </span>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-telemetry text-sm font-bold text-on-surface">
                    {event.title}
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[9px] font-telemetry uppercase font-bold text-amber-solar bg-amber-solar/10 aiva-border border-amber-solar/20">
                    {formatRelativeTime(event.startTime)}
                  </span>
                </div>

                {event.description && (
                  <p className="font-body text-xs text-on-muted mt-1 max-w-lg">
                    {event.description}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-4 mt-2.5 text-[11px] font-telemetry text-on-dim">
                  <span className="flex items-center gap-1 text-on-muted">
                    <Clock size={11} />
                    {new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {event.endTime && ` - ${new Date(event.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                  </span>

                  {event.location && (
                    <span className="flex items-center gap-1">
                      <MapPin size={11} />
                      {event.location}
                    </span>
                  )}

                  {event.meetingLink && (
                    <a
                      href={event.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-glow hover:underline flex items-center gap-1"
                    >
                      <Video size={11} />
                      Join Transmission
                    </a>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => deleteEventMutation.mutate(event.id)}
              className="opacity-0 group-hover:opacity-100 p-1.5 text-on-dim hover:text-red-400 transition-all rounded hover:bg-white/5"
              title="Delete Event"
              aria-label="Delete Event"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}

        {sortedEvents.length === 0 && !isLoading && (
          <div className="py-16 text-center text-on-dim text-xs font-body">
            No temporal coordinates scheduled. Schedule a horizon event to synchronize AIVA's timeline awareness.
          </div>
        )}
      </div>

      {/* Creation Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md aiva-panel-elevated aiva-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 aiva-border-b">
              <h3 className="font-telemetry text-sm font-bold tracking-wider text-on-surface uppercase">
                Schedule Horizon Event
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
                  Event Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Quarterly Strategic Alignment"
                  className="w-full px-3 py-2 rounded-xl aiva-panel aiva-border text-sm text-on-surface focus:outline-none focus:border-amber-solar/50"
                />
              </div>

              <div>
                <label className="block text-[10px] font-telemetry uppercase tracking-wider text-on-dim mb-1">
                  Description
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Agenda items and briefing context..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl aiva-panel aiva-border text-sm text-on-surface focus:outline-none focus:border-amber-solar/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-telemetry uppercase tracking-wider text-on-dim mb-1">
                    Start Coordinate
                  </label>
                  <input
                    type="datetime-local"
                    value={newStartTime}
                    onChange={(e) => setNewStartTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl aiva-panel aiva-border text-xs text-on-surface focus:outline-none focus:border-amber-solar/50"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-telemetry uppercase tracking-wider text-on-dim mb-1">
                    End Coordinate
                  </label>
                  <input
                    type="datetime-local"
                    value={newEndTime}
                    onChange={(e) => setNewEndTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl aiva-panel aiva-border text-xs text-on-surface focus:outline-none focus:border-amber-solar/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-telemetry uppercase tracking-wider text-on-dim mb-1">
                  Meeting Link or Physical Location
                </label>
                <input
                  type="text"
                  value={newMeetingLink}
                  onChange={(e) => setNewMeetingLink(e.target.value)}
                  placeholder="https://meet.google.com/... or HQ Operations Room"
                  className="w-full px-3 py-2 rounded-xl aiva-panel aiva-border text-xs text-on-surface focus:outline-none focus:border-amber-solar/50"
                />
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
                disabled={!newTitle.trim() || !newStartTime || createEventMutation.isPending}
                onClick={() => createEventMutation.mutate()}
                className="px-5 py-2 rounded-xl bg-amber-solar text-obsidian-950 text-xs font-telemetry font-bold hover:bg-amber-solar/90 disabled:opacity-50 transition-all"
              >
                Schedule Horizon
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
