/**
 * Collection internal notes / collaboration (browser-local).
 * Stored on PromiseToPayRecord.notes — same localStorage key.
 * Append-oriented thread for collectors; not customer-facing contact notes.
 */

export type CollectionNoteCategory =
  | "general"
  | "handoff"
  | "risk"
  | "customer_context"
  | "follow_up"
  | "other";

export type CollectionNoteVisibility = "internal";

export type CollectionNote = {
  id: string;
  body: string;
  author: string;
  category: CollectionNoteCategory;
  visibility: CollectionNoteVisibility;
  pinned: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
  archivedAtUtc: string | null;
};

export type CollectionNoteInput = {
  body?: string;
  author?: string;
  category?: CollectionNoteCategory | "";
  pinned?: boolean;
};

export type CollectionNoteUpdateInput = CollectionNoteInput & {
  noteId: string;
};

export type CollectionNoteValidationResult =
  | {
      ok: true;
      body: string;
      author: string;
      category: CollectionNoteCategory;
      pinned: boolean;
    }
  | { ok: false; error: string };

export const NOTE_CATEGORY_OPTIONS: readonly {
  id: CollectionNoteCategory;
  label: string;
}[] = [
  { id: "general", label: "General" },
  { id: "handoff", label: "Handoff" },
  { id: "risk", label: "Risk" },
  { id: "customer_context", label: "Customer context" },
  { id: "follow_up", label: "Follow-up" },
  { id: "other", label: "Other" }
];

const CATEGORY_SET: ReadonlySet<string> = new Set(
  NOTE_CATEGORY_OPTIONS.map((option) => option.id)
);

const BODY_MAX = 4000;
const AUTHOR_MAX = 120;

export function parseNoteCategory(
  value: string | null | undefined
): CollectionNoteCategory | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return CATEGORY_SET.has(trimmed) ? (trimmed as CollectionNoteCategory) : null;
}

export function noteCategoryLabel(category: CollectionNoteCategory): string {
  return (
    NOTE_CATEGORY_OPTIONS.find((option) => option.id === category)?.label ?? category
  );
}

export function isActiveCollectionNote(
  note: CollectionNote | null | undefined
): boolean {
  return Boolean(note && !note.archivedAtUtc);
}

export function listActiveCollectionNotes(
  notes: readonly CollectionNote[] | null | undefined
): CollectionNote[] {
  if (!notes?.length) {
    return [];
  }
  return notes.filter((note) => isActiveCollectionNote(note));
}

export function listPinnedCollectionNotes(
  notes: readonly CollectionNote[] | null | undefined
): CollectionNote[] {
  return listActiveCollectionNotes(notes).filter((note) => note.pinned);
}

export function hasOpenHandoffNotes(
  notes: readonly CollectionNote[] | null | undefined
): boolean {
  return listActiveCollectionNotes(notes).some((note) => note.category === "handoff");
}

export function countActiveCollectionNotes(
  notes: readonly CollectionNote[] | null | undefined
): number {
  return listActiveCollectionNotes(notes).length;
}

/** Pinned first, then newest updated. */
export function sortCollectionNotesForDisplay(
  notes: readonly CollectionNote[]
): CollectionNote[] {
  return notes.slice().sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    if (a.updatedAtUtc !== b.updatedAtUtc) {
      return a.updatedAtUtc < b.updatedAtUtc ? 1 : -1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function validateCollectionNoteInput(
  input: CollectionNoteInput
): CollectionNoteValidationResult {
  const body = (input.body ?? "").trim();
  if (!body) {
    return { ok: false, error: "Текст нотатки обовʼязковий." };
  }
  if (body.length > BODY_MAX) {
    return {
      ok: false,
      error: `Текст нотатки занадто довгий (макс. ${BODY_MAX} символів).`
    };
  }

  const author = (input.author ?? "").trim();
  if (!author) {
    return { ok: false, error: "Автор нотатки обовʼязковий." };
  }
  if (author.length > AUTHOR_MAX) {
    return {
      ok: false,
      error: `Імʼя автора занадто довге (макс. ${AUTHOR_MAX} символів).`
    };
  }

  const categoryRaw = input.category ?? "general";
  const category =
    categoryRaw === "" ? null : parseNoteCategory(String(categoryRaw));
  if (!category) {
    return { ok: false, error: "Оберіть категорію нотатки." };
  }

  return {
    ok: true,
    body,
    author,
    category,
    pinned: input.pinned === true
  };
}

export function createNoteId(invoiceId: string, now: Date): string {
  return `note|${invoiceId.trim().toLowerCase()}|${now.toISOString()}`;
}

export function createCollectionNoteEntity(
  invoiceId: string,
  validated: Extract<CollectionNoteValidationResult, { ok: true }>,
  now: Date = new Date()
): CollectionNote {
  const at = now.toISOString();
  return {
    id: createNoteId(invoiceId, now),
    body: validated.body,
    author: validated.author,
    category: validated.category,
    visibility: "internal",
    pinned: validated.pinned,
    createdAtUtc: at,
    updatedAtUtc: at,
    archivedAtUtc: null
  };
}

export function sanitizeCollectionNote(raw: unknown): CollectionNote | null {
  if (raw == null || typeof raw !== "object") {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  if (!id) {
    return null;
  }
  const body = typeof candidate.body === "string" ? candidate.body.trim() : "";
  if (!body || body.length > BODY_MAX) {
    return null;
  }
  const author = typeof candidate.author === "string" ? candidate.author.trim() : "";
  if (!author || author.length > AUTHOR_MAX) {
    return null;
  }
  const category = parseNoteCategory(
    typeof candidate.category === "string" ? candidate.category : null
  );
  if (!category) {
    return null;
  }
  const visibilityRaw =
    typeof candidate.visibility === "string" ? candidate.visibility.trim() : "internal";
  if (visibilityRaw !== "internal") {
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
    typeof candidate.archivedAtUtc === "string" ? candidate.archivedAtUtc.trim() : "";
  const archivedAtUtc = archivedRaw || null;
  return {
    id,
    body,
    author,
    category,
    visibility: "internal",
    pinned: candidate.pinned === true,
    createdAtUtc,
    updatedAtUtc,
    archivedAtUtc
  };
}

export function sanitizeCollectionNotes(raw: unknown): CollectionNote[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const notes: CollectionNote[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const note = sanitizeCollectionNote(item);
    if (!note || seen.has(note.id)) {
      continue;
    }
    seen.add(note.id);
    notes.push(note);
  }
  return notes;
}

export function summarizeNoteForHistory(note: CollectionNote): string {
  const preview =
    note.body.length > 120 ? `${note.body.slice(0, 117)}…` : note.body;
  return `${noteCategoryLabel(note.category)} · ${note.author}${
    note.pinned ? " · pinned" : ""
  } — ${preview}`;
}
