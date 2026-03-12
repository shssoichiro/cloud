export interface GmailPushQueueMessage {
  userId: string;
  pubSubBody: string;
}

export type Env = {
  KILOCLAW: Fetcher;
  OIDC_AUDIENCE: string;
  INTERNAL_API_SECRET: string;
  GMAIL_PUSH_QUEUE: Queue<GmailPushQueueMessage>;
};

export type HonoContext = {
  Bindings: Env;
};
