'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/components/ProfileProvider';
import {
  buildStudentNotifications,
  formatNotificationTime,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToTeacherPosts,
  useReadNotificationIds,
  type StudentClassPostSource,
  type StudentNotificationItem,
} from '@/lib/student-notifications';

// Cohesive bell icon matching the 2px stroke weight of StudyTools.tsx icons.
function BellIcon({ ringing }: { ringing: boolean }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={ringing ? 'transition-transform duration-200' : undefined}
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

// Real-time notification bell button in the student navigation bar (#110).
// Alerts students when a teacher posts a new flashcard deck, quiz, or study
// activity, with an unread badge counter and a warm-cream paper dropdown list.
export default function NotificationBell() {
  const { user } = useUser();
  const { profile } = useProfile();
  const userId = user?.id ?? null;
  const isStudent = !!userId && profile?.role === 'student';

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<StudentNotificationItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const headingId = useId();

  const readIds = useReadNotificationIds(isStudent ? userId : null);

  const loadNotifications = useCallback(async () => {
    if (!isStudent) return;
    try {
      const res = await apiFetch('/api/student/classes');
      if (!res.ok || !Array.isArray(res.data?.classes)) return;
      const classes = (res.data.classes as StudentClassPostSource[]).map((c) => ({ ...c }));
      if (classes.length > 0 && typeof supabase?.from === 'function') {
        try {
          const { data: fileRows } = await supabase
            .from('class_files')
            .select('id, class_id, name, created_at')
            .in(
              'class_id',
              classes.map((c) => c.id)
            );
          if (Array.isArray(fileRows)) {
            const byClass = new Map<string, { id: string; name: string; createdAt: string }[]>();
            for (const row of fileRows as { id: string; class_id: string; name: string; created_at: string }[]) {
              const list = byClass.get(row.class_id) ?? [];
              list.push({ id: row.id, name: row.name, createdAt: row.created_at });
              byClass.set(row.class_id, list);
            }
            for (const cls of classes) {
              cls.files = byClass.get(cls.id) ?? cls.files;
            }
          }
        } catch {
          // Class files are optional if query is unavailable.
        }
      }
      setItems(buildStudentNotifications(classes));
      setLoaded(true);
    } catch {
      // Silently ignore network/mock errors in header background fetch.
    }
  }, [isStudent]);

  useEffect(() => {
    if (!isStudent || !userId) return;
    const timer = setTimeout(() => {
      void loadNotifications();
    }, 0);

    const unsubscribe = subscribeToTeacherPosts(userId, () => {
      void loadNotifications();
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [isStudent, userId, loadNotifications]);

  // Close on Escape or pointerdown outside the bell and dropdown panel.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!isStudent) return null;

  const unreadItems = items.filter((item) => !readIds.has(item.id));
  const unreadCount = unreadItems.length;
  const badgeText = unreadCount > 9 ? '9+' : String(unreadCount);
  const bellLabel =
    unreadCount > 0
      ? `Notifications (${unreadCount} unread)`
      : 'Notifications';

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void loadNotifications();
  };

  const handleSelectItem = (itemId: string) => {
    markNotificationRead(userId, itemId);
    setOpen(false);
  };

  const handleMarkAllRead = () => {
    markAllNotificationsRead(
      userId,
      items.map((item) => item.id)
    );
  };

  return (
    <div className="relative inline-flex items-center">
      {/* Screen-reader live region announcing unread count updates */}
      <span aria-live="polite" aria-atomic="true" className="sr-only">
        {loaded
          ? unreadCount > 0
            ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
            : 'No unread notifications'
          : ''}
      </span>

      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        aria-label={bellLabel}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={open ? panelId : undefined}
        title="Teacher activity notifications"
        className={`${
          open ? 'brass' : 'brass-ring'
        } relative inline-flex min-h-9 min-w-9 items-center justify-center rounded-md px-2.5 text-sm font-semibold transition-colors`}
      >
        <BellIcon ringing={unreadCount > 0} />
        {unreadCount > 0 && (
          <span
            data-testid="notification-badge"
            aria-hidden="true"
            className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-pencil px-1.5 py-0.5 font-sans text-[11px] font-bold leading-none text-[#fbf7ee] shadow-sm"
          >
            {badgeText}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="region"
          aria-labelledby={headingId}
          className="paper paper-shadow absolute left-0 top-[calc(100%+10px)] z-50 w-80 max-w-[calc(100vw-1.5rem)] rounded-lg border border-ink/15 p-3.5 text-ink sm:left-auto sm:right-0 sm:w-96"
        >
          <div className="flex items-center justify-between gap-2 border-b border-ink/15 pb-2.5">
            <div>
              <h2
                id={headingId}
                className="font-serif text-base font-semibold leading-snug text-ink"
              >
                New from your teachers
              </h2>
              <p className="font-sans text-[11.5px] text-muted">
                {unreadCount > 0
                  ? `${unreadCount} unread post${unreadCount === 1 ? '' : 's'}`
                  : 'All caught up'}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="min-h-9 rounded-md px-2 font-sans text-xs font-semibold text-brass-ink hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="py-6 text-center font-sans text-sm text-muted">
              No teacher posts yet. When your teacher assigns a deck or quiz, it will show up here.
            </p>
          ) : (
            <ul
              aria-label="Recent teacher posts"
              className="mt-2 max-h-80 divide-y divide-ink/10 overflow-y-auto"
            >
              {items.map((item) => {
                const isUnread = !readIds.has(item.id);
                const timestamp = formatNotificationTime(item.createdAt);
                return (
                  <li key={item.id} className="py-1 first:pt-0 last:pb-0">
                    <Link
                      href={item.href}
                      onClick={() => handleSelectItem(item.id)}
                      data-unread={isUnread ? 'true' : 'false'}
                      className={`group flex items-start justify-between gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-brass/20 ${
                        isUnread
                          ? 'border-l-2 border-brass bg-brass/12 font-medium'
                          : 'opacity-80'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {isUnread && (
                            <span
                              data-testid="unread-dot"
                              aria-hidden="true"
                              className="inline-block h-2 w-2 shrink-0 rounded-full bg-pencil"
                            />
                          )}
                          <span className="truncate font-serif text-[15px] font-semibold leading-snug text-ink group-hover:underline">
                            {item.title}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate font-sans text-xs text-muted">
                          <span className="font-semibold text-brass-ink">
                            {item.categoryLabel}
                          </span>
                          {' · '}
                          {item.studyTypeLabel}
                          {' · '}
                          {item.className}
                          {item.teacherName ? ` (${item.teacherName})` : ''}
                        </p>
                      </div>
                      {timestamp && (
                        <time
                          dateTime={item.createdAt}
                          className="shrink-0 pt-0.5 font-sans text-[11px] tabular-nums text-muted"
                        >
                          {timestamp}
                        </time>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
