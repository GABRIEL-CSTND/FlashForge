import { useSyncExternalStore } from 'react';
import { CLASS_CONTENT, type ClassContentCategory } from '@/lib/classes-shared';
import { shortDate } from '@/lib/library';
import { STUDY_TYPE_LABELS, toStudyType } from '@/lib/study-types';
import { supabase } from '@/lib/supabase';

// Student notifications (#110): alerts students in the navigation bar whenever
// a teacher posts a new flashcard deck, quiz, learning material, or class file.
// Read state is remembered per student on the device (localStorage, with an
// in-memory fallback when storage is blocked).

export interface StudentClassPostSource {
  id: string;
  name: string;
  teacherName: string | null;
  joinedAt?: string;
  assignments: {
    id: string;
    setId: string;
    setTitle: string;
    studyType: string;
    category?: ClassContentCategory;
    dueAt?: string | null;
    createdAt: string;
  }[];
  files?: {
    id: string;
    name: string;
    createdAt: string;
  }[];
}

export interface StudentNotificationItem {
  id: string;
  setId: string;
  title: string;
  classId: string;
  className: string;
  teacherName: string | null;
  category: ClassContentCategory;
  categoryLabel: string;
  studyTypeLabel: string;
  createdAt: string;
  href: string;
}

const CATEGORY_LABELS: Record<ClassContentCategory, string> = Object.fromEntries(
  CLASS_CONTENT.map((c) => [c.category, c.label])
) as Record<ClassContentCategory, string>;

export function buildStudentNotifications(classes: StudentClassPostSource[]): StudentNotificationItem[] {
  const items: StudentNotificationItem[] = [];
  for (const cls of classes) {
    for (const a of cls.assignments ?? []) {
      const category: ClassContentCategory = a.category ?? 'assignment';
      const isMaterial = category === 'material';
      items.push({
        id: a.id,
        setId: a.setId,
        title: a.setTitle,
        classId: cls.id,
        className: cls.name,
        teacherName: cls.teacherName,
        category,
        categoryLabel: CATEGORY_LABELS[category] ?? 'Assignment',
        studyTypeLabel: STUDY_TYPE_LABELS[toStudyType(a.studyType)],
        createdAt: a.createdAt,
        href: `/sets/${a.setId}?${isMaterial ? 'material' : 'assignment'}=${a.id}`,
      });
    }
    for (const f of cls.files ?? []) {
      items.push({
        id: `file:${f.id}`,
        setId: f.id,
        title: f.name,
        classId: cls.id,
        className: cls.name,
        teacherName: cls.teacherName,
        category: 'material',
        categoryLabel: 'Learning material',
        studyTypeLabel: 'Class file',
        createdAt: f.createdAt,
        href: '/classes',
      });
    }
  }
  return items.sort((a, b) => {
    const timeDiff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    return Number.isNaN(timeDiff) ? 0 : timeDiff;
  });
}

export function formatNotificationTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const ms = date.getTime();
  if (Number.isNaN(ms)) return '';
  const diffSeconds = Math.floor((now.getTime() - ms) / 1000);
  if (diffSeconds >= 0 && diffSeconds < 60) return 'Just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes >= 1 && diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours >= 1 && diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays >= 1 && diffDays < 7) return `${diffDays}d ago`;
  return shortDate(iso);
}

const STORAGE_PREFIX = 'flashforge_notifications_read';
const CHANGE_EVENT = 'flashforge-notifications-read';
export const TEACHER_POST_EVENT = 'flashforge:teacher-post';

const memoryStore = new Map<string, Set<string>>();
const snapshotCache = new Map<string, { raw: string; ids: ReadonlySet<string> }>();
const EMPTY_SET: ReadonlySet<string> = new Set();

export function storageKeyForUser(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

export function readSeenNotificationIds(userId: string | null | undefined): ReadonlySet<string> {
  if (!userId) return EMPTY_SET;
  const key = storageKeyForUser(userId);
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    // Storage blocked: fall back to in-memory set.
  }
  if (raw === null) {
    const mem = memoryStore.get(userId);
    if (!mem || mem.size === 0) return EMPTY_SET;
    const serialized = JSON.stringify([...mem].sort());
    const cached = snapshotCache.get(userId);
    if (cached && cached.raw === serialized) return cached.ids;
    const next = new Set(mem);
    snapshotCache.set(userId, { raw: serialized, ids: next });
    return next;
  }
  const cached = snapshotCache.get(userId);
  if (cached && cached.raw === raw) return cached.ids;
  try {
    const parsed = JSON.parse(raw);
    const ids = new Set<string>(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
    memoryStore.set(userId, new Set(ids));
    snapshotCache.set(userId, { raw, ids });
    return ids;
  } catch {
    return EMPTY_SET;
  }
}

function writeSeenNotificationIds(userId: string, ids: Iterable<string>): void {
  const unique = [...new Set(ids)];
  memoryStore.set(userId, new Set(unique));
  const serialized = JSON.stringify(unique);
  snapshotCache.set(userId, { raw: serialized, ids: new Set(unique) });
  try {
    localStorage.setItem(storageKeyForUser(userId), serialized);
  } catch {
    // Storage blocked: in-memory fallback is already updated.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

export function markNotificationRead(userId: string | null | undefined, notificationId: string): void {
  if (!userId || !notificationId) return;
  const current = readSeenNotificationIds(userId);
  if (current.has(notificationId)) return;
  writeSeenNotificationIds(userId, [...current, notificationId]);
}

export function markAllNotificationsRead(userId: string | null | undefined, notificationIds: Iterable<string>): void {
  if (!userId) return;
  const current = readSeenNotificationIds(userId);
  const merged = new Set(current);
  let changed = false;
  for (const id of notificationIds) {
    if (id && !merged.has(id)) {
      merged.add(id);
      changed = true;
    }
  }
  if (changed) writeSeenNotificationIds(userId, merged);
}

export function clearNotificationMemoryForTests(): void {
  memoryStore.clear();
  snapshotCache.clear();
}

function subscribeReadState(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function useReadNotificationIds(userId: string | null | undefined): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribeReadState,
    () => readSeenNotificationIds(userId),
    () => EMPTY_SET
  );
}

// Subscribes to real-time teacher posts (new assignments, quizzes, learning
// materials, or class files) via Supabase Realtime and window events.
export function subscribeToTeacherPosts(userId: string, onPost: () => void): () => void {
  const onWindowPost = () => onPost();
  if (typeof window !== 'undefined') {
    window.addEventListener(TEACHER_POST_EVENT, onWindowPost);
    window.addEventListener('focus', onWindowPost);
  }

  let cleanupChannel: (() => void) | null = null;
  if (typeof supabase?.channel === 'function') {
    try {
      const channel = supabase
        .channel(`student-notifications:${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, () => onPost())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'class_files' }, () => onPost())
        .on('broadcast', { event: 'teacher-post' }, () => onPost())
        .subscribe();

      cleanupChannel = () => {
        if (typeof supabase.removeChannel === 'function') {
          void supabase.removeChannel(channel);
        } else if (typeof (channel as { unsubscribe?: () => void }).unsubscribe === 'function') {
          (channel as { unsubscribe: () => void }).unsubscribe();
        }
      };
    } catch {
      // Realtime unavailable in this environment.
    }
  }

  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener(TEACHER_POST_EVENT, onWindowPost);
      window.removeEventListener('focus', onWindowPost);
    }
    cleanupChannel?.();
  };
}
