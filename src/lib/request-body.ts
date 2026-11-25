/**
 * Read a request body with a hard byte limit.
 *
 * Returns null as soon as more than `maxBytes` have arrived and cancels the
 * stream, so an oversized body (missing or forged Content-Length) is never
 * read completely into memory.
 */
export async function readBodyLimited(
  request: Request,
  maxBytes: number
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) return new Uint8Array(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** True if the declared Content-Length is present and above `maxBytes`. */
export function declaredLengthExceeds(request: Request, maxBytes: number): boolean {
  const raw = request.headers.get("content-length");
  if (raw === null) return false;
  const length = Number(raw);
  return Number.isFinite(length) && length > maxBytes;
}

/**
 * Wrap the request body in a byte-counting stream that errors as soon as more
 * than `maxBytes` pass through (the source stream is cancelled). Unlike
 * readBodyLimited() nothing is buffered here, so the body can be handed
 * straight to `new Response(body).formData()` without an extra copy.
 * Check `exceeded()` when parsing fails to tell "too large" apart from a
 * malformed body.
 */
export function limitBodyStream(
  request: Request,
  maxBytes: number
): { body: ReadableStream<Uint8Array> | null; exceeded: () => boolean } {
  let tooLarge = false;
  if (!request.body) return { body: null, exceeded: () => false };

  let total = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      total += chunk.byteLength;
      if (total > maxBytes) {
        tooLarge = true;
        controller.error(new Error("Request body too large"));
        return;
      }
      controller.enqueue(chunk);
    },
  });
  return { body: request.body.pipeThrough(counter), exceeded: () => tooLarge };
}
