export type Env = {
  KILOCLAW: Fetcher;
  OIDC_AUDIENCE: string;
  INTERNAL_API_SECRET: string;
};

export type HonoContext = {
  Bindings: Env;
};
