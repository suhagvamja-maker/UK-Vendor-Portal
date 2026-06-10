import { db } from '@/lib/db/sqlite';
import type { AppRole } from '@/types/roles';
import type { CommentAction, CommentVisibility } from '@/types/submission';

export interface Comment {
  id: string;
  submissionId: string;
  /** submission_documents.id when commenting on an invoice/HOD/etc. */
  documentId: string | null;
  /** vendor_documents.id when commenting on a profile compliance doc. */
  profileDocumentId: string | null;
  authorId: string;
  authorName: string | null;
  authorRole: AppRole;
  body: string;
  actionTaken: CommentAction | null;
  visibility: CommentVisibility;
  parentCommentId: string | null;
  resolvedAt: string | null;
  /** Set only for action_taken='disputed' comments — vendor acknowledged the resolution. */
  resolvedByVendorAt: string | null;
  /** Set only for action_taken='disputed' comments — finance/admin acknowledged the resolution. */
  resolvedByFinanceAt: string | null;
  createdAt: string;
}

interface CommentRow {
  id: string;
  submission_id: string;
  document_id: string | null;
  profile_document_id: string | null;
  author_id: string;
  author_name: string | null;
  author_role: AppRole;
  body: string;
  action_taken: CommentAction | null;
  visibility: CommentVisibility;
  parent_comment_id: string | null;
  resolved_at: string | null;
  resolved_by_vendor_at: string | null;
  resolved_by_finance_at: string | null;
  created_at: string;
}

const toComment = (r: CommentRow): Comment => ({
  id: r.id,
  submissionId: r.submission_id,
  documentId: r.document_id,
  profileDocumentId: r.profile_document_id,
  authorId: r.author_id,
  authorName: r.author_name,
  authorRole: r.author_role,
  body: r.body,
  actionTaken: r.action_taken,
  visibility: r.visibility,
  parentCommentId: r.parent_comment_id,
  resolvedAt: r.resolved_at,
  resolvedByVendorAt: r.resolved_by_vendor_at,
  resolvedByFinanceAt: r.resolved_by_finance_at,
  createdAt: r.created_at,
});

const COMMENT_SELECT = `
  c.id, c.submission_id, c.document_id, c.profile_document_id,
  c.author_id, u.name as author_name, u.role as author_role,
  c.body, c.action_taken, c.visibility, c.parent_comment_id,
  c.resolved_at, c.resolved_by_vendor_at, c.resolved_by_finance_at, c.created_at
`;

export interface AddCommentInput {
  submissionId: string;
  /** Either documentId (submission doc) OR profileDocumentId (profile doc), never both. */
  documentId?: string | null;
  profileDocumentId?: string | null;
  authorId: string;
  body: string;
  actionTaken?: CommentAction;
  visibility: CommentVisibility;
  parentCommentId?: string | null;
}

export function addComment(input: AddCommentInput): Comment {
  const id = crypto.randomUUID();
  db()
    .prepare(`
      insert into comments
        (id, submission_id, document_id, profile_document_id, author_id, body, action_taken, visibility, parent_comment_id)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      id,
      input.submissionId,
      input.documentId ?? null,
      input.profileDocumentId ?? null,
      input.authorId,
      input.body,
      input.actionTaken ?? 'commented',
      input.visibility,
      input.parentCommentId ?? null,
    );
  return getCommentById(id)!;
}

/**
 * Mark a *non-dispute* comment as resolved. Idempotent.
 * Comments themselves remain immutable per CLAUDE.md §8 rule 1.
 * For dispute comments, use the two-party flow in `acknowledgeDisputeResolve`.
 */
export function resolveComment(id: string): boolean {
  const result = db()
    .prepare('update comments set resolved_at = coalesce(resolved_at, ?) where id = ?')
    .run(new Date().toISOString(), id);
  return result.changes > 0;
}

/**
 * Two-party dispute acknowledgement. The dispute is only considered fully
 * resolved (i.e. `resolved_at` set) when BOTH the vendor and finance have
 * acknowledged. Admin can stand in for finance.
 *
 * Returns the updated comment so callers can decide whether to fan out the
 * "dispute resolved" notification.
 */
export type AcknowledgeParty = 'vendor' | 'finance';

export interface AcknowledgeResult {
  comment: Comment;
  /** True iff this call is the one that transitioned the dispute to fully resolved. */
  fullyResolved: boolean;
}

export function acknowledgeDisputeResolve(id: string, party: AcknowledgeParty): AcknowledgeResult | null {
  const conn = db();
  const before = getCommentById(id);
  if (!before) return null;
  const now = new Date().toISOString();
  const column = party === 'vendor' ? 'resolved_by_vendor_at' : 'resolved_by_finance_at';
  conn
    .prepare(`update comments set ${column} = coalesce(${column}, ?) where id = ?`)
    .run(now, id);
  // If both sides have now acknowledged, set resolved_at.
  conn
    .prepare(`
      update comments
      set resolved_at = coalesce(resolved_at, ?)
      where id = ?
        and resolved_by_vendor_at is not null
        and resolved_by_finance_at is not null
    `)
    .run(now, id);
  const after = getCommentById(id);
  if (!after) return null;
  return {
    comment: after,
    fullyResolved: !before.resolvedAt && !!after.resolvedAt,
  };
}

export function findCommentById(id: string): Comment | null {
  return getCommentById(id);
}

function getCommentById(id: string): Comment | null {
  const r = db()
    .prepare(`
      select ${COMMENT_SELECT}
      from comments c
      join users u on u.id = c.author_id
      where c.id = ?
    `)
    .get(id) as CommentRow | undefined;
  return r ? toComment(r) : null;
}

/**
 * Is there an unresolved dispute on this submission raised by this specific vendor user?
 * Used to prevent duplicate disputes from the same vendor in quick succession.
 */
export function hasUnresolvedDisputeFromUser(submissionId: string, authorId: string): boolean {
  const r = db()
    .prepare(`
      select 1 as x from comments
      where submission_id = ?
        and author_id = ?
        and action_taken = 'disputed'
        and resolved_at is null
      limit 1
    `)
    .get(submissionId, authorId) as { x: number } | undefined;
  return !!r;
}

/**
 * List comments visible to the given role on a submission (CLAUDE.md §8).
 *   - vendor sees: visibility in ('all','vendor')
 *   - admin/finance see: everything
 */
export function listCommentsForSubmission(submissionId: string, viewerRole: AppRole): Comment[] {
  const conn = db();
  const rows = viewerRole === 'vendor'
    ? conn
        .prepare(`
          select ${COMMENT_SELECT}
          from comments c
          join users u on u.id = c.author_id
          where c.submission_id = ? and c.visibility in ('all','vendor')
          order by c.created_at asc
        `)
        .all(submissionId) as CommentRow[]
    : conn
        .prepare(`
          select ${COMMENT_SELECT}
          from comments c
          join users u on u.id = c.author_id
          where c.submission_id = ?
          order by c.created_at asc
        `)
        .all(submissionId) as CommentRow[];
  return rows.map(toComment);
}
