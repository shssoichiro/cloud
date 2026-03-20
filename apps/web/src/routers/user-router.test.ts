import { createCallerForUser } from '@/routers/test-utils';
import { db } from '@/lib/drizzle';
import {
  channel_badge_counts,
  kilocode_users,
  microdollar_usage,
  microdollar_usage_metadata,
  cli_sessions_v2,
} from '@kilocode/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { insertTestUser } from '@/tests/helpers/user.helper';
import { createTestOrganization } from '@/tests/helpers/organization.helper';
import { defineMicrodollarUsage } from '@/tests/helpers/microdollar-usage.helper';
import { insertUsageRecord } from '@/lib/ai-gateway/processUsage';
import type { User, Organization } from '@kilocode/db/schema';

let testUser: User;
let surveyTestUser: User;
let skipTestUser: User;

describe('user router - updateProfile', () => {
  beforeAll(async () => {
    testUser = await insertTestUser({
      google_user_email: 'update-profile-test@example.com',
      google_user_name: 'Profile Test User',
    });
  });

  afterEach(async () => {
    // Reset profile URLs between tests
    await db
      .update(kilocode_users)
      .set({ linkedin_url: null, github_url: null })
      .where(eq(kilocode_users.id, testUser.id));
  });

  it('updates linkedin_url only', async () => {
    const caller = await createCallerForUser(testUser.id);
    const result = await caller.user.updateProfile({
      linkedin_url: 'https://linkedin.com/in/testuser',
    });

    expect(result).toEqual({ success: true });

    const updated = await db.query.kilocode_users.findFirst({
      where: eq(kilocode_users.id, testUser.id),
    });
    expect(updated?.linkedin_url).toBe('https://linkedin.com/in/testuser');
    expect(updated?.github_url).toBeNull();
  });

  it('updates github_url only', async () => {
    const caller = await createCallerForUser(testUser.id);
    const result = await caller.user.updateProfile({
      github_url: 'https://github.com/testuser',
    });

    expect(result).toEqual({ success: true });

    const updated = await db.query.kilocode_users.findFirst({
      where: eq(kilocode_users.id, testUser.id),
    });
    expect(updated?.github_url).toBe('https://github.com/testuser');
    expect(updated?.linkedin_url).toBeNull();
  });

  it('updates both fields at once', async () => {
    const caller = await createCallerForUser(testUser.id);
    const result = await caller.user.updateProfile({
      linkedin_url: 'https://linkedin.com/in/testuser',
      github_url: 'https://github.com/testuser',
    });

    expect(result).toEqual({ success: true });

    const updated = await db.query.kilocode_users.findFirst({
      where: eq(kilocode_users.id, testUser.id),
    });
    expect(updated?.linkedin_url).toBe('https://linkedin.com/in/testuser');
    expect(updated?.github_url).toBe('https://github.com/testuser');
  });

  it('clears a URL by passing null', async () => {
    // First set a value
    await db
      .update(kilocode_users)
      .set({ linkedin_url: 'https://linkedin.com/in/testuser' })
      .where(eq(kilocode_users.id, testUser.id));

    const caller = await createCallerForUser(testUser.id);
    const result = await caller.user.updateProfile({
      linkedin_url: null,
    });

    expect(result).toEqual({ success: true });

    const updated = await db.query.kilocode_users.findFirst({
      where: eq(kilocode_users.id, testUser.id),
    });
    expect(updated?.linkedin_url).toBeNull();
  });

  it('rejects invalid URLs', async () => {
    const caller = await createCallerForUser(testUser.id);

    await expect(
      caller.user.updateProfile({
        linkedin_url: 'not-a-url',
      })
    ).rejects.toThrow();

    await expect(
      caller.user.updateProfile({
        github_url: 'just some text',
      })
    ).rejects.toThrow();
  });

  it('rejects javascript: protocol URLs', async () => {
    const caller = await createCallerForUser(testUser.id);

    await expect(
      caller.user.updateProfile({
        linkedin_url: 'javascript:alert(1)',
      })
    ).rejects.toThrow();

    await expect(
      caller.user.updateProfile({
        github_url: 'javascript:void(0)',
      })
    ).rejects.toThrow();
  });

  it('returns success when no fields are provided', async () => {
    const caller = await createCallerForUser(testUser.id);
    const result = await caller.user.updateProfile({});

    expect(result).toEqual({ success: true });
  });
});

describe('user router - submitCustomerSource', () => {
  beforeAll(async () => {
    surveyTestUser = await insertTestUser({
      google_user_email: 'survey-test@example.com',
      google_user_name: 'Survey Test User',
    });
  });

  afterEach(async () => {
    await db
      .update(kilocode_users)
      .set({ customer_source: null })
      .where(eq(kilocode_users.id, surveyTestUser.id));
  });

  it('saves the customer source to the database', async () => {
    const caller = await createCallerForUser(surveyTestUser.id);
    const result = await caller.user.submitCustomerSource({
      source: 'A YouTube video',
    });

    expect(result).toEqual({ success: true });

    const updated = await db.query.kilocode_users.findFirst({
      where: eq(kilocode_users.id, surveyTestUser.id),
    });
    expect(updated?.customer_source).toBe('A YouTube video');
  });

  it('overwrites a previous response', async () => {
    const caller = await createCallerForUser(surveyTestUser.id);

    await caller.user.submitCustomerSource({ source: 'First answer' });
    await caller.user.submitCustomerSource({ source: 'Updated answer' });

    const updated = await db.query.kilocode_users.findFirst({
      where: eq(kilocode_users.id, surveyTestUser.id),
    });
    expect(updated?.customer_source).toBe('Updated answer');
  });

  it('rejects empty strings', async () => {
    const caller = await createCallerForUser(surveyTestUser.id);

    await expect(caller.user.submitCustomerSource({ source: '' })).rejects.toThrow();
  });

  it('rejects strings over 1000 characters', async () => {
    const caller = await createCallerForUser(surveyTestUser.id);

    const longString = 'a'.repeat(1001);
    await expect(caller.user.submitCustomerSource({ source: longString })).rejects.toThrow();
  });

  it('accepts a string at the max length of 1000', async () => {
    const caller = await createCallerForUser(surveyTestUser.id);
    const maxString = 'a'.repeat(1000);

    const result = await caller.user.submitCustomerSource({
      source: maxString,
    });
    expect(result).toEqual({ success: true });

    const updated = await db.query.kilocode_users.findFirst({
      where: eq(kilocode_users.id, surveyTestUser.id),
    });
    expect(updated?.customer_source).toBe(maxString);
  });

  it('accepts a single-character string', async () => {
    const caller = await createCallerForUser(surveyTestUser.id);
    const result = await caller.user.submitCustomerSource({ source: 'X' });

    expect(result).toEqual({ success: true });

    const updated = await db.query.kilocode_users.findFirst({
      where: eq(kilocode_users.id, surveyTestUser.id),
    });
    expect(updated?.customer_source).toBe('X');
  });

  it('accepts 1000 chars of content with leading/trailing spaces (validates post-trim)', async () => {
    const caller = await createCallerForUser(surveyTestUser.id);
    const content = 'a'.repeat(1000);
    const result = await caller.user.submitCustomerSource({
      source: `  ${content}  `,
    });

    expect(result).toEqual({ success: true });

    const updated = await db.query.kilocode_users.findFirst({
      where: eq(kilocode_users.id, surveyTestUser.id),
    });
    expect(updated?.customer_source).toBe(content);
  });

  describe('whitespace-only input rejection', () => {
    it('rejects spaces-only input', async () => {
      const caller = await createCallerForUser(surveyTestUser.id);

      await expect(caller.user.submitCustomerSource({ source: '   ' })).rejects.toThrow();
    });

    it('rejects tab-only input', async () => {
      const caller = await createCallerForUser(surveyTestUser.id);

      await expect(caller.user.submitCustomerSource({ source: '\t\t' })).rejects.toThrow();
    });

    it('rejects newline-only input', async () => {
      const caller = await createCallerForUser(surveyTestUser.id);

      await expect(caller.user.submitCustomerSource({ source: '\n\n' })).rejects.toThrow();
    });

    it('rejects mixed whitespace input', async () => {
      const caller = await createCallerForUser(surveyTestUser.id);

      await expect(caller.user.submitCustomerSource({ source: ' \t\n ' })).rejects.toThrow();
    });
  });

  describe('whitespace trimming on valid input', () => {
    it('trims leading and trailing whitespace before storing', async () => {
      const caller = await createCallerForUser(surveyTestUser.id);
      const result = await caller.user.submitCustomerSource({
        source: '  hello  ',
      });

      expect(result).toEqual({ success: true });

      const updated = await db.query.kilocode_users.findFirst({
        where: eq(kilocode_users.id, surveyTestUser.id),
      });
      expect(updated?.customer_source).toBe('hello');
    });

    it('preserves internal whitespace in stored value', async () => {
      const caller = await createCallerForUser(surveyTestUser.id);
      const result = await caller.user.submitCustomerSource({
        source: 'a YouTube video',
      });

      expect(result).toEqual({ success: true });

      const updated = await db.query.kilocode_users.findFirst({
        where: eq(kilocode_users.id, surveyTestUser.id),
      });
      expect(updated?.customer_source).toBe('a YouTube video');
    });
  });
});

describe('user router - skipCustomerSource', () => {
  beforeAll(async () => {
    skipTestUser = await insertTestUser({
      google_user_email: 'skip-survey-test@example.com',
      google_user_name: 'Skip Survey Test User',
    });
  });

  afterEach(async () => {
    await db
      .update(kilocode_users)
      .set({ customer_source: null })
      .where(eq(kilocode_users.id, skipTestUser.id));
  });

  it('skipCustomerSource mutation exists and returns success', async () => {
    const caller = await createCallerForUser(skipTestUser.id);
    const result = await caller.user.skipCustomerSource();

    expect(result).toEqual({ success: true });
  });

  it('sets customer_source to empty string after skipping', async () => {
    const caller = await createCallerForUser(skipTestUser.id);
    await caller.user.skipCustomerSource();

    const updated = await db.query.kilocode_users.findFirst({
      where: eq(kilocode_users.id, skipTestUser.id),
    });
    expect(updated?.customer_source).toBe('');
  });

  it('is idempotent - calling skipCustomerSource twice still returns success', async () => {
    const caller = await createCallerForUser(skipTestUser.id);

    const result1 = await caller.user.skipCustomerSource();
    expect(result1).toEqual({ success: true });

    const result2 = await caller.user.skipCustomerSource();
    expect(result2).toEqual({ success: true });

    const updated = await db.query.kilocode_users.findFirst({
      where: eq(kilocode_users.id, skipTestUser.id),
    });
    expect(updated?.customer_source).toBe('');
  });

  it('does NOT overwrite a real answer when skipCustomerSource is called after submitCustomerSource', async () => {
    const caller = await createCallerForUser(skipTestUser.id);

    await caller.user.submitCustomerSource({
      source: 'Found it on Hacker News',
    });
    await caller.user.skipCustomerSource();

    const updated = await db.query.kilocode_users.findFirst({
      where: eq(kilocode_users.id, skipTestUser.id),
    });
    expect(updated?.customer_source).toBe('Found it on Hacker News');
  });

  it('allows a real answer to overwrite a previous skip', async () => {
    const caller = await createCallerForUser(skipTestUser.id);
    await caller.user.skipCustomerSource();
    await caller.user.submitCustomerSource({
      source: 'Changed my mind — Reddit',
    });

    const updated = await db.query.kilocode_users.findFirst({
      where: eq(kilocode_users.id, skipTestUser.id),
    });
    expect(updated?.customer_source).toBe('Changed my mind — Reddit');
  });
});

describe('session and API token reset mutations', () => {
  async function findRequiredUser(userId: string): Promise<User> {
    const user = await db.query.kilocode_users.findFirst({
      where: eq(kilocode_users.id, userId),
    });
    if (!user) throw new Error(`Expected test user to exist: ${userId}`);
    return user;
  }

  it('resets the current user API key without signing out browser sessions', async () => {
    const user = await insertTestUser({
      api_token_pepper: 'api-pepper-before',
      web_session_pepper: 'web-session-pepper-before',
    });
    const caller = await createCallerForUser(user.id);

    await caller.user.resetAPIKey();

    const updated = await findRequiredUser(user.id);
    expect(updated.api_token_pepper).toEqual(expect.any(String));
    expect(updated.api_token_pepper).not.toBe('api-pepper-before');
    expect(updated.web_session_pepper).toBe('web-session-pepper-before');
  });

  it('signs out current user browser sessions without resetting the API key', async () => {
    const user = await insertTestUser({
      api_token_pepper: 'api-pepper-before',
      web_session_pepper: 'web-session-pepper-before',
    });
    const caller = await createCallerForUser(user.id);

    await caller.user.signOutBrowserSessions();

    const updated = await findRequiredUser(user.id);
    expect(updated.web_session_pepper).toEqual(expect.any(String));
    expect(updated.web_session_pepper).not.toBe('web-session-pepper-before');
    expect(updated.api_token_pepper).toBe('api-pepper-before');
  });

  it('lets admins reset a user API key without signing out browser sessions', async () => {
    const admin = await insertTestUser({ is_admin: true });
    const target = await insertTestUser({
      api_token_pepper: 'api-pepper-before',
      web_session_pepper: 'web-session-pepper-before',
    });
    const caller = await createCallerForUser(admin.id);

    await caller.admin.users.resetAPIKey({ userId: target.id });

    const updated = await findRequiredUser(target.id);
    expect(updated.api_token_pepper).toEqual(expect.any(String));
    expect(updated.api_token_pepper).not.toBe('api-pepper-before');
    expect(updated.web_session_pepper).toBe('web-session-pepper-before');
  });

  it('lets admins sign out user browser sessions without resetting the API key', async () => {
    const admin = await insertTestUser({ is_admin: true });
    const target = await insertTestUser({
      api_token_pepper: 'api-pepper-before',
      web_session_pepper: 'web-session-pepper-before',
    });
    const caller = await createCallerForUser(admin.id);

    await caller.admin.users.signOutBrowserSessions({ userId: target.id });

    const updated = await findRequiredUser(target.id);
    expect(updated.web_session_pepper).toEqual(expect.any(String));
    expect(updated.web_session_pepper).not.toBe('web-session-pepper-before');
    expect(updated.api_token_pepper).toBe('api-pepper-before');
  });
});

describe('user router - getUnreadCounts', () => {
  it('does not return counts from other users', async () => {
    const user = await insertTestUser({
      google_user_email: `unread-counts-me-${crypto.randomUUID()}@example.com`,
    });
    const other = await insertTestUser({
      google_user_email: `unread-counts-other-${crypto.randomUUID()}@example.com`,
    });
    await db.insert(channel_badge_counts).values([
      { user_id: user.id, channel_id: 'sandbox-mine', badge_count: 4 },
      { user_id: other.id, channel_id: 'sandbox-theirs', badge_count: 9 },
    ]);

    const caller = await createCallerForUser(user.id);
    const result = await caller.user.getUnreadCounts();

    expect(result).toEqual([{ channelId: 'sandbox-mine', badgeCount: 4 }]);

    await db
      .delete(channel_badge_counts)
      .where(inArray(channel_badge_counts.user_id, [user.id, other.id]));
  });
});

describe('user router - getSessionUsageHistory', () => {
  let sessionUsageUser: User;
  let sessionUsageOrg: Organization;
  const insertedUsageIds: string[] = [];
  const insertedSessionIds: string[] = [];

  const insertSessionUsage = async ({
    sessionId,
    feature,
    createdAt,
    organizationId,
    cost,
    inputTokens,
    outputTokens,
    cacheHitTokens,
    cacheWriteTokens,
  }: {
    sessionId: string | null;
    feature?: string | null;
    createdAt: string;
    organizationId: string | null;
    cost: number;
    inputTokens: number;
    outputTokens: number;
    cacheHitTokens: number;
    cacheWriteTokens: number;
  }) => {
    const { core, metadata } = defineMicrodollarUsage();

    await insertUsageRecord(
      {
        ...core,
        kilo_user_id: sessionUsageUser.id,
        organization_id: organizationId,
        created_at: createdAt,
        cost,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_hit_tokens: cacheHitTokens,
        cache_write_tokens: cacheWriteTokens,
      },
      {
        ...metadata,
        created_at: createdAt,
        message_id: `user-router-session-history-${core.id}`,
        session_id: sessionId,
        feature: feature ?? null,
      }
    );

    insertedUsageIds.push(core.id);
  };

  const insertSession = async ({
    sessionId,
    title,
    createdOnPlatform,
    gitUrl,
    organizationId,
  }: {
    sessionId: string;
    title: string;
    createdOnPlatform: string;
    gitUrl: string | null;
    organizationId: string | null;
  }) => {
    await db.insert(cli_sessions_v2).values({
      session_id: sessionId,
      kilo_user_id: sessionUsageUser.id,
      title,
      created_on_platform: createdOnPlatform,
      git_url: gitUrl,
      organization_id: organizationId,
    });

    insertedSessionIds.push(sessionId);
  };

  beforeAll(async () => {
    sessionUsageUser = await insertTestUser({
      google_user_email: 'session-usage-history@example.com',
      google_user_name: 'Session Usage History User',
    });

    sessionUsageOrg = await createTestOrganization(
      'Session Usage History Org',
      sessionUsageUser.id,
      0
    );
  });

  afterEach(async () => {
    if (insertedSessionIds.length > 0) {
      await db
        .delete(cli_sessions_v2)
        .where(
          and(
            eq(cli_sessions_v2.kilo_user_id, sessionUsageUser.id),
            inArray(cli_sessions_v2.session_id, insertedSessionIds)
          )
        );
      insertedSessionIds.length = 0;
    }

    if (insertedUsageIds.length > 0) {
      await db
        .delete(microdollar_usage_metadata)
        .where(inArray(microdollar_usage_metadata.id, insertedUsageIds));
      await db.delete(microdollar_usage).where(inArray(microdollar_usage.id, insertedUsageIds));
      insertedUsageIds.length = 0;
    }
  });

  it('returns newest sessions first with usage aggregation and session enrichment', async () => {
    await insertSession({
      sessionId: 'ses-usage-newest',
      title: 'Newest Session',
      createdOnPlatform: 'cli',
      gitUrl: 'https://github.com/kilo/newest-repo.git',
      organizationId: null,
    });

    await insertSessionUsage({
      sessionId: 'ses-usage-newest',
      createdAt: '2026-01-10T10:00:00.000Z',
      organizationId: null,
      cost: 1_000,
      inputTokens: 100,
      outputTokens: 50,
      cacheHitTokens: 10,
      cacheWriteTokens: 5,
    });

    await insertSessionUsage({
      sessionId: 'ses-usage-middle',
      createdAt: '2026-01-11T10:00:00.000Z',
      organizationId: null,
      cost: 500,
      inputTokens: 80,
      outputTokens: 40,
      cacheHitTokens: 8,
      cacheWriteTokens: 4,
    });

    await insertSessionUsage({
      sessionId: 'ses-usage-newest',
      createdAt: '2026-01-12T10:00:00.000Z',
      organizationId: null,
      cost: 2_000,
      inputTokens: 200,
      outputTokens: 75,
      cacheHitTokens: 20,
      cacheWriteTokens: 10,
    });

    const caller = await createCallerForUser(sessionUsageUser.id);
    const result = await caller.user.getSessionUsageHistory({
      viewType: 'all',
      period: 'all',
      page: 1,
      limit: 100,
    });

    expect(result.sessions.map(session => session.sessionId)).toEqual([
      'ses-usage-newest',
      'ses-usage-middle',
    ]);

    expect(result.sessions[0]).toMatchObject({
      sessionId: 'ses-usage-newest',
      totalCost: 3_000,
      requestCount: 2,
      totalInputTokens: 300,
      totalOutputTokens: 125,
      totalCacheHitTokens: 30,
      totalCacheWriteTokens: 15,
      title: 'Newest Session',
      createdOnPlatform: 'cli',
      gitUrl: 'https://github.com/kilo/newest-repo.git',
      organizationId: null,
    });

    expect(new Date(result.sessions[0].lastUsedAt).toISOString()).toBe('2026-01-12T10:00:00.000Z');
    expect(result.pagination).toMatchObject({
      page: 1,
      limit: 100,
      totalCount: 2,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    });
  });

  it('applies personal, organization, and all usage scoping', async () => {
    await insertSessionUsage({
      sessionId: 'ses-scope-personal',
      createdAt: '2026-02-01T10:00:00.000Z',
      organizationId: null,
      cost: 700,
      inputTokens: 70,
      outputTokens: 35,
      cacheHitTokens: 7,
      cacheWriteTokens: 3,
    });

    await insertSessionUsage({
      sessionId: 'ses-scope-org',
      createdAt: '2026-02-02T10:00:00.000Z',
      organizationId: sessionUsageOrg.id,
      cost: 900,
      inputTokens: 90,
      outputTokens: 45,
      cacheHitTokens: 9,
      cacheWriteTokens: 4,
    });

    await insertSessionUsage({
      sessionId: null,
      createdAt: '2026-02-03T10:00:00.000Z',
      organizationId: null,
      cost: 400,
      inputTokens: 40,
      outputTokens: 20,
      cacheHitTokens: 4,
      cacheWriteTokens: 2,
    });

    const caller = await createCallerForUser(sessionUsageUser.id);

    const personalResult = await caller.user.getSessionUsageHistory({
      viewType: 'personal',
      period: 'all',
      page: 1,
      limit: 100,
    });
    expect(personalResult.sessions.map(session => session.sessionId)).toEqual([
      'ses-scope-personal',
    ]);

    const orgResult = await caller.user.getSessionUsageHistory({
      viewType: sessionUsageOrg.id,
      period: 'all',
      page: 1,
      limit: 100,
    });
    expect(orgResult.sessions.map(session => session.sessionId)).toEqual(['ses-scope-org']);
    expect(orgResult.sessions[0]?.organizationId).toBe(sessionUsageOrg.id);

    const allResult = await caller.user.getSessionUsageHistory({
      viewType: 'all',
      period: 'all',
      page: 1,
      limit: 100,
    });
    expect(allResult.sessions.map(session => session.sessionId)).toEqual([
      'ses-scope-org',
      'ses-scope-personal',
    ]);
  });

  it('includes sessionless usage rows when feature is recorded', async () => {
    await insertSessionUsage({
      sessionId: null,
      feature: 'slack',
      createdAt: '2026-02-05T10:00:00.000Z',
      organizationId: null,
      cost: 1_200,
      inputTokens: 120,
      outputTokens: 60,
      cacheHitTokens: 12,
      cacheWriteTokens: 6,
    });

    const caller = await createCallerForUser(sessionUsageUser.id);
    const result = await caller.user.getSessionUsageHistory({
      viewType: 'all',
      period: 'all',
      page: 1,
      limit: 100,
    });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({
      sessionId: null,
      source: 'slack',
      totalCost: 1_200,
      requestCount: 1,
      totalInputTokens: 120,
      totalOutputTokens: 60,
      totalCacheHitTokens: 12,
      totalCacheWriteTokens: 6,
      title: null,
      createdOnPlatform: null,
      gitUrl: null,
      organizationId: null,
    });
  });

  it('does not group sessionless rows together when feature matches', async () => {
    await insertSessionUsage({
      sessionId: null,
      feature: 'discord',
      createdAt: '2026-02-06T10:00:00.000Z',
      organizationId: null,
      cost: 600,
      inputTokens: 60,
      outputTokens: 30,
      cacheHitTokens: 6,
      cacheWriteTokens: 3,
    });

    await insertSessionUsage({
      sessionId: null,
      feature: 'discord',
      createdAt: '2026-02-07T10:00:00.000Z',
      organizationId: null,
      cost: 900,
      inputTokens: 90,
      outputTokens: 45,
      cacheHitTokens: 9,
      cacheWriteTokens: 4,
    });

    const caller = await createCallerForUser(sessionUsageUser.id);
    const result = await caller.user.getSessionUsageHistory({
      viewType: 'all',
      period: 'all',
      page: 1,
      limit: 100,
    });

    expect(result.sessions).toHaveLength(2);
    expect(result.sessions.map(session => session.source)).toEqual(['discord', 'discord']);
    expect(result.sessions.map(session => session.totalCost)).toEqual([900, 600]);
    expect(result.sessions.map(session => session.requestCount)).toEqual([1, 1]);
    expect(result.pagination.totalCount).toBe(2);
  });

  it('excludes rows without both session id and feature', async () => {
    await insertSessionUsage({
      sessionId: null,
      createdAt: '2026-02-08T10:00:00.000Z',
      organizationId: null,
      cost: 500,
      inputTokens: 50,
      outputTokens: 25,
      cacheHitTokens: 5,
      cacheWriteTokens: 2,
    });

    await insertSessionUsage({
      sessionId: null,
      feature: 'bot',
      createdAt: '2026-02-09T10:00:00.000Z',
      organizationId: null,
      cost: 700,
      inputTokens: 70,
      outputTokens: 35,
      cacheHitTokens: 7,
      cacheWriteTokens: 3,
    });

    const caller = await createCallerForUser(sessionUsageUser.id);
    const result = await caller.user.getSessionUsageHistory({
      viewType: 'all',
      period: 'all',
      page: 1,
      limit: 100,
    });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({
      sessionId: null,
      source: 'bot',
      totalCost: 700,
      requestCount: 1,
    });
  });

  it('applies period filtering to session and source-only rows', async () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();

    await insertSessionUsage({
      sessionId: 'ses-period-recent',
      createdAt: new Date(now - 2 * dayMs).toISOString(),
      organizationId: null,
      cost: 1_000,
      inputTokens: 100,
      outputTokens: 50,
      cacheHitTokens: 10,
      cacheWriteTokens: 5,
    });

    await insertSessionUsage({
      sessionId: 'ses-period-old',
      createdAt: new Date(now - 15 * dayMs).toISOString(),
      organizationId: null,
      cost: 1_100,
      inputTokens: 110,
      outputTokens: 55,
      cacheHitTokens: 11,
      cacheWriteTokens: 5,
    });

    await insertSessionUsage({
      sessionId: null,
      feature: 'embeddings',
      createdAt: new Date(now - dayMs).toISOString(),
      organizationId: null,
      cost: 800,
      inputTokens: 80,
      outputTokens: 40,
      cacheHitTokens: 8,
      cacheWriteTokens: 4,
    });

    await insertSessionUsage({
      sessionId: null,
      feature: 'slack',
      createdAt: new Date(now - 20 * dayMs).toISOString(),
      organizationId: null,
      cost: 900,
      inputTokens: 90,
      outputTokens: 45,
      cacheHitTokens: 9,
      cacheWriteTokens: 4,
    });

    const caller = await createCallerForUser(sessionUsageUser.id);

    const weeklyResult = await caller.user.getSessionUsageHistory({
      viewType: 'all',
      period: 'week',
      page: 1,
      limit: 100,
    });

    expect(weeklyResult.sessions).toHaveLength(2);
    expect(
      weeklyResult.sessions.find(session => session.sessionId === 'ses-period-recent')
    ).toMatchObject({
      source: null,
      totalCost: 1_000,
    });
    expect(weeklyResult.sessions.find(session => session.sessionId === null)).toMatchObject({
      source: 'embeddings',
      totalCost: 800,
    });
    expect(weeklyResult.sessions.some(session => session.sessionId === 'ses-period-old')).toBe(
      false
    );
    expect(weeklyResult.sessions.some(session => session.source === 'slack')).toBe(false);

    const allTimeResult = await caller.user.getSessionUsageHistory({
      viewType: 'all',
      period: 'all',
      page: 1,
      limit: 100,
    });

    expect(allTimeResult.sessions).toHaveLength(4);
  });

  it('returns expected pagination metadata and slices', async () => {
    await insertSessionUsage({
      sessionId: 'ses-page-1',
      createdAt: '2026-03-01T10:00:00.000Z',
      organizationId: null,
      cost: 100,
      inputTokens: 10,
      outputTokens: 5,
      cacheHitTokens: 1,
      cacheWriteTokens: 1,
    });

    await insertSessionUsage({
      sessionId: 'ses-page-2',
      createdAt: '2026-03-02T10:00:00.000Z',
      organizationId: null,
      cost: 100,
      inputTokens: 10,
      outputTokens: 5,
      cacheHitTokens: 1,
      cacheWriteTokens: 1,
    });

    await insertSessionUsage({
      sessionId: 'ses-page-3',
      createdAt: '2026-03-03T10:00:00.000Z',
      organizationId: null,
      cost: 100,
      inputTokens: 10,
      outputTokens: 5,
      cacheHitTokens: 1,
      cacheWriteTokens: 1,
    });

    const caller = await createCallerForUser(sessionUsageUser.id);

    const page1 = await caller.user.getSessionUsageHistory({
      viewType: 'all',
      period: 'all',
      page: 1,
      limit: 1,
    });
    expect(page1.sessions[0]?.sessionId).toBe('ses-page-3');
    expect(page1.pagination).toMatchObject({
      page: 1,
      limit: 1,
      totalCount: 3,
      totalPages: 3,
      hasPreviousPage: false,
      hasNextPage: true,
    });

    const page2 = await caller.user.getSessionUsageHistory({
      viewType: 'all',
      period: 'all',
      page: 2,
      limit: 1,
    });
    expect(page2.sessions[0]?.sessionId).toBe('ses-page-2');
    expect(page2.pagination).toMatchObject({
      page: 2,
      limit: 1,
      totalCount: 3,
      totalPages: 3,
      hasPreviousPage: true,
      hasNextPage: true,
    });

    const page3 = await caller.user.getSessionUsageHistory({
      viewType: 'all',
      period: 'all',
      page: 3,
      limit: 1,
    });
    expect(page3.sessions[0]?.sessionId).toBe('ses-page-1');
    expect(page3.pagination).toMatchObject({
      page: 3,
      limit: 1,
      totalCount: 3,
      totalPages: 3,
      hasPreviousPage: true,
      hasNextPage: false,
    });
  });
});
