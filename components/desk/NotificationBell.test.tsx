// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { StudentClassPostSource } from '@/lib/student-notifications';

type ChannelCallback = (payload?: unknown) => void;

const state = vi.hoisted(() => ({
  user: { id: 'stu-1', email: 'student@example.com' } as { id: string; email: string } | null,
  profile: { role: 'student', roleChosenAt: '2026-10-20', displayName: 'Sam Student' } as {
    role: string;
    roleChosenAt: string;
    displayName: string | null;
  } | null,
  pathname: '/classes',
  classes: [] as StudentClassPostSource[],
  channelListeners: [] as { event: string; filter: Record<string, unknown>; callback: ChannelCallback }[],
  removeChannelCalls: 0,
}));

vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
vi.mock('@/lib/auth', () => ({
  useUser: () => ({ user: state.user, loading: false }),
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@/components/ProfileProvider', () => ({
  useProfile: () => ({ profile: state.profile }),
}));
vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(async (path: string) => {
    if (path === '/api/student/classes') {
      return { ok: true, status: 200, data: { classes: state.classes } };
    }
    return { ok: false, status: 404, data: { error: 'Not found' } };
  }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => {
      const ch = {
        on: (event: string, filter: Record<string, unknown>, callback: ChannelCallback) => {
          state.channelListeners.push({ event, filter, callback });
          return ch;
        },
        subscribe: () => ch,
        unsubscribe: () => {},
      };
      return ch;
    }),
    removeChannel: vi.fn(async () => {
      state.removeChannelCalls += 1;
    }),
  },
}));

import CardBox from '@/components/desk/CardBox';
import NotificationBell from '@/components/desk/NotificationBell';
import {
  buildStudentNotifications,
  clearNotificationMemoryForTests,
  formatNotificationTime,
  storageKeyForUser,
  TEACHER_POST_EVENT,
} from '@/lib/student-notifications';

const SAMPLE_CLASSES: StudentClassPostSource[] = [
  {
    id: 'cls-bio',
    name: 'Biology 101',
    teacherName: 'Ms. Reyes',
    assignments: [
      {
        id: 'assign-1',
        setId: 'set-photo',
        setTitle: 'Photosynthesis Deck',
        studyType: 'flashcard',
        category: 'assignment',
        dueAt: '2026-12-01T17:00:00Z',
        createdAt: '2026-11-27T10:00:00Z',
      },
      {
        id: 'quiz-1',
        setId: 'set-cells',
        setTitle: 'Cell Organelles Quiz',
        studyType: 'multiple_choice',
        category: 'quiz',
        dueAt: null,
        createdAt: '2026-11-28T01:30:00Z',
      },
      {
        id: 'mat-1',
        setId: 'set-guide',
        setTitle: 'Mitosis Study Guide',
        studyType: 'flashcard',
        category: 'material',
        dueAt: null,
        createdAt: '2026-11-26T08:00:00Z',
      },
    ],
  },
];

beforeEach(() => {
  state.user = { id: 'stu-1', email: 'student@example.com' };
  state.profile = { role: 'student', roleChosenAt: '2026-10-20', displayName: 'Sam Student' };
  state.pathname = '/classes';
  state.classes = structuredClone(SAMPLE_CLASSES);
  state.channelListeners = [];
  state.removeChannelCalls = 0;
  localStorage.clear();
  clearNotificationMemoryForTests();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  clearNotificationMemoryForTests();
  vi.clearAllMocks();
});

describe('student notification bell (#110)', () => {
  it('renders in the student navigation bar with cohesive theme classes and accessible ARIA attributes', async () => {
    render(<CardBox />);
    const bell = await screen.findByRole('button', { name: 'Notifications (3 unread)' });
    expect(bell.getAttribute('aria-expanded')).toBe('false');
    expect(bell.getAttribute('aria-haspopup')).toBe('true');
    // Uses brass-ring when closed, matching the desk palette
    expect(bell.className).toContain('brass-ring');
    expect(bell.className).toContain('rounded-md');

    const badge = screen.getByTestId('notification-badge');
    expect(badge.textContent).toBe('3');
    expect(badge.className).toContain('bg-pencil');

    // Live region announces the unread count for screen readers
    const live = document.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe('3 unread notifications');

    // Opening switches the button to brass and opens the warm cream paper popover
    fireEvent.click(bell);
    expect(bell.getAttribute('aria-expanded')).toBe('true');
    expect(bell.className).toContain('brass');

    const region = screen.getByRole('region', { name: 'New from your teachers' });
    expect(region.className).toContain('paper');
    expect(region.className).toContain('paper-shadow');
    expect(region.className).toContain('rounded-lg');
  });

  it('hides the notification bell for teachers, admins, and signed-out visitors', () => {
    state.profile = { role: 'teacher', roleChosenAt: '2026-10-20', displayName: 'Ms. Reyes' };
    const { rerender } = render(<NotificationBell />);
    expect(screen.queryByRole('button', { name: /Notifications/i })).toBeNull();

    state.profile = { role: 'admin', roleChosenAt: '2026-10-20', displayName: 'Admin' };
    rerender(<NotificationBell />);
    expect(screen.queryByRole('button', { name: /Notifications/i })).toBeNull();

    state.user = null;
    state.profile = null;
    rerender(<NotificationBell />);
    expect(screen.queryByRole('button', { name: /Notifications/i })).toBeNull();
  });

  it('lists recent teacher posts newest first with titles, timestamps, and unread highlights, and navigates directly on click while marking as read', async () => {
    render(<NotificationBell />);
    const bell = await screen.findByRole('button', { name: 'Notifications (3 unread)' });
    fireEvent.click(bell);

    const list = screen.getByRole('list', { name: 'Recent teacher posts' });
    const links = within(list).getAllByRole('link');
    expect(links).toHaveLength(3);

    // Sorted newest first: Cell Organelles Quiz -> Photosynthesis Deck -> Mitosis Study Guide
    expect(links[0].textContent).toContain('Cell Organelles Quiz');
    expect(links[0].textContent).toContain('Quiz · Multiple choice · Biology 101 (Ms. Reyes)');
    expect(links[0].getAttribute('href')).toBe('/sets/set-cells?assignment=quiz-1');
    expect(links[0].getAttribute('data-unread')).toBe('true');
    expect(links[0].querySelector('time')?.getAttribute('dateTime')).toBe('2026-11-28T01:30:00Z');

    expect(links[1].textContent).toContain('Photosynthesis Deck');
    expect(links[1].getAttribute('href')).toBe('/sets/set-photo?assignment=assign-1');
    expect(links[1].getAttribute('data-unread')).toBe('true');

    expect(links[2].textContent).toContain('Mitosis Study Guide');
    expect(links[2].getAttribute('href')).toBe('/sets/set-guide?material=mat-1');
    expect(links[2].getAttribute('data-unread')).toBe('true');

    // Selecting the first item marks it as read, updates the badge counter, and closes the dropdown
    links[0].addEventListener('click', (e) => e.preventDefault(), { once: true });
    fireEvent.click(links[0]);
    expect(screen.queryByRole('region', { name: 'New from your teachers' })).toBeNull();
    expect(await screen.findByRole('button', { name: 'Notifications (2 unread)' })).toBeTruthy();
    expect(screen.getByTestId('notification-badge').textContent).toBe('2');

    // Re-opening shows the clicked item as read (no unread highlight) while others stay unread
    fireEvent.click(screen.getByRole('button', { name: 'Notifications (2 unread)' }));
    const updatedLinks = within(screen.getByRole('list', { name: 'Recent teacher posts' })).getAllByRole('link');
    expect(updatedLinks[0].getAttribute('data-unread')).toBe('false');
    expect(updatedLinks[1].getAttribute('data-unread')).toBe('true');
    expect(updatedLinks[2].getAttribute('data-unread')).toBe('true');
  });

  it('marks all notifications as read and persists read state across sessions in localStorage', async () => {
    const firstSession = render(<NotificationBell />);
    const bell = await screen.findByRole('button', { name: 'Notifications (3 unread)' });
    fireEvent.click(bell);

    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));

    // Unread badge disappears and button label updates to "Notifications"
    await waitFor(() => {
      expect(screen.queryByTestId('notification-badge')).toBeNull();
    });
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
    expect(screen.getByText('All caught up')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).toBeNull();

    // Persisted in localStorage under the student's key
    const saved = JSON.parse(localStorage.getItem(storageKeyForUser('stu-1')) ?? '[]');
    expect(saved).toEqual(expect.arrayContaining(['assign-1', 'quiz-1', 'mat-1']));

    // Unmount and mount a fresh session: read state is preserved
    firstSession.unmount();
    render(<NotificationBell />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
    });
    expect(screen.queryByTestId('notification-badge')).toBeNull();
  });

  it('automatically updates the unread badge in real time when a teacher publishes a new deck or activity', async () => {
    render(<NotificationBell />);
    const bell = await screen.findByRole('button', { name: 'Notifications (3 unread)' });
    fireEvent.click(bell);
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(screen.queryByTestId('notification-badge')).toBeNull();

    // Teacher publishes a brand new flashcard activity in Biology 101
    state.classes = [
      {
        ...SAMPLE_CLASSES[0],
        assignments: [
          ...SAMPLE_CLASSES[0].assignments,
          {
            id: 'assign-new',
            setId: 'set-genetics',
            setTitle: 'Genetics & DNA Flashcards',
            studyType: 'flashcard',
            category: 'assignment',
            dueAt: null,
            createdAt: '2026-11-28T02:20:00Z',
          },
        ],
      },
    ];

    // Trigger Supabase Realtime postgres_changes listener for assignments
    const assignmentsListener = state.channelListeners.find(
      (l) => l.event === 'postgres_changes' && l.filter.table === 'assignments'
    );
    expect(assignmentsListener).toBeTruthy();
    await act(async () => {
      assignmentsListener!.callback({ new: { id: 'assign-new' } });
    });

    // Unread badge automatically increments to 1 for the new post
    expect(await screen.findByRole('button', { name: 'Notifications (1 unread)' })).toBeTruthy();
    expect(screen.getByTestId('notification-badge').textContent).toBe('1');

    // Also responds to same-tab teacher post event
    state.classes[0].assignments.push({
      id: 'quiz-new',
      setId: 'set-evolution',
      setTitle: 'Evolution Pop Quiz',
      studyType: 'true_false',
      category: 'quiz',
      dueAt: null,
      createdAt: '2026-11-28T02:25:00Z',
    });
    await act(async () => {
      window.dispatchEvent(new Event(TEACHER_POST_EVENT));
    });
    expect(await screen.findByRole('button', { name: 'Notifications (2 unread)' })).toBeTruthy();
  });

  it('closes the dropdown on Escape or clicking outside', async () => {
    render(<NotificationBell />);
    const bell = await screen.findByRole('button', { name: 'Notifications (3 unread)' });
    fireEvent.click(bell);
    expect(screen.getByRole('region', { name: 'New from your teachers' })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'New from your teachers' })).toBeNull();

    fireEvent.click(bell);
    expect(screen.getByRole('region', { name: 'New from your teachers' })).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('region', { name: 'New from your teachers' })).toBeNull();
  });
});

describe('student-notifications helpers (#110)', () => {
  it('formats relative and calendar timestamps cleanly', () => {
    const now = new Date('2026-11-28T12:00:00Z');
    expect(formatNotificationTime('2026-11-28T11:59:40Z', now)).toBe('Just now');
    expect(formatNotificationTime('2026-11-28T11:45:00Z', now)).toBe('15m ago');
    expect(formatNotificationTime('2026-11-28T09:00:00Z', now)).toBe('3h ago');
    expect(formatNotificationTime('2026-11-26T12:00:00Z', now)).toBe('2d ago');
    expect(formatNotificationTime('2026-11-01T12:00:00Z', now)).toContain('Nov');
  });

  it('builds notifications for assignments, quizzes, learning materials, and class files', () => {
    const items = buildStudentNotifications([
      {
        id: 'c1',
        name: 'Chemistry',
        teacherName: null,
        assignments: [
          {
            id: 'a1',
            setId: 's1',
            setTitle: 'Acids & Bases',
            studyType: 'flashcard',
            category: 'material',
            createdAt: '2026-11-20T10:00:00Z',
          },
        ],
        files: [
          {
            id: 'f1',
            name: 'Periodic-Table.pdf',
            createdAt: '2026-11-21T10:00:00Z',
          },
        ],
      },
    ]);
    expect(items.map((i) => ({ id: i.id, title: i.title, href: i.href }))).toEqual([
      { id: 'file:f1', title: 'Periodic-Table.pdf', href: '/classes' },
      { id: 'a1', title: 'Acids & Bases', href: '/sets/s1?material=a1' },
    ]);
  });
});
