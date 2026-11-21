import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { GeneratedItem } from '@/lib/gemini';
import { isUuid } from '@/lib/ids';
import type { StudyType } from '@/lib/study-types';
import { cleanFileName } from '@/lib/pdf-pages';
import { fileKind } from '@/lib/sources';

// SERVER-ONLY (service-role client). History (/history): every study guide a
// signed-in user generates, saved or not (public.guide_history). Browsers can
// only read and remove their own entries.

export interface GeneratedGuide {
  title: string;
  studyType: StudyType;
  // The file's name, or the link of the web page or Wikipedia article; null for pasted notes.
  sourceFilename: string | null;
  // Credit for a web page or Wikipedia article.
  source: { name: string; url: string } | null;
  items: GeneratedItem[];
  sourceFile?: File | { name: string; pages: string[] };
}

// Adds a guide /api/generate just made to its maker's history and returns the
// entry's id, or null if it couldn't be kept. Never throws: the guide still
// goes to the user either way.
export async function addToHistory(
  userId: string,
  guide: GeneratedGuide,
  client: SupabaseClient = supabaseAdmin
): Promise<string | null> {
  try {
    const { data, error } = await client
      .from('guide_history')
      .insert({
        user_id: userId,
        title: guide.title,
        study_type: guide.studyType,
        source_filename: guide.sourceFilename,
        source_credit: guide.source,
        items: guide.items,
      })
      .select('id')
      .single();
    if (error) throw error;
    const historyId = data.id as string;
    if (guide.sourceFile) {
      try {
        const file = guide.sourceFile;
        const kind = 'pages' in file ? 'pdf-text' : fileKind(file.name, file.type);
        const bytes = 'pages' in file
          ? Buffer.from(file.pages.map((page, index) => `Page ${index + 1}\n\n${page}`).join('\n\n'))
          : Buffer.from(await file.arrayBuffer());
        const result = await client.from('guide_source_files').insert({
          history_id: historyId,
          user_id: userId,
          name: cleanFileName(file.name),
          kind,
          content_base64: bytes.toString('base64'),
        });
        if (result.error) throw result.error;
      } catch (err) {
        console.error('[history] could not keep the source file:', err);
      }
    }
    return historyId;
  } catch (err) {
    console.error('[history] could not add a guide:', err);
    return null;
  }
}

// Records that the owner saved a history entry as the set `setId`, so History
// shows it as saved. An id that isn't one of the owner's entries is ignored.
// Never throws: the set is already saved.
export async function markSaved(
  ownerId: string,
  historyId: unknown,
  setId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<void> {
  if (!isUuid(historyId)) return;
  try {
    const { error } = await client
      .from('guide_history')
      .update({ set_id: setId })
      .eq('id', historyId)
      .eq('user_id', ownerId);
    if (error) throw error;
  } catch (err) {
    console.error('[history] could not mark a guide as saved:', err);
  }
}
