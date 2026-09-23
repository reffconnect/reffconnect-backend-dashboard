/**
 * Referral-card screening. Produces an evidence packet for a drop card: uses
 * OpenAI when configured, otherwise a deterministic neutral packet so the flow
 * still works. Never auto-rejects a candidate — a pass is a human decision.
 */
import { config } from '../../config/env';
import { logger } from '../../utils/logger';
import { chatJson, isEnabled as aiEnabled } from '../../integrations/openai';
import * as repo from './drops.repository';

const PACKET_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface Packet {
  recommendation: string;
  confidence: string;
  summary: string;
  why_refer: string[];
  what_to_verify: string[];
  suggested_question: string;
  checks: Array<{ check_type: string; title: string; status: string; summary: string }>;
}

const SYSTEM_PROMPT = `You screen a candidate's referral card for a specific role. You surface findings only;
you never auto-reject. Respond ONLY with JSON: { recommendation: "refer"|"review"|"hold",
confidence: "high"|"medium"|"low", summary: string, why_refer: string[], what_to_verify: string[],
suggested_question: string, checks: [{ check_type: string, title: string, status: "pass"|"warn"|"info",
summary: string }] }.`;

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

async function buildAiPacket(card: repo.DropCardRow): Promise<Packet> {
  const userPrompt = [
    `Company: ${card.company_name}`,
    `Target role/req: ${card.target_job_req_id ?? card.target_job_url ?? 'n/a'}`,
    `Candidate pitch: ${card.pitch_text ?? 'n/a'}`,
    `Job description: ${(card['job_description_text'] as string | null) ?? 'n/a'}`,
  ].join('\n');
  const raw = await chatJson<Partial<Packet>>(SYSTEM_PROMPT, userPrompt, 900);
  return {
    recommendation: typeof raw.recommendation === 'string' ? raw.recommendation : 'review',
    confidence: typeof raw.confidence === 'string' ? raw.confidence : 'low',
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    why_refer: toStringArray(raw.why_refer),
    what_to_verify: toStringArray(raw.what_to_verify),
    suggested_question: typeof raw.suggested_question === 'string' ? raw.suggested_question : '',
    checks: Array.isArray(raw.checks)
      ? raw.checks
          .filter((c): c is Packet['checks'][number] => Boolean(c) && typeof c === 'object')
          .map((c) => ({
            check_type: String(c.check_type ?? 'general'),
            title: String(c.title ?? 'Finding'),
            status: String(c.status ?? 'info'),
            summary: String(c.summary ?? ''),
          }))
      : [],
  };
}

function buildDeterministicPacket(card: repo.DropCardRow): Packet {
  return {
    recommendation: 'review',
    confidence: 'low',
    summary: `Candidate applied to ${card.company_name}. AI screening is disabled on this server, so this is an unenriched packet for manual review.`,
    why_refer: card.pitch_text ? [card.pitch_text.slice(0, 240)] : [],
    what_to_verify: ['Confirm the candidate meets the core requirements for the target role.'],
    suggested_question: 'Walk me through your most relevant project for this role.',
    checks: [
      {
        check_type: 'submission',
        title: 'Card submitted',
        status: 'info',
        summary: 'Candidate provided their pitch and links. Review manually — no AI enrichment was run.',
      },
    ],
  };
}

/** Run screening for a card: create a run, build the packet, assign a referrer. */
export async function screenCard(
  cardId: string,
): Promise<{ status: 'completed' | 'failed'; ready_for_professional: boolean; assigned: boolean }> {
  const card = await repo.getCardById(cardId);
  if (!card) return { status: 'failed', ready_for_professional: false, assigned: false };

  const mode = aiEnabled() ? 'ai' : 'deterministic';
  const runId = await repo.insertRun(cardId, mode);
  try {
    const packet = aiEnabled() ? await buildAiPacket(card) : buildDeterministicPacket(card);
    for (let i = 0; i < packet.checks.length; i += 1) {
      const check = packet.checks[i];
      if (check) await repo.insertCheck(runId, { ...check, sort_order: i });
    }
    await repo.completeRun(runId, {
      recommendation: packet.recommendation,
      confidence: packet.confidence,
      summary: packet.summary,
      why_refer: packet.why_refer,
      what_to_verify: packet.what_to_verify,
      suggested_question: packet.suggested_question,
      model_version: mode === 'ai' ? config.OPENAI_MODEL : 'deterministic-v1',
      prompt_version: 'drop-screen-v1',
      expiresAt: new Date(Date.now() + PACKET_TTL_MS),
    });

    const referrerId = await repo.findReferrerForCompany(card.company_name);
    await repo.updateCard(cardId, {
      screening_status: 'completed',
      status: 'in_review',
      assigned_referrer_id: referrerId,
    });
    return { status: 'completed', ready_for_professional: true, assigned: Boolean(referrerId) };
  } catch (err) {
    logger.error('drop screening failed', err instanceof Error ? err.message : err);
    await repo.failRun(runId).catch(() => undefined);
    await repo.updateCard(cardId, { screening_status: 'failed' }).catch(() => undefined);
    return { status: 'failed', ready_for_professional: false, assigned: false };
  }
}
