/**
 * Files a case can send without a fixture on disk.
 *
 * The API reads the type from the bytes, not from the multipart header
 * (`apps/api/src/common/file-signature.ts`), so the fixtures carry a real
 * signature: a PDF for invoices and receipts, a PNG for attachments. Generating
 * them here keeps the repository free of binary blobs and makes the content of
 * each upload obvious at the call site.
 */
export interface UploadableFile {
  readonly filename: string;
  readonly contentType: string;
  readonly bytes: Buffer;
}

/** `%PDF` prefix plus a minimal body: enough for the signature check and a download. */
export function pdfFile(filename = "receipt.pdf"): UploadableFile {
  return {
    filename,
    contentType: "application/pdf",
    bytes: Buffer.from(
      "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
        "2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n" +
        "trailer\n<< /Root 1 0 R >>\n%%EOF\n",
      "latin1",
    ),
  };
}

/** An 8×8 PNG, the smallest image the attachment allowlist accepts as pixels. */
export function pngFile(filename = "screenshot.png"): UploadableFile {
  return {
    filename,
    contentType: "image/png",
    bytes: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAAFUlE" +
        "QVAIiWNgYGD4z8DAwMgABQAAAAAAAAwBAgH7GusAAAAASUVORK5CYII=",
      "base64",
    ),
  };
}

/** A file the allowlist rejects, which is how a refusal case proves the check runs. */
export function textFile(filename = "notes.txt"): UploadableFile {
  return {
    filename,
    contentType: "text/plain",
    bytes: Buffer.from("plain text, not an allowed attachment type\n", "utf8"),
  };
}

/** Turns a fixture into the multipart part the API expects. */
export function formDataOf(file: UploadableFile): FormData {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(file.bytes)], { type: file.contentType }), file.filename);

  return form;
}
