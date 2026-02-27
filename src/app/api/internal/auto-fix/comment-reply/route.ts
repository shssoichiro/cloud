/**
 * Internal API Endpoint: Notify PR Review Comment Result (Auto Fix)
 *
 * Called by:
 * - Auto Fix Orchestrator (after a review-comment-triggered fix finishes)
 *
 * Process:
 * 1. Receive ticket ID/session ID and outcome
 * 2. Fetch ticket from DB to get review comment context
 * 3. For success: add +1 reaction on the original review comment
 * 4. For failure: post a reply on the review thread with the failure reason
 * 5. Update ticket status
 *
 * URL: POST /api/internal/auto-fix/comment-reply
 * Protected by internal API secret
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getFixTicketById, updateFixTicketStatus } from '@/lib/auto-fix/db/fix-tickets';
import { logExceptInTest, errorExceptInTest } from '@/lib/utils.server';
import { captureException } from '@sentry/nextjs';
import { INTERNAL_API_SECRET } from '@/lib/config.server';
import {
  replyToReviewComment,
  addReactionToPRReviewComment,
} from '@/lib/integrations/platforms/github/adapter';
import { getIntegrationById } from '@/lib/integrations/db/platform-integrations';

type CommentReplyPayload = {
  ticketId: string;
  sessionId?: string;
  outcome?: 'success' | 'failed';
  errorMessage?: string;
};

type FriendlyFailure = {
  summary: string;
  suggestedAction: string;
};

function getFriendlyFailure(rawError: string): FriendlyFailure {
  const normalized = rawError.toLowerCase();

  if (normalized.includes('failed to verify balance') || normalized.includes('balance')) {
    return {
      summary: 'I could not start this fix because the account balance check failed.',
      suggestedAction: 'Confirm your Kilo account has available credits, then retry the fix.',
    };
  }

  if (normalized.includes('permission to') && normalized.includes('denied')) {
    return {
      summary: 'I prepared a fix but could not push it to GitHub due to repository permissions.',
      suggestedAction:
        'Grant the Kilo GitHub App write access to repository contents, then retry the fix.',
    };
  }

  if (normalized.includes('timeout')) {
    return {
      summary: 'The auto-fix run timed out before it could finish.',
      suggestedAction:
        'Retry the fix. If it keeps timing out, request a smaller change scope in your comment.',
    };
  }

  if (
    normalized.includes('cloud agent returned 500') ||
    normalized.includes('internal_server_error')
  ) {
    return {
      summary: 'The auto-fix service encountered an internal error while preparing this change.',
      suggestedAction: 'Retry in a minute. If it keeps failing, share the session ID below.',
    };
  }

  return {
    summary: 'The auto-fix run failed before it could push an updated commit.',
    suggestedAction: 'Retry with more guidance, or apply the fix manually.',
  };
}

export async function POST(req: NextRequest) {
  try {
    // Validate internal API secret
    const secret = req.headers.get('X-Internal-Secret');
    if (secret !== INTERNAL_API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload: CommentReplyPayload = await req.json();
    const { ticketId, sessionId } = payload;
    const outcome = payload.outcome ?? 'success';

    if (!ticketId) {
      return NextResponse.json({ error: 'Missing required field: ticketId' }, { status: 400 });
    }

    logExceptInTest('[auto-fix-comment-reply] Processing comment reply', {
      ticketId,
      sessionId,
      outcome,
      hasError: !!payload.errorMessage,
    });

    // Get ticket
    const ticket = await getFixTicketById(ticketId);

    if (!ticket) {
      logExceptInTest('[auto-fix-comment-reply] Ticket not found', { ticketId });
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    if (ticket.trigger_source !== 'review_comment' || !ticket.review_comment_id) {
      logExceptInTest('[auto-fix-comment-reply] Not a review comment ticket', {
        ticketId,
        triggerSource: ticket.trigger_source,
      });
      return NextResponse.json(
        { error: 'Ticket is not a review comment trigger' },
        { status: 400 }
      );
    }

    // Get GitHub token
    let installationId: string | undefined;
    if (ticket.platform_integration_id) {
      try {
        const integration = await getIntegrationById(ticket.platform_integration_id);
        installationId = integration?.platform_installation_id ?? undefined;
      } catch (error) {
        errorExceptInTest('[auto-fix-comment-reply] Failed to get integration:', error);
      }
    }

    if (!installationId) {
      errorExceptInTest('[auto-fix-comment-reply] No installation ID found', { ticketId });
      return NextResponse.json({ error: 'GitHub installation not found' }, { status: 500 });
    }

    const [repoOwner, repoName] = ticket.repo_full_name.split('/');

    if (!repoOwner || !repoName) {
      return NextResponse.json(
        { error: `Invalid repo_full_name: ${ticket.repo_full_name}` },
        { status: 400 }
      );
    }

    try {
      if (outcome === 'success') {
        // Success path: acknowledge original review comment with +1
        try {
          await addReactionToPRReviewComment(
            installationId,
            repoOwner,
            repoName,
            ticket.review_comment_id,
            '+1'
          );

          logExceptInTest('[auto-fix-comment-reply] Added +1 reaction on review comment', {
            ticketId,
            prNumber: ticket.issue_number,
            commentId: ticket.review_comment_id,
          });
        } catch (reactionError) {
          errorExceptInTest(
            '[auto-fix-comment-reply] Failed to add +1 reaction (non-fatal):',
            reactionError
          );
        }

        // Update ticket status
        await updateFixTicketStatus(ticketId, 'completed', {
          sessionId,
          prBranch: ticket.pr_head_ref || undefined,
          completedAt: new Date(),
        });

        return NextResponse.json({ success: true, action: 'reaction' });
      }

      // Failure path: reply on review thread with failure details
      const failureReason = payload.errorMessage?.trim() || 'Unknown error';
      const friendlyFailure = getFriendlyFailure(failureReason);
      const traceLine = sessionId ? `- Session ID: \`${sessionId}\`` : '- Session ID: unavailable';
      const replyBody = [
        "I couldn't apply this fix automatically this time.",
        '',
        friendlyFailure.summary,
        '',
        'Next steps:',
        `- ${friendlyFailure.suggestedAction}`,
        traceLine,
        '',
        '<details>',
        '<summary>Technical details</summary>',
        '',
        '```',
        failureReason,
        '```',
        '</details>',
      ].join('\n');

      await replyToReviewComment(
        installationId,
        repoOwner,
        repoName,
        ticket.issue_number,
        ticket.review_comment_id,
        replyBody
      );

      logExceptInTest('[auto-fix-comment-reply] Posted failure reply on review thread', {
        ticketId,
        prNumber: ticket.issue_number,
        commentId: ticket.review_comment_id,
      });

      // Add confused reaction on failure (best effort)
      try {
        await addReactionToPRReviewComment(
          installationId,
          repoOwner,
          repoName,
          ticket.review_comment_id,
          'confused'
        );
      } catch {
        // Best-effort reaction
      }

      // Update ticket status
      await updateFixTicketStatus(ticketId, 'failed', {
        sessionId,
        errorMessage: failureReason,
        completedAt: new Date(),
      });

      return NextResponse.json({ success: true, action: 'reply' });
    } catch (replyError) {
      errorExceptInTest('[auto-fix-comment-reply] Failed to notify review comment:', replyError);
      captureException(replyError, {
        tags: { operation: 'auto-fix-comment-reply', step: 'reply-to-comment' },
        extra: { ticketId, sessionId, outcome },
      });

      // Try to add failure reaction
      try {
        await addReactionToPRReviewComment(
          installationId,
          repoOwner,
          repoName,
          ticket.review_comment_id,
          'confused'
        );
      } catch {
        // Best-effort reaction
      }

      // Update ticket to failed
      await updateFixTicketStatus(ticketId, 'failed', {
        sessionId,
        errorMessage: `Failed to notify review comment: ${replyError instanceof Error ? replyError.message : String(replyError)}`,
        completedAt: new Date(),
      });

      return NextResponse.json(
        {
          error: 'Failed to notify review comment',
          message: replyError instanceof Error ? replyError.message : String(replyError),
        },
        { status: 500 }
      );
    }
  } catch (error) {
    errorExceptInTest('[auto-fix-comment-reply] Error processing request:', error);
    captureException(error, {
      tags: { source: 'auto-fix-comment-reply-api' },
    });

    return NextResponse.json(
      {
        error: 'Failed to process request',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
