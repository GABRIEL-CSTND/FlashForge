// Builds a small but valid PDF for tests: one line of text per page, and optionally
// padding to make the file as big as a real lecture PDF (the padding is an object
// no page uses, so it changes the size and nothing else).

const escapeText = (text: string) => text.replace(/[\\()]/g, (c) => `\\${c}`);

export function makePdf(pageTexts: string[], options: { padBytes?: number } = {}): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body);

  const pageIds = pageTexts.map((_, i) => 4 + i * 2);
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageTexts.length} >>`);
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  pageTexts.forEach((text, i) => {
    const content = `BT /F1 12 Tf 40 700 Td (${escapeText(text)}) Tj ET`;
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${pageIds[i] + 1} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`
    );
    add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  if (options.padBytes) {
    add(`<< /Length ${options.padBytes} >>\nstream\n${'0123456789abcdef'.repeat(Math.ceil(options.padBytes / 16)).slice(0, options.padBytes)}\nendstream`);
  }

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf, 'latin1'));
}
