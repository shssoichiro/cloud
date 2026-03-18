/**
 * Dispatch Pending Reviews
 *
 * Core dispatch logic for code reviews. Checks available slots and dispatches
 * pending reviews to Cloudflare Worker.
 *
 * Triggered by:
 * 1. Webhook handler after creating new pending review
 * 2. Review completion (status update API) to dispatch next in queue
 */

import { db } from '@/lib/drizzle';
import { cloud_agent_code_reviews, type CloudAgentCodeReview } from '@kilocode/db/schema';
import { eq, and, or, count } from 'drizzle-orm';
import type { Owner } from '../core';
import { prepareReviewPayload } from '../triggers/prepare-review-payload';
import { getAgentConfigForOwner } from '@/lib/agent-config/db/agent-configs';
import { updateCodeReviewStatus } from '../db/code-reviews';
import { captureException } from '@sentry/nextjs';
import { errorExceptInTest, logExceptInTest } from '@/lib/utils.server';
import { isFeatureFlagEnabled } from '@/lib/posthog-feature-flags';
import { codeReviewWorkerClient } from '../client/code-review-worker-client';
import type { CodeReviewPlatform } from '../core/schemas';

const MAX_CONCURRENT_REVIEWS_PER_OWNER = 20;

export interface DispatchResult {
  dispatched: number;
  pending: number;
  activeCount: number;
}

/**
 * Try to dispatch pending reviews for an owner
 * Checks available slots and dispatches up to available capacity
 */
export async function tryDispatchPendingReviews(owner: Owner): Promise<DispatchResult> {
  try {
    logExceptInTest(`[tryDispatchPendingReviews] Starting dispatch check`, { owner });

    // 1. Get active review count for this owner
    const activeCountResult = await db
      .select({ count: count() })
      .from(cloud_agent_code_reviews)
      .where(
        and(
          owner.type === 'org'
            ? eq(cloud_agent_code_reviews.owned_by_organization_id, owner.id)
            : eq(cloud_agent_code_reviews.owned_by_user_id, owner.id),
          or(
            eq(cloud_agent_code_reviews.status, 'queued'),
            eq(cloud_agent_code_reviews.status, 'running')
          )
        )
      );

    const activeCount = activeCountResult[0]?.count || 0;
    const availableSlots = MAX_CONCURRENT_REVIEWS_PER_OWNER - activeCount;

    logExceptInTest('[tryDispatchPendingReviews] Active count check', {
      owner,
      activeCount,
      availableSlots,
    });

    // 2. If no slots available, return early
    if (availableSlots <= 0) {
      logExceptInTest('[tryDispatchPendingReviews] No slots available', { owner, activeCount });
      return { dispatched: 0, pending: 0, activeCount };
    }

    // 3. Get pending reviews for this owner (FIFO)
    const pendingReviews = await db
      .select()
      .from(cloud_agent_code_reviews)
      .where(
        and(
          owner.type === 'org'
            ? eq(cloud_agent_code_reviews.owned_by_organization_id, owner.id)
            : eq(cloud_agent_code_reviews.owned_by_user_id, owner.id),
          eq(cloud_agent_code_reviews.status, 'pending')
        )
      )
      .orderBy(cloud_agent_code_reviews.created_at)
      .limit(availableSlots);

    logExceptInTest('[tryDispatchPendingReviews] Found pending reviews', {
      owner,
      pendingCount: pendingReviews.length,
      availableSlots,
    });

    // 4. If no pending reviews, return early
    if (pendingReviews.length === 0) {
      return { dispatched: 0, pending: 0, activeCount };
    }

    // 5. Dispatch all pending reviews in parallel
    const results = await Promise.allSettled(
      pendingReviews.map(review => dispatchReview(review, owner))
    );

    let dispatched = 0;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        if (result.value) {
          dispatched++;
        }
      } else {
        const review = pendingReviews[i];
        const error = result.reason;
        errorExceptInTest('[tryDispatchPendingReviews] Failed to dispatch review', {
          reviewId: review.id,
          error,
        });
        captureException(error, {
          tags: { operation: 'dispatch-pending-review' },
          extra: { reviewId: review.id, owner },
        });

        // Mark as failed so it doesn't block the queue
        try {
          await updateCodeReviewStatus(review.id, 'failed', {
            errorMessage: `Dispatch failed: ${error instanceof Error ? error.message : String(error)}`,
          });
        } catch (updateError) {
          errorExceptInTest('[tryDispatchPendingReviews] Failed to mark review as failed', {
            reviewId: review.id,
            updateError,
          });
        }
      }
    }

    logExceptInTest('[tryDispatchPendingReviews] Dispatch complete', {
      owner,
      dispatched,
      total: pendingReviews.length,
    });

    return {
      dispatched,
      pending: pendingReviews.length - dispatched,
      activeCount: activeCount + dispatched,
    };
  } catch (error) {
    errorExceptInTest('[tryDispatchPendingReviews] Error during dispatch', { owner, error });
    captureException(error, {
      tags: { operation: 'try-dispatch-pending-reviews' },
      extra: { owner },
    });
    return { dispatched: 0, pending: 0, activeCount: 0 };
  }
}

/**
 * Dispatch a single review to Cloudflare Worker.
 * Returns true if the review was dispatched, false if it was already claimed
 * by another concurrent dispatcher.
 */
async function dispatchReview(review: CloudAgentCodeReview, owner: Owner): Promise<boolean> {
  // Get platform from review (defaults to 'github' for backward compatibility)
  const platform = (review.platform || 'github') as CodeReviewPlatform;

  // 1. Atomically claim the review (pending → queued) to prevent concurrent
  //    dispatchers from picking the same review. The conditional WHERE ensures
  //    only one dispatcher wins the claim.
  const claimed = await db
    .update(cloud_agent_code_reviews)
    .set({ status: 'queued' })
    .where(
      and(
        eq(cloud_agent_code_reviews.id, review.id),
        eq(cloud_agent_code_reviews.status, 'pending')
      )
    )
    .returning({ id: cloud_agent_code_reviews.id });

  if (claimed.length === 0) {
    logExceptInTest('[dispatchReview] Review already claimed by another dispatcher', {
      reviewId: review.id,
    });
    return false;
  }

  logExceptInTest('[dispatchReview] Dispatching review', {
    reviewId: review.id,
    owner,
    platform,
  });

  // 2. Get agent config for owner (use platform from review)
  const agentConfig = await getAgentConfigForOwner(owner, 'code_review', platform);

  if (!agentConfig) {
    throw new Error(
      `Agent config not found for owner ${owner.type}:${owner.id} on platform ${platform}`
    );
  }

  // 3. Evaluate feature flag: use cloud-agent-next?
  const useCloudAgentNext =
    process.env.NODE_ENV === 'development' ||
    (await isFeatureFlagEnabled('code-review-cloud-agent-next', owner.userId));

  logExceptInTest('[dispatchReview] Feature flag evaluated', {
    reviewId: review.id,
    userId: owner.userId,
    useCloudAgentNext,
  });

  // 4. Prepare complete payload for cloud agent
  const payload = await prepareReviewPayload({
    reviewId: review.id,
    owner,
    agentConfig,
    platform,
  });

  // 5. Dispatch to Cloudflare Worker to create CodeReviewOrchestrator DO
  const agentVersion = useCloudAgentNext ? 'v2' : 'v1';
  await codeReviewWorkerClient.dispatchReview({
    ...payload,
    skipBalanceCheck: true,
    agentVersion,
  });

  // 6. Record which agent version was dispatched
  await updateCodeReviewStatus(review.id, 'queued', { agentVersion });

  logExceptInTest('[dispatchReview] Review dispatched successfully', {
    reviewId: review.id,
    platform,
  });

  return true;
}
