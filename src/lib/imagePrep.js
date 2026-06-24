// Browser-side image preparation for Claude vision input.
//
// Reads a File from an <input type="file">, draws it into a canvas
// downsized to a max edge (default 1568px — Anthropic's documented
// vision sweet spot), re-encodes as JPEG, and returns base64-encoded
// data ready to drop into Anthropic message content blocks.
//
// Why downsize: Claude vision charges by image tokens, image tokens
// scale with pixel count, and most phone-camera images are way bigger
// than the model can usefully see anyway.

const DEFAULT_MAX_EDGE = 1568;
const DEFAULT_QUALITY = 0.85;

/**
 * Prepare a single File for vision input.
 * @returns {Promise<{ data: string, mediaType: string, name: string, sizeBefore: number, sizeAfter: number }>}
 */
export async function prepareImage(file, opts = {}) {
  const maxEdge = opts.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = opts.quality ?? DEFAULT_QUALITY;

  if (!file) throw new Error('No file provided.');
  if (!file.type?.startsWith('image/')) {
    throw new Error(
      `"${file.name}" doesn't look like an image (${file.type || 'unknown type'}).`
    );
  }

  const dataUrl = await readAsDataURL(file);
  const img = await loadImage(dataUrl);

  // Compute target dimensions preserving aspect ratio.
  const { width: w0, height: h0 } = img;
  let w = w0;
  let h = h0;
  if (Math.max(w0, h0) > maxEdge) {
    if (w0 >= h0) {
      w = maxEdge;
      h = Math.round((h0 * maxEdge) / w0);
    } else {
      h = maxEdge;
      w = Math.round((w0 * maxEdge) / h0);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  // White background so transparent PNGs don't end up with black areas
  // after JPEG encode.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
  // Strip the data URL prefix to get just the base64 payload.
  const base64 = jpegDataUrl.replace(/^data:image\/jpeg;base64,/, '');

  // Rough size estimate for UX: 4 bytes of base64 = 3 bytes of binary.
  const sizeAfter = Math.floor((base64.length * 3) / 4);

  return {
    data: base64,
    mediaType: 'image/jpeg',
    name: file.name,
    sizeBefore: file.size,
    sizeAfter,
  };
}

/**
 * Prepare multiple files. Failures on individual files are surfaced as
 * { ok: false, error, name } so the caller can show partial success.
 */
export async function prepareImages(files, opts = {}) {
  const out = [];
  for (const f of files) {
    try {
      const prepped = await prepareImage(f, opts);
      out.push({ ok: true, ...prepped });
    } catch (e) {
      out.push({ ok: false, name: f?.name || '(unknown)', error: e.message || String(e) });
    }
  }
  return out;
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error(`Could not read "${file.name}".`));
    fr.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to load (corrupt or unsupported format).'));
    img.src = src;
  });
}
