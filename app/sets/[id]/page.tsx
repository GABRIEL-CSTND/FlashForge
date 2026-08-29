import { supabase } from '@/lib/supabase';
import { notFound } from 'next/navigation';

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

  return (
    <main className="min-h-screen p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">{set.title}</h1>
      <p className="text-sm text-gray-500">Source: {set.source_filename}</p>
      <div className="border rounded-lg p-6 text-center text-gray-500">
        Flashcard generation isn't wired up yet — that's Week 3.
        <br />
        For now, this confirms the set was created successfully (id: {set.id}).
      </div>
    </main>
  );
}
