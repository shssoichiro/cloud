/**
 * AutoFixOrchestrator Durable Object
 *
 * Manages the lifecycle of a single auto-fix ticket:
 * - PR creation using Cloud Agent
 * - Status updates back to Next.js
 */

import { DurableObject } from 'cloudflare:workers';
import type { Env, FixTicket, FixRequest, ClassificationResult } from './types';
import { buildPRPrompt, buildReviewCommentPrompt } from './services/prompt-builder';
import { CloudAgentClient } from './services/cloud-agent-client';
import { SSEStreamProcessor } from './services/sse-stream-processor';

export class AutoFixOrchestrator extends DurableObject<Env> {
  private state!: FixTicket;
  private sseProcessor = new SSEStreamProcessor();

  /** Default PR creation timeout (15 minutes) - used if not configured */
  private static readonly DEFAULT_PR_CREATION_TIMEOUT_MS = 15 * 60 * 1000;

  /** Cleanup delay after completion (7 days) */
  private static readonly CLEANUP_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

  /**
   * Get PR creation timeout from config or use default
   */
  private getPRCreationTimeout(): number {
    const minutes = this.state.sessionInput.maxPRCreationTimeMinutes;
    return minutes ? minutes * 60 * 1000 : AutoFixOrchestrator.DEFAULT_PR_CREATION_TIMEOUT_MS;
  }

  /**
   * Initialize the fix session
   */
  async start(params: FixRequest): Promise<{ status: string }> {
    this.state = {
      ticketId: params.ticketId,
      authToken: params.authToken,
      sessionInput: params.sessionInput,
      owner: params.owner,
      triggerSource: params.triggerSource || 'label',
      status: 'pending',
      updatedAt: new Date().toISOString(),
    };

    await this.ctx.storage.put('state', this.state);

    return { status: 'pending' };
  }

  /**
   * Run the fix process
   * Called via waitUntil() from the HTTP handler
   */
  async runFix(): Promise<void> {
    await this.loadState();

    if (this.state.status !== 'pending') {
      console.log('[AutoFixOrchestrator] Skipping - already processed', {
        ticketId: this.state.ticketId,
        status: this.state.status,
      });
      return;
    }

    await this.updateStatus('running');

    try {
      // Create PR using Cloud Agent
      await this.createPR();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Distinguish between timeout and other errors
      const isTimeout = errorMessage.includes('timeout');
      const isPRTimeout = errorMessage.includes('PR creation timeout');

      console.error('[AutoFixOrchestrator] Error:', {
        ticketId: this.state.ticketId,
        error: errorMessage,
        isTimeout,
        isPRTimeout,
      });

      if (this.state.triggerSource === 'review_comment') {
        await this.notifyReviewCommentResult(this.state.sessionId, 'failed', errorMessage);
      }

      await this.updateStatus('failed', {
        errorMessage: errorMessage,
      });
    }
  }

  /**
   * Get events for this fix session
   */
  async getEvents(): Promise<{ events: unknown[] }> {
    await this.loadState();
    return { events: this.state.events || [] };
  }

  /**
   * Load state from Durable Object storage
   */
  private async loadState(): Promise<void> {
    const stored = await this.ctx.storage.get<FixTicket>('state');
    if (!stored) {
      throw new Error('State not found');
    }
    this.state = stored;
  }

  /**
   * Create a PR for the issue
   * Uses Cloud Agent to create the fix
   */
  private async createPR(): Promise<void> {
    console.log('[AutoFixOrchestrator] Creating PR', {
      ticketId: this.state.ticketId,
      issueNumber: this.state.sessionInput.issueNumber,
    });

    // Get configuration from Next.js API
    const configResponse = await fetch(`${this.env.API_URL}/api/internal/auto-fix/config`, {
      method: 'POST',
      headers: {
        'X-Internal-Secret': this.env.INTERNAL_API_SECRET,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ticketId: this.state.ticketId,
      }),
    });

    if (!configResponse.ok) {
      const errorText = await configResponse.text();
      throw new Error(`Failed to get PR config: ${configResponse.statusText} - ${errorText}`);
    }

    const configData: {
      githubToken?: string;
      config: {
        model_slug: string;
        pr_base_branch: string;
        pr_branch_prefix: string;
        pr_title_template: string;
        pr_body_template?: string | null;
        custom_instructions?: string | null;
      };
    } = await configResponse.json();
    const githubToken = configData.githubToken;
    const config = configData.config;

    // Build callback URL for Cloud Agent
    const callbackUrl = `${this.env.API_URL}/api/internal/auto-fix/pr-callback`;

    // Determine if this is a review comment trigger
    const isReviewCommentFix = this.state.triggerSource === 'review_comment';
    const reviewCommentUpstreamBranch = this.state.sessionInput.upstreamBranch?.trim();

    if (isReviewCommentFix && !reviewCommentUpstreamBranch) {
      throw new Error(
        'Review comment fixes require upstreamBranch (PR head branch). Refusing session/{id} fallback.'
      );
    }

    let prompt: string;

    if (isReviewCommentFix) {
      // Build scoped review comment prompt
      prompt = buildReviewCommentPrompt(
        {
          repoFullName: this.state.sessionInput.repoFullName,
          prNumber: this.state.sessionInput.issueNumber,
          prTitle: this.state.sessionInput.issueTitle,
          reviewCommentBody: this.state.sessionInput.reviewCommentBody || '',
          filePath: this.state.sessionInput.filePath || '',
          lineNumber: this.state.sessionInput.lineNumber,
          diffHunk: this.state.sessionInput.diffHunk || '',
          prHeadSha: this.state.sessionInput.prHeadSha,
        },
        {
          custom_instructions: config.custom_instructions,
        },
        this.state.ticketId
      );
    } else {
      // Build classification result from session input
      const classification: ClassificationResult = {
        classification: this.state.sessionInput.classification || 'bug',
        confidence: this.state.sessionInput.confidence || 0.9,
        intentSummary: this.state.sessionInput.intentSummary || 'Fix the reported issue',
        relatedFiles: this.state.sessionInput.relatedFiles,
      };

      // Build PR creation prompt using comprehensive template
      prompt = buildPRPrompt(
        {
          repoFullName: this.state.sessionInput.repoFullName,
          issueNumber: this.state.sessionInput.issueNumber,
          issueTitle: this.state.sessionInput.issueTitle,
          issueBody: this.state.sessionInput.issueBody,
        },
        classification,
        {
          pr_branch_prefix: config.pr_branch_prefix,
          custom_instructions: config.custom_instructions,
        },
        this.state.ticketId
      );
    }

    // Build session input
    // For review comment fixes: set upstreamBranch to the PR's head branch so changes push there
    // For issue fixes: DO NOT set upstreamBranch - agent creates session/{sessionId} branch
    const sessionInput = {
      githubRepo: this.state.sessionInput.repoFullName,
      kilocodeOrganizationId: this.state.owner.type === 'org' ? this.state.owner.id : undefined,
      prompt,
      mode: 'code' as const,
      model: config.model_slug,
      githubToken,
      autoCommit: true,
      createdOnPlatform: 'autofix',
      ...(isReviewCommentFix ? { upstreamBranch: reviewCommentUpstreamBranch } : {}),
      callbackUrl,
      callbackHeaders: {
        'X-Internal-Secret': this.env.INTERNAL_API_SECRET,
      },
    };

    // Use CloudAgentClient to initiate async session
    const cloudAgentClient = new CloudAgentClient(this.env.CLOUD_AGENT_URL, this.state.authToken);
    const response = await cloudAgentClient.initiateSessionAsync(sessionInput, this.state.ticketId);

    // Add timeout protection for PR creation
    const timeoutMs = this.getPRCreationTimeout();
    const timeoutMinutes = Math.floor(timeoutMs / 60000);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`PR creation timeout - exceeded ${timeoutMinutes} minute limit`)),
        timeoutMs
      )
    );

    // Process SSE stream with timeout
    await Promise.race([this.processCloudAgentStream(response), timeoutPromise]);
  }

  /**
   * Process Cloud Agent SSE stream
   * Extracts sessionId and maintains connection until completion
   * After completion, creates the GitHub PR
   */
  private async processCloudAgentStream(response: Response): Promise<void> {
    let sessionId: string | undefined = undefined;
    let fatalStreamError: Error | undefined = undefined;
    let sawComplete = false;

    // Use SSEStreamProcessor to handle the stream
    await this.sseProcessor.processStream(response, {
      onSessionId: async (capturedSessionId: string) => {
        if (!sessionId) {
          sessionId = capturedSessionId;
          console.log('[AutoFixOrchestrator] Captured sessionId', {
            ticketId: this.state.ticketId,
            sessionId,
          });

          // Update state and DB with sessionId
          await this.updateStatus('running', { sessionId });
        }
      },
      onComplete: () => {
        sawComplete = true;
        console.log('[AutoFixOrchestrator] Cloud Agent stream completed', {
          ticketId: this.state.ticketId,
          sessionId,
        });
      },
      onError: (error: Error) => {
        if (!fatalStreamError) {
          fatalStreamError = error;
        }

        console.warn('[AutoFixOrchestrator] Cloud Agent error event', {
          ticketId: this.state.ticketId,
          error: error.message,
          sessionId,
        });
      },
    });

    console.log('[AutoFixOrchestrator] Cloud Agent stream ended', {
      ticketId: this.state.ticketId,
      sessionId,
      hasFatalError: !!fatalStreamError,
      sawComplete,
    });

    if (fatalStreamError && !sawComplete) {
      throw fatalStreamError;
    }

    // Check if sessionId was captured - if not, no changes were made
    if (!sessionId) {
      console.log('[AutoFixOrchestrator] No sessionId captured - no changes were made', {
        ticketId: this.state.ticketId,
      });

      // Update status to completed without PR
      await this.updateStatus('completed', {
        errorMessage:
          'No changes were made by the Cloud Agent. The issue may already be resolved or no modifications were needed.',
      });
      return;
    }

    // Wait for git push to complete and propagate to GitHub
    // The autoCommit process may still be finalizing the push
    console.log('[AutoFixOrchestrator] Waiting for git push to propagate to GitHub...');
    await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay

    // For review comment fixes: acknowledge result on original comment instead of creating a new PR
    if (this.state.triggerSource === 'review_comment') {
      await this.notifyReviewCommentResult(sessionId, 'success');
    } else {
      // For issue fixes: create a new GitHub PR
      await this.createGitHubPR(sessionId);
    }
  }

  /**
   * Create GitHub PR after Cloud Agent completes
   * The branch should now exist on GitHub after autoCommit pushed it
   */
  private async createGitHubPR(sessionId: string | undefined): Promise<void> {
    if (!sessionId) {
      throw new Error('Cannot create PR without sessionId');
    }

    // The Cloud Agent creates a branch named `session/{sessionId}` automatically
    // when upstreamBranch is not set
    const branchName = `session/${sessionId}`;

    console.log('[AutoFixOrchestrator] Creating GitHub PR', {
      ticketId: this.state.ticketId,
      sessionId,
      branchName,
    });

    // Get configuration from Next.js API
    const configResponse = await fetch(`${this.env.API_URL}/api/internal/auto-fix/config`, {
      method: 'POST',
      headers: {
        'X-Internal-Secret': this.env.INTERNAL_API_SECRET,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ticketId: this.state.ticketId,
      }),
    });

    if (!configResponse.ok) {
      const errorText = await configResponse.text();
      throw new Error(`Failed to get PR config: ${configResponse.statusText} - ${errorText}`);
    }

    const configData: {
      githubToken?: string;
      config: {
        pr_base_branch: string;
        pr_title_template: string;
        pr_body_template?: string | null;
      };
    } = await configResponse.json();

    // Call Next.js API to create the PR
    // This handles all the GitHub API calls and ticket updates
    const prResponse = await fetch(`${this.env.API_URL}/api/internal/auto-fix/create-pr`, {
      method: 'POST',
      headers: {
        'X-Internal-Secret': this.env.INTERNAL_API_SECRET,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ticketId: this.state.ticketId,
        sessionId,
        branchName, // Pass the session branch name
        githubToken: configData.githubToken,
        config: configData.config,
      }),
    });

    if (!prResponse.ok) {
      const errorText = await prResponse.text();
      throw new Error(`Failed to create PR: ${prResponse.statusText} - ${errorText}`);
    }

    const prDataRaw = await prResponse.json();
    const prData = prDataRaw as { prNumber: number; prUrl: string };

    console.log('[AutoFixOrchestrator] GitHub PR created successfully', {
      ticketId: this.state.ticketId,
      prNumber: prData.prNumber,
      prUrl: prData.prUrl,
    });

    // Update status to completed
    await this.updateStatus('completed', {
      prNumber: prData.prNumber,
      prUrl: prData.prUrl,
      prBranch: branchName,
    });
  }

  /**
   * Notify on the original review comment after review-comment auto-fix completes.
   * - success: add +1 reaction and post a success reply on the same thread
   * - failed: post a reply on the thread with failure details
   */
  private async notifyReviewCommentResult(
    sessionId: string | undefined,
    outcome: 'success' | 'failed',
    errorMessage?: string
  ): Promise<void> {
    console.log('[AutoFixOrchestrator] Notifying review comment result', {
      ticketId: this.state.ticketId,
      sessionId,
      outcome,
      hasError: !!errorMessage,
    });

    try {
      const response = await fetch(`${this.env.API_URL}/api/internal/auto-fix/comment-reply`, {
        method: 'POST',
        headers: {
          'X-Internal-Secret': this.env.INTERNAL_API_SECRET,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticketId: this.state.ticketId,
          sessionId,
          outcome,
          errorMessage,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn('[AutoFixOrchestrator] Failed to notify review comment result', {
          ticketId: this.state.ticketId,
          sessionId,
          outcome,
          httpStatus: response.status,
          httpStatusText: response.statusText,
          errorText,
        });
      } else {
        console.log('[AutoFixOrchestrator] Review comment result notification succeeded', {
          ticketId: this.state.ticketId,
          sessionId,
          outcome,
        });
      }
    } catch (notifyError) {
      console.warn('[AutoFixOrchestrator] Error notifying review comment result', {
        ticketId: this.state.ticketId,
        sessionId,
        outcome,
        error: notifyError instanceof Error ? notifyError.message : String(notifyError),
      });
    }

    if (outcome === 'success') {
      await this.updateStatus('completed', {
        sessionId,
        prBranch: this.state.sessionInput.upstreamBranch,
      });
    }
  }

  /**
   * Update status in Durable Object and Next.js
   */
  private async updateStatus(status: string, updates: Partial<FixTicket> = {}): Promise<void> {
    this.state.status = status as FixTicket['status'];
    this.state.updatedAt = new Date().toISOString();

    if (status === 'running' && !this.state.startedAt) {
      this.state.startedAt = new Date().toISOString();
    }

    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      this.state.completedAt = new Date().toISOString();
    }

    // Apply updates
    Object.assign(this.state, updates);

    // Save to Durable Object storage
    await this.ctx.storage.put('state', this.state);

    // Update Next.js database
    await fetch(`${this.env.API_URL}/api/internal/auto-fix-status/${this.state.ticketId}`, {
      method: 'POST',
      headers: {
        'X-Internal-Secret': this.env.INTERNAL_API_SECRET,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status,
        ...updates,
      }),
    });
  }
}
