// PDF → plain text extraction, lazy-loaded.
// Mirrors the pattern in the Sermons App. Imports pdfjs-dist
// dynamically so the heavy dep stays out of the initial bundle.

let _pdfjsPromise = null;
async function getPdfjs() {
  if (_pdfjsPromise) return _pdfjsPromise;
  _pdfjsPromise = (async () => {
    const pdfjsLib = await import('pdfjs-dist');
    const workerSrc = (
      await import('pdfjs-dist/build/pdf.worker.mjs?url')
    ).default;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
    return pdfjsLib;
  })();
  return _pdfjsPromise;
}

/**
 * Extract text from a PDF Blob/File.
 * @param {Blob|File} blob
 * @returns {Promise<{ text: string, pageCount: number }>}
 */
export async function extractPdfText(blob) {
  let pdfjs;
  try {
    pdfjs = await getPdfjs();
  } catch (e) {
    throw new Error(
      "Couldn't load the PDF parser. Refresh the page and try again."
    );
  }
  const arrayBuffer = await blob.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const total = doc.numPages;
  const pageTexts = [];
  for (let p = 1; p <= total; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((it) => (typeof it.str === 'string' ? it.str : ''))
      .join(' ')
      .replace(/[ \t]+/g, ' ')
      .trim();
    pageTexts.push(pageText);
  }
  const text = pageTexts.join('\n\n').trim();
  return { text, pageCount: total };
}
