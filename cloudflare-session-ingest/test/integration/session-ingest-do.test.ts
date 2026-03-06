import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function getStub(kiloUserId: string, sessionId: string) {
  const doKey = `${kiloUserId}/${sessionId}`;
  const id = env.SESSION_INGEST_DO.idFromName(doKey);
  return env.SESSION_INGEST_DO.get(id);
}

describe('SessionIngestDO integration', () => {
  const kiloUserId = 'usr_test_integration';

  describe('ingest + getAllStream round-trip', () => {
    it('ingests a single session item and exports it', async () => {
      const sessionId = 'ses_roundtrip_single_000000001';
      const stub = getStub(kiloUserId, sessionId);

      await stub.ingest(
        [{ type: 'session', data: { title: 'Test Session' } }],
        kiloUserId,
        sessionId,
        1
      );

      const raw = await stub.getAllStream().then(s => new Response(s).text());
      const snapshot = JSON.parse(raw);

      expect(snapshot.info).toEqual({ title: 'Test Session' });
      expect(snapshot.messages).toEqual([]);
    });

    it('ingests multiple items and exports a full snapshot', async () => {
      const sessionId = 'ses_roundtrip_multi_000000002';
      const stub = getStub(kiloUserId, sessionId);

      await stub.ingest(
        [
          { type: 'session', data: { title: 'Multi Item Session' } },
          { type: 'message', data: { id: 'msg_1', role: 'user', content: 'hello' } },
          {
            type: 'part',
            data: { id: 'part_1', messageID: 'msg_1', type: 'text', content: 'hello' },
          },
          { type: 'message', data: { id: 'msg_2', role: 'assistant', content: 'hi' } },
          {
            type: 'part',
            data: { id: 'part_2', messageID: 'msg_2', type: 'text', content: 'hi' },
          },
        ],
        kiloUserId,
        sessionId,
        1
      );

      const raw = await stub.getAllStream().then(s => new Response(s).text());
      const snapshot = JSON.parse(raw);

      expect(snapshot.info).toEqual({ title: 'Multi Item Session' });
      expect(snapshot.messages).toHaveLength(2);
      expect(snapshot.messages[0].info.id).toBe('msg_1');
      expect(snapshot.messages[0].parts).toHaveLength(1);
      expect(snapshot.messages[0].parts[0].id).toBe('part_1');
      expect(snapshot.messages[1].info.id).toBe('msg_2');
      expect(snapshot.messages[1].parts).toHaveLength(1);
    });

    it('handles multiple ingest calls (appending items)', async () => {
      const sessionId = 'ses_roundtrip_append_00000003';
      const stub = getStub(kiloUserId, sessionId);

      // First ingest: session info + first message
      await stub.ingest(
        [
          { type: 'session', data: { title: 'Incremental Session' } },
          { type: 'message', data: { id: 'msg_1', role: 'user', content: 'first' } },
        ],
        kiloUserId,
        sessionId,
        1
      );

      // Second ingest: second message
      await stub.ingest(
        [{ type: 'message', data: { id: 'msg_2', role: 'assistant', content: 'second' } }],
        kiloUserId,
        sessionId,
        1
      );

      const raw = await stub.getAllStream().then(s => new Response(s).text());
      const snapshot = JSON.parse(raw);

      expect(snapshot.messages).toHaveLength(2);
      expect(snapshot.messages[0].info.id).toBe('msg_1');
      expect(snapshot.messages[1].info.id).toBe('msg_2');
    });
  });

  describe('upsert behavior', () => {
    it('updates existing item on duplicate item_id', async () => {
      const sessionId = 'ses_upsert_dedup_0000000004';
      const stub = getStub(kiloUserId, sessionId);

      await stub.ingest(
        [{ type: 'session', data: { title: 'Original Title' } }],
        kiloUserId,
        sessionId,
        1
      );

      await stub.ingest(
        [{ type: 'session', data: { title: 'Updated Title' } }],
        kiloUserId,
        sessionId,
        1
      );

      const raw = await stub.getAllStream().then(s => new Response(s).text());
      const snapshot = JSON.parse(raw);

      expect(snapshot.info).toEqual({ title: 'Updated Title' });
    });
  });

  describe('metadata extraction', () => {
    it('returns title change', async () => {
      const sessionId = 'ses_meta_title_00000000005';
      const stub = getStub(kiloUserId, sessionId);

      const result = await stub.ingest(
        [{ type: 'session', data: { title: 'My Title' } }],
        kiloUserId,
        sessionId,
        1
      );

      const titleChange = result.changes.find(c => c.name === 'title');
      expect(titleChange).toBeDefined();
      expect(titleChange!.value).toBe('My Title');
    });

    it('returns platform and orgId from kilo_meta', async () => {
      const sessionId = 'ses_meta_platform_000000006';
      const stub = getStub(kiloUserId, sessionId);

      const result = await stub.ingest(
        [
          {
            type: 'kilo_meta',
            data: { platform: 'vscode', orgId: '11111111-1111-1111-1111-111111111111' },
          },
        ],
        kiloUserId,
        sessionId,
        1
      );

      expect(result.changes.find(c => c.name === 'platform')?.value).toBe('vscode');
      expect(result.changes.find(c => c.name === 'orgId')?.value).toBe(
        '11111111-1111-1111-1111-111111111111'
      );
    });
  });

  describe('export produces valid JSON', () => {
    it('returns valid JSON from getAllStream even with no items', async () => {
      const sessionId = 'ses_export_empty_0000000007';
      const stub = getStub(kiloUserId, sessionId);

      const raw = await stub.getAllStream().then(s => new Response(s).text());
      const snapshot = JSON.parse(raw);

      expect(snapshot).toHaveProperty('info');
      expect(snapshot).toHaveProperty('messages');
      expect(Array.isArray(snapshot.messages)).toBe(true);
    });

    it('produces valid JSON with many items', async () => {
      const sessionId = 'ses_export_many_00000000008';
      const stub = getStub(kiloUserId, sessionId);

      const items: Array<{ type: string; data: Record<string, unknown> }> = [
        { type: 'session', data: { title: 'Large Session' } },
      ];

      for (let i = 0; i < 50; i++) {
        items.push({
          type: 'message',
          data: { id: `msg_${i}`, role: i % 2 === 0 ? 'user' : 'assistant', content: `msg ${i}` },
        });
        items.push({
          type: 'part',
          data: {
            id: `part_${i}`,
            messageID: `msg_${i}`,
            type: 'text',
            content: `part content ${i}`,
          },
        });
      }

      await stub.ingest(items as never, kiloUserId, sessionId, 1);

      const raw = await stub.getAllStream().then(s => new Response(s).text());
      const snapshot = JSON.parse(raw);

      expect(snapshot.messages).toHaveLength(50);
      for (let i = 0; i < 50; i++) {
        expect(snapshot.messages[i].info.id).toBe(`msg_${i}`);
        expect(snapshot.messages[i].parts).toHaveLength(1);
      }
    });
  });

  describe('clear', () => {
    it('clears all data from the DO', async () => {
      const sessionId = 'ses_clear_test_00000000009';
      const stub = getStub(kiloUserId, sessionId);

      await stub.ingest(
        [
          { type: 'session', data: { title: 'To Be Cleared' } },
          { type: 'message', data: { id: 'msg_1', role: 'user', content: 'bye' } },
        ],
        kiloUserId,
        sessionId,
        1
      );

      await stub.clear();

      const raw = await stub.getAllStream().then(s => new Response(s).text());
      const snapshot = JSON.parse(raw);

      expect(snapshot.info).toEqual({});
      expect(snapshot.messages).toEqual([]);
    });
  });
});
