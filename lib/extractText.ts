// Extracts plain text from an uploaded File so it can be sent to the AI.
// Supports PDF, TXT, and DOCX.

export async function extractText(file: File): Promise<string> {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

  if (ext === '.txt') {
    return await file.text();
  }

  if (ext === '.pdf') {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const { extractText: extractPdfText, getDocumentProxy } = await import(
      'unpdf'
    );
    const pdf = await getDocumentProxy(buffer);
    const { text } = await extractPdfText(pdf, { mergePages: true });
    return text;
  }

  if (ext === '.docx') {
    const buffer = Buffer.from(await file.arrayBuffer());
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error(`Unsupported file type: ${ext}`);
}
