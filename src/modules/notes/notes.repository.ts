import { query } from '../../db/pool';

export type NoteService = 'referral' | 'resume_review' | 'mock_interview';

const REQUEST_TABLE: Record<NoteService, string> = {
  referral: 'public.referral_requests',
  resume_review: 'public.resume_review_requests',
  mock_interview: 'public.mock_interview_requests',
};

export interface RequestNoteRow {
  id: number;
  service: NoteService;
  request_id: number;
  author_id: string;
  body: string;
  is_action_item: boolean;
  is_done: boolean;
  created_at: string;
  updated_at: string;
  author_name?: string | null;
  author_avatar?: string | null;
}

/** True when the user is the requester or referrer on the underlying request. */
export async function canAccessRequest(
  service: NoteService,
  requestId: number,
  userId: string,
): Promise<boolean> {
  const { rows } = await query<{ allowed: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM ${REQUEST_TABLE[service]}
        WHERE id = $1 AND (requester_id = $2 OR referrer_id = $2)
     ) AS allowed`,
    [requestId, userId],
  );
  return rows[0]?.allowed ?? false;
}

export async function listNotes(service: NoteService, requestId: number): Promise<RequestNoteRow[]> {
  const { rows } = await query<RequestNoteRow>(
    `SELECT n.*, p.full_name AS author_name, p.profile_picture AS author_avatar
       FROM public.request_notes n
       LEFT JOIN public.profiles p ON p.id = n.author_id
      WHERE n.service = $1 AND n.request_id = $2
      ORDER BY n.created_at ASC`,
    [service, requestId],
  );
  return rows;
}

export async function insertNote(
  service: NoteService,
  requestId: number,
  authorId: string,
  body: string,
  isActionItem: boolean,
): Promise<RequestNoteRow> {
  const { rows } = await query<RequestNoteRow>(
    `INSERT INTO public.request_notes (service, request_id, author_id, body, is_action_item)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [service, requestId, authorId, body, isActionItem],
  );
  if (!rows[0]) throw new Error('Failed to add note');
  return rows[0];
}

export async function getNote(noteId: number): Promise<RequestNoteRow | null> {
  const { rows } = await query<RequestNoteRow>(
    `SELECT * FROM public.request_notes WHERE id = $1 LIMIT 1`,
    [noteId],
  );
  return rows[0] ?? null;
}

export async function toggleActionItem(noteId: number, isDone: boolean): Promise<RequestNoteRow | null> {
  const { rows } = await query<RequestNoteRow>(
    `UPDATE public.request_notes SET is_done = $2 WHERE id = $1 RETURNING *`,
    [noteId, isDone],
  );
  return rows[0] ?? null;
}

export async function deleteNote(noteId: number): Promise<void> {
  await query(`DELETE FROM public.request_notes WHERE id = $1`, [noteId]);
}
