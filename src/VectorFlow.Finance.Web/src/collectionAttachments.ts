/**
 * Collection attachments / supporting evidence (browser-local).
 * Stored on PromiseToPayRecord.attachments — same localStorage key.
 * Binary payload kept as a data URL with a hard size cap.
 */
import i18n from "./i18n/index.ts";


export type AttachmentCategory =
  | "payment_proof"
  | "invoice_copy"
  | "correspondence"
  | "contract"
  | "dispute_evidence"
  | "other";

export type CollectionAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  category: AttachmentCategory;
  description: string;
  uploadedBy: string;
  contentDataUrl: string;
  createdAtUtc: string;
  updatedAtUtc: string;
  archivedAtUtc: string | null;
};

export type CollectionAttachmentInput = {
  fileName?: string;
  contentType?: string;
  sizeBytes?: number;
  category?: AttachmentCategory | "";
  description?: string;
  uploadedBy?: string;
  contentDataUrl?: string;
};

export type CollectionAttachmentUpdateInput = CollectionAttachmentInput & {
  attachmentId: string;
  /** When false/omitted on update, existing payload is retained if content fields empty. */
  replaceContent?: boolean;
};

export type CollectionAttachmentValidationResult =
  | {
      ok: true;
      fileName: string;
      contentType: string;
      sizeBytes: number;
      category: AttachmentCategory;
      description: string;
      uploadedBy: string;
      contentDataUrl: string;
    }
  | { ok: false; error: string };

export const ATTACHMENT_CATEGORY_OPTIONS: readonly {
  id: AttachmentCategory;
  label: string;
}[] = [
  { id: "payment_proof", label: "Payment proof" },
  { id: "invoice_copy", label: "Invoice copy" },
  { id: "correspondence", label: "Correspondence" },
  { id: "contract", label: "Contract" },
  { id: "dispute_evidence", label: "Dispute evidence" },
  { id: "other", label: "Other" }
];

const CATEGORY_SET: ReadonlySet<string> = new Set(
  ATTACHMENT_CATEGORY_OPTIONS.map((option) => option.id)
);

export const ATTACHMENT_MAX_BYTES = 256 * 1024;
const FILE_NAME_MAX = 200;
const DESCRIPTION_MAX = 2000;
const AUTHOR_MAX = 120;
const CONTENT_TYPE_MAX = 120;
const DATA_URL_RE = /^data:[^;]+;base64,/i;

export function parseAttachmentCategory(
  value: string | null | undefined
): AttachmentCategory | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return CATEGORY_SET.has(trimmed) ? (trimmed as AttachmentCategory) : null;
}

export function attachmentCategoryLabel(category: AttachmentCategory): string {
  return (
    (ATTACHMENT_CATEGORY_OPTIONS.some((option) => option.id === category)
      ? i18n.t(`promise.attachmentCategory.${category}`, { ns: "finance" })
      : null) ??
    category
  );
}

export function isActiveCollectionAttachment(
  attachment: CollectionAttachment | null | undefined
): boolean {
  return Boolean(attachment && !attachment.archivedAtUtc);
}

export function listActiveCollectionAttachments(
  attachments: readonly CollectionAttachment[] | null | undefined
): CollectionAttachment[] {
  if (!attachments?.length) {
    return [];
  }
  return attachments.filter((item) => isActiveCollectionAttachment(item));
}

export function countActiveCollectionAttachments(
  attachments: readonly CollectionAttachment[] | null | undefined
): number {
  return listActiveCollectionAttachments(attachments).length;
}

export function hasActiveCollectionAttachments(
  attachments: readonly CollectionAttachment[] | null | undefined
): boolean {
  return countActiveCollectionAttachments(attachments) > 0;
}

/** Active first, then newest updated. */
export function sortCollectionAttachmentsForDisplay(
  attachments: readonly CollectionAttachment[]
): CollectionAttachment[] {
  return attachments.slice().sort((a, b) => {
    const aActive = isActiveCollectionAttachment(a) ? 0 : 1;
    const bActive = isActiveCollectionAttachment(b) ? 0 : 1;
    if (aActive !== bActive) {
      return aActive - bActive;
    }
    if (a.updatedAtUtc !== b.updatedAtUtc) {
      return a.updatedAtUtc < b.updatedAtUtc ? 1 : -1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function formatAttachmentSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return "—";
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isValidDataUrl(value: string): boolean {
  if (!DATA_URL_RE.test(value)) {
    return false;
  }
  const comma = value.indexOf(",");
  if (comma < 0) {
    return false;
  }
  const payload = value.slice(comma + 1).trim();
  return payload.length > 0;
}

function estimateDecodedBytes(dataUrl: string): number | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) {
    return null;
  }
  const payload = dataUrl.slice(comma + 1).replace(/\s+/g, "");
  if (!payload) {
    return null;
  }
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

export function validateCollectionAttachmentInput(
  input: CollectionAttachmentInput,
  options?: { requireContent?: boolean; existing?: CollectionAttachment | null }
): CollectionAttachmentValidationResult {
  const requireContent = options?.requireContent !== false;
  const existing = options?.existing ?? null;

  const fileName = (input.fileName ?? existing?.fileName ?? "").trim();
  if (!fileName) {
    return { ok: false, error: i18n.t("attachment.error.fileNameRequired", { ns: "finance" }) };
  }
  if (fileName.length > FILE_NAME_MAX) {
    return {
      ok: false,
      error: i18n.t("attachment.error.fileNameTooLong", {
        ns: "finance",
        max: FILE_NAME_MAX
      })
    };
  }

  const contentType = (
    input.contentType ??
    existing?.contentType ??
    "application/octet-stream"
  ).trim();
  if (!contentType) {
    return { ok: false, error: i18n.t("attachment.error.contentTypeRequired", { ns: "finance" }) };
  }
  if (contentType.length > CONTENT_TYPE_MAX) {
    return {
      ok: false,
      error: i18n.t("attachment.error.contentTypeTooLong", {
        ns: "finance",
        max: CONTENT_TYPE_MAX
      })
    };
  }

  const description = (input.description ?? existing?.description ?? "").trim();
  if (description.length > DESCRIPTION_MAX) {
    return {
      ok: false,
      error: i18n.t("attachment.error.descriptionTooLong", {
        ns: "finance",
        max: DESCRIPTION_MAX
      })
    };
  }

  const uploadedBy = (input.uploadedBy ?? existing?.uploadedBy ?? "").trim();
  if (!uploadedBy) {
    return { ok: false, error: i18n.t("attachment.error.authorRequired", { ns: "finance" }) };
  }
  if (uploadedBy.length > AUTHOR_MAX) {
    return {
      ok: false,
      error: i18n.t("attachment.error.authorTooLong", { ns: "finance", max: AUTHOR_MAX })
    };
  }

  const categoryRaw = input.category ?? existing?.category ?? "";
  const category =
    categoryRaw === "" ? null : parseAttachmentCategory(String(categoryRaw));
  if (!category) {
    return { ok: false, error: i18n.t("attachment.error.categoryRequired", { ns: "finance" }) };
  }

  let contentDataUrl = (input.contentDataUrl ?? "").trim();
  let sizeBytes =
    typeof input.sizeBytes === "number" && Number.isFinite(input.sizeBytes)
      ? Math.floor(input.sizeBytes)
      : NaN;

  if (!contentDataUrl && existing && !requireContent) {
    contentDataUrl = existing.contentDataUrl;
    sizeBytes = existing.sizeBytes;
  }

  if (!contentDataUrl) {
    return { ok: false, error: i18n.t("attachment.error.fileRequired", { ns: "finance" }) };
  }
  if (!isValidDataUrl(contentDataUrl)) {
    return {
      ok: false,
      error: i18n.t("attachment.error.invalidContent", { ns: "finance" })
    };
  }

  const estimated = estimateDecodedBytes(contentDataUrl);
  if (estimated == null) {
    return { ok: false, error: i18n.t("attachment.error.sizeCheckFailed", { ns: "finance" }) };
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    sizeBytes = estimated;
  }
  if (sizeBytes === 0 && estimated === 0) {
    return { ok: false, error: i18n.t("attachment.error.emptyFile", { ns: "finance" }) };
  }
  if (sizeBytes > ATTACHMENT_MAX_BYTES || estimated > ATTACHMENT_MAX_BYTES) {
    return {
      ok: false,
      error: i18n.t("attachment.error.fileTooLarge", {
        ns: "finance",
        max: formatAttachmentSize(ATTACHMENT_MAX_BYTES)
      })
    };
  }

  return {
    ok: true,
    fileName,
    contentType,
    sizeBytes,
    category,
    description,
    uploadedBy,
    contentDataUrl
  };
}

export function createAttachmentId(invoiceId: string, now: Date): string {
  return `attachment|${invoiceId.trim().toLowerCase()}|${now.toISOString()}`;
}

export function createCollectionAttachmentEntity(
  invoiceId: string,
  validated: Extract<CollectionAttachmentValidationResult, { ok: true }>,
  now: Date = new Date()
): CollectionAttachment {
  const at = now.toISOString();
  return {
    id: createAttachmentId(invoiceId, now),
    fileName: validated.fileName,
    contentType: validated.contentType,
    sizeBytes: validated.sizeBytes,
    category: validated.category,
    description: validated.description,
    uploadedBy: validated.uploadedBy,
    contentDataUrl: validated.contentDataUrl,
    createdAtUtc: at,
    updatedAtUtc: at,
    archivedAtUtc: null
  };
}

export function sanitizeCollectionAttachment(
  raw: unknown
): CollectionAttachment | null {
  if (raw == null || typeof raw !== "object") {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  if (!id) {
    return null;
  }
  const fileName =
    typeof candidate.fileName === "string" ? candidate.fileName.trim() : "";
  if (!fileName || fileName.length > FILE_NAME_MAX) {
    return null;
  }
  const contentType =
    typeof candidate.contentType === "string"
      ? candidate.contentType.trim()
      : "";
  if (!contentType || contentType.length > CONTENT_TYPE_MAX) {
    return null;
  }
  const description =
    typeof candidate.description === "string"
      ? candidate.description.trim()
      : "";
  if (description.length > DESCRIPTION_MAX) {
    return null;
  }
  const uploadedBy =
    typeof candidate.uploadedBy === "string" ? candidate.uploadedBy.trim() : "";
  if (!uploadedBy || uploadedBy.length > AUTHOR_MAX) {
    return null;
  }
  const category = parseAttachmentCategory(
    typeof candidate.category === "string" ? candidate.category : null
  );
  if (!category) {
    return null;
  }
  const contentDataUrl =
    typeof candidate.contentDataUrl === "string"
      ? candidate.contentDataUrl.trim()
      : "";
  if (!isValidDataUrl(contentDataUrl)) {
    return null;
  }
  const estimated = estimateDecodedBytes(contentDataUrl);
  if (estimated == null || estimated > ATTACHMENT_MAX_BYTES) {
    return null;
  }
  const sizeRaw =
    typeof candidate.sizeBytes === "number"
      ? candidate.sizeBytes
      : Number(candidate.sizeBytes);
  const sizeBytes =
    Number.isFinite(sizeRaw) && sizeRaw >= 0 ? Math.floor(sizeRaw) : estimated;
  if (sizeBytes > ATTACHMENT_MAX_BYTES) {
    return null;
  }
  const createdAtUtc =
    typeof candidate.createdAtUtc === "string" && candidate.createdAtUtc.trim()
      ? candidate.createdAtUtc.trim()
      : new Date(0).toISOString();
  const updatedAtUtc =
    typeof candidate.updatedAtUtc === "string" && candidate.updatedAtUtc.trim()
      ? candidate.updatedAtUtc.trim()
      : createdAtUtc;
  const archivedRaw =
    typeof candidate.archivedAtUtc === "string"
      ? candidate.archivedAtUtc.trim()
      : "";
  return {
    id,
    fileName,
    contentType,
    sizeBytes,
    category,
    description,
    uploadedBy,
    contentDataUrl,
    createdAtUtc,
    updatedAtUtc,
    archivedAtUtc: archivedRaw || null
  };
}

export function sanitizeCollectionAttachments(
  raw: unknown
): CollectionAttachment[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const attachments: CollectionAttachment[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const attachment = sanitizeCollectionAttachment(item);
    if (!attachment || seen.has(attachment.id)) {
      continue;
    }
    seen.add(attachment.id);
    attachments.push(attachment);
  }
  return attachments;
}

export function summarizeAttachmentForHistory(
  attachment: CollectionAttachment
): string {
  const preview = attachment.description
    ? attachment.description.length > 80
      ? `${attachment.description.slice(0, 77)}…`
      : attachment.description
    : attachment.fileName;
  return `${attachmentCategoryLabel(attachment.category)} · ${attachment.fileName} · ${formatAttachmentSize(attachment.sizeBytes)} — ${preview}`;
}

/** Tiny valid PNG data URL for tests / empty-safe fixtures. */
export function minimalAttachmentDataUrl(): string {
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
}
