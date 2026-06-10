export type SubmissionStatus =
  | 'draft'
  | 'pending_admin'
  | 'pending_finance'
  | 'returned_to_vendor'
  | 'returned_to_admin'
  | 'approved'
  | 'paid'
  | 'rejected';

export type SubmissionAction =
  | 'submit'
  | 'approve'
  | 'return_to_vendor'
  | 'return_to_admin'
  | 'reject'
  | 'mark_paid';

export type DocumentStatus =
  | 'not_uploaded'
  | 'uploaded'
  | 'admin_approved'
  | 'admin_rejected'
  | 'finance_approved'
  | 'finance_rejected';

export type CommentVisibility = 'all' | 'vendor' | 'internal';

export type CommentAction =
  | 'commented'
  | 'approved'
  | 'rejected'
  | 'returned_to_vendor'
  | 'returned_to_admin'
  | 'forwarded'
  | 'disputed';

export type Currency = 'GBP' | 'USD' | 'EUR' | 'INR';

export type VendorType = 'individual' | 'company';
