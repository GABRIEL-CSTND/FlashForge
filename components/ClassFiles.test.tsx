// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createFakeSupabase, fakeUuid } from '@/test-utils/fake-supabase';

const fake = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('@/test-utils/fake-supabase').createFakeSupabase> }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const query = fake.current!.client.from(table);
      return Object.assign(query, { abortSignal: () => query });
    },
  },
}));

import ClassFiles from '@/components/ClassFiles';

const CLASS = fakeUuid();
const FILE = { id: fakeUuid(), class_id: CLASS, name: 'Lesson notes.txt', content_base64: 'aGVsbG8=', size_bytes: 5 };

beforeEach(() => {
  fake.current = createFakeSupabase({ tables: { class_files: { unique: [['id']], defaults: { id: fakeUuid, size_bytes: () => 5 } } } });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('class files', () => {
  it('posts the selected file to the current class and can remove it', async () => {
    vi.stubGlobal('confirm', () => true);
    render(<ClassFiles classId={CLASS} canPost />);
    await screen.findByText('No class files yet.');
    fireEvent.change(screen.getByLabelText('Choose a class file'), { target: {
      files: [new File(['hello'], FILE.name, { type: 'text/plain' })],
    } });
    fireEvent.click(screen.getByRole('button', { name: 'Post file' }));
    await screen.findByText(`${FILE.name} was posted.`);
    expect(fake.current!.db.rows.class_files).toMatchObject([{ class_id: CLASS, name: FILE.name, content_base64: FILE.content_base64 }]);
    fireEvent.click(screen.getByRole('button', { name: `Remove ${FILE.name}` }));
    await screen.findByText('No class files yet.');
    expect(fake.current!.db.rows.class_files).toEqual([]);
  });

  it('lets a student download a file from the class without offering posting or removal', async () => {
    fake.current!.db.rows.class_files.push(FILE, { ...FILE, id: fakeUuid(), class_id: fakeUuid(), name: 'Other class.txt' });
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:class-file');
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL: vi.fn() }));
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe(FILE.name);
    });
    render(<ClassFiles classId={CLASS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Class files' }));
    fireEvent.click(await screen.findByRole('button', { name: `Download ${FILE.name}` }));
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    expect(createObjectURL.mock.calls[0][0].size).toBe(FILE.size_bytes);
    expect(screen.queryByText('Other class.txt')).toBeNull();
    expect(screen.queryByRole('button', { name: /post|remove/i })).toBeNull();
  });
});
