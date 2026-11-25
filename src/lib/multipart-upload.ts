import busboy from "busboy";
import { createWriteStream, promises as fs, type WriteStream } from "node:fs";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

/**
 * Streaming multipart/form-data receiver (busboy).
 *
 * The single file part is written straight to a temporary file, so the request
 * body is never held in memory as a whole. Text fields are collected in memory
 * (bounded by `limits.fieldSize` and `limits.fields`).
 */

/** A configured limit was exceeded: "file" = the file part, "request" = fields/parts. */
export class MultipartLimitError extends Error {
  constructor(
    readonly kind: "file" | "request",
    message: string
  ) {
    super(message);
    this.name = "MultipartLimitError";
  }
}

/** The body is not valid multipart/form-data (bad content type, missing boundary, truncated body...). */
export class MultipartFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MultipartFormatError";
  }
}

export interface MultipartLimits {
  /** Maximum allowed size of the file part in bytes (a file of exactly this size is accepted). */
  fileSize: number;
  /** Maximum number of text fields. */
  fields: number;
  /** Maximum size of a single text field value in bytes. */
  fieldSize: number;
  /** Maximum number of parts (fields + files). */
  parts: number;
  /** Maximum number of header pairs per part. */
  headerPairs: number;
}

export interface ReceivedFile {
  filename: string;
  mimeType: string;
  size: number;
  /** The first `headBytes` bytes of the content (for magic-byte checks). */
  head: Buffer;
  /** The temporary file holding the content, or null if the file was not accepted (only counted). */
  path: string | null;
}

export interface MultipartResult {
  fields: Map<string, string[]>;
  file: ReceivedFile | null;
}

export interface ReceiveMultipartOptions {
  contentType: string;
  /** Name of the form field that carries the file. Other file parts are skipped. */
  fileField: string;
  /** Where the file content goes. Removed again on every error path. */
  tmpPath: string;
  /** Decide from the filename whether the content is stored. Rejected files are only counted. */
  acceptFile?: (filename: string) => boolean;
  limits: MultipartLimits;
  headBytes?: number;
}

const DEFAULT_HEAD_BYTES = 256;

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Parse a multipart body. Resolves once the body is fully consumed and the file
 * is completely written. Rejects with MultipartLimitError / MultipartFormatError
 * (or the underlying stream error); in that case the source is cancelled and the
 * temporary file is removed before the promise settles.
 */
export async function receiveMultipart(
  body: ReadableStream<Uint8Array> | null,
  opts: ReceiveMultipartOptions
): Promise<MultipartResult> {
  if (!body) throw new MultipartFormatError("Missing request body");

  let parser: busboy.Busboy;
  try {
    parser = busboy({
      headers: { "content-type": opts.contentType },
      defParamCharset: "utf8", // browsers, undici and OkHttp send UTF-8 filenames
      preservePath: true, // keep the client's filename as-is; the caller sanitizes it
      // busboy reports "limit" when the file *reaches* fileSize, so allow one
      // extra byte: the event then means "larger than the allowed size".
      limits: { ...opts.limits, fileSize: opts.limits.fileSize + 1, files: 1 },
    });
  } catch (err) {
    await body.cancel().catch(() => {});
    throw new MultipartFormatError(message(err));
  }

  const source = Readable.fromWeb(body as NodeReadableStream<Uint8Array>);
  const headBytes = opts.headBytes ?? DEFAULT_HEAD_BYTES;
  const fields = new Map<string, string[]>();
  const headChunks: Buffer[] = [];
  let headLength = 0;
  let file: ReceivedFile | null = null;
  let out: WriteStream | null = null;
  let written: Promise<void> = Promise.resolve();

  return new Promise<MultipartResult>((resolve, reject) => {
    let settled = false;

    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      source.unpipe(parser);
      source.destroy();
      // busboy may still be inside its own event emission (e.g. "limit"), and
      // destroying it synchronously there breaks its internal state.
      setImmediate(() => parser.destroy());
      const cleanup = async () => {
        if (out) {
          out.destroy();
          await finished(out).catch(() => {});
        }
        await fs.rm(opts.tmpPath, { force: true });
      };
      cleanup().then(
        () => reject(err),
        () => reject(err)
      );
    };

    parser.on("field", (name, value, info) => {
      if (settled) return;
      if (info.nameTruncated || info.valueTruncated) {
        fail(new MultipartLimitError("request", `Field too large: ${name}`));
        return;
      }
      const list = fields.get(name);
      if (list) list.push(value);
      else fields.set(name, [value]);
    });

    parser.on("file", (name, stream, info) => {
      // A destroyed parser errors its open file stream; that is already handled via fail().
      stream.on("error", () => {});
      // Only the first part of the file field is used (like FormData.get()).
      if (settled || name !== opts.fileField || file) {
        stream.resume();
        return;
      }
      const received: ReceivedFile = {
        filename: info.filename ?? "",
        mimeType: info.mimeType,
        size: 0,
        head: Buffer.alloc(0),
        path: null,
      };
      file = received;

      stream.on("data", (chunk: Buffer) => {
        received.size += chunk.length;
        if (headLength < headBytes) {
          const part = Buffer.from(chunk.subarray(0, headBytes - headLength));
          headChunks.push(part);
          headLength += part.length;
        }
      });
      stream.on("limit", () => fail(new MultipartLimitError("file", "File too large")));

      if (opts.acceptFile?.(received.filename) ?? true) {
        received.path = opts.tmpPath;
        out = createWriteStream(opts.tmpPath, { flags: "wx" });
        out.on("error", fail);
        written = finished(out);
        written.catch(() => {}); // handled in "close" / fail()
        stream.pipe(out);
      }
    });

    parser.on("fieldsLimit", () => fail(new MultipartLimitError("request", "Too many fields")));
    parser.on("partsLimit", () => fail(new MultipartLimitError("request", "Too many parts")));
    // "filesLimit": further file parts are skipped by busboy, nothing to do.
    parser.on("error", (err) => fail(new MultipartFormatError(message(err))));
    source.on("error", fail);

    parser.on("close", () => {
      written.then(() => {
        if (settled) return;
        settled = true;
        if (file) file.head = Buffer.concat(headChunks);
        resolve({ fields, file });
      }, fail);
    });

    source.pipe(parser);
  });
}
