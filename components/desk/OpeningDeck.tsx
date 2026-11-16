import DeckMorph from './DeckMorph';

// A deck picked up in the library, while its cards load (desk redesign, phase
// 5). It carries the deck's morph name, so the deck in the library morphs
// straight into it; then the study desk takes over.
export default function OpeningDeck({ morph }: { morph: string }) {
  return (
    <main className="on-desk flex w-full flex-col items-center gap-5 py-20">
      <DeckMorph name={morph}>
        <div aria-hidden="true" className="relative aspect-[258/161] w-[258px] max-w-full">
          <span className="paper deck-layer deck-layer-2 absolute inset-0 rounded-[7px]" />
          <span className="paper deck-layer deck-layer-1 absolute inset-0 rounded-[7px]" />
          <span className="paper deck-top absolute inset-0 rounded-[7px]" />
        </div>
      </DeckMorph>
      <p role="status" className="desk-wait text-sm text-on-desk/85">
        Opening the deck…
      </p>
    </main>
  );
}
