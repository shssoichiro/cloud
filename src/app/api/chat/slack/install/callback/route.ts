import { bot } from '@/lib/bot';
import { SLACK_REDIRECT_URI } from '@/lib/integrations/slack-service';

export async function GET(request: Request) {
  await bot.initialize();
  const slackAdapter = bot.getAdapter('slack');

  // TODO(remon): Not completely sure why this is needed, but handleOAuthCallback
  //   requires a redirect_uri in the URL, and we don't have it (because we are the redirect_uri)
  const url = new URL(request.url);
  url.searchParams.set('redirect_uri', SLACK_REDIRECT_URI);
  const patchedRequest = new Request(url, request);

  const { teamId } = await slackAdapter.handleOAuthCallback(patchedRequest);
  return new Response(`Installed for team ${teamId}!`);
}
