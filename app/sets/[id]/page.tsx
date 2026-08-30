import { supabase } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import FlashcardViewer from '@/components/FlashcardViewer';

export default async function SetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: set, error } = await supabase
    .from('flashcard_sets')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !set) return notFound();

  const { data: cards } = await supabase
    .from('flashcards')
    .select('*')
    .eq('set_id', id)
    .order('position', { ascending: true });

  return (
    <main className="min-h-screen p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{set.title}</h1>
        <p className="text-sm text-gray-500">Source: {set.source_filename}</p>
      </div>

      {cards && cards.length > 0 ? (
        <FlashcardViewer cards={cards} />
      ) : (
        <div className="border rounded-lg p-6 text-center text-gray-500">
          No flashcards yet for this set.
        </div>
      )}
    </main>
  );
}
