import { AppError } from '../../utils/AppError';
import * as repo from './notes.repository';

export async function listNotes(
  service: repo.NoteService,
  requestId: number,
  userId: string,
): Promise<repo.RequestNoteRow[]> {
  if (!(await repo.canAccessRequest(service, requestId, userId))) {
    throw AppError.forbidden('You do not have access to this thread');
  }
  return repo.listNotes(service, requestId);
}

export async function addNote(
  service: repo.NoteService,
  requestId: number,
  userId: string,
  body: string,
  isActionItem: boolean,
): Promise<repo.RequestNoteRow> {
  if (!(await repo.canAccessRequest(service, requestId, userId))) {
    throw AppError.forbidden('You do not have access to this thread');
  }
  return repo.insertNote(service, requestId, userId, body, isActionItem);
}

export async function toggleActionItem(
  noteId: number,
  userId: string,
  isDone: boolean,
): Promise<repo.RequestNoteRow> {
  const note = await repo.getNote(noteId);
  if (!note) throw AppError.notFound('Note not found');
  // Either party on the request may tick an action item.
  if (!(await repo.canAccessRequest(note.service, note.request_id, userId))) {
    throw AppError.forbidden('You do not have access to this note');
  }
  const updated = await repo.toggleActionItem(noteId, isDone);
  if (!updated) throw AppError.notFound('Note not found');
  return updated;
}

export async function deleteNote(noteId: number, userId: string): Promise<void> {
  const note = await repo.getNote(noteId);
  if (!note) throw AppError.notFound('Note not found');
  if (note.author_id !== userId) throw AppError.forbidden('Only the author can delete this note');
  await repo.deleteNote(noteId);
}
