const GITHUB_INTEGRATION_ERROR_NEEDLES = [
  'GitHub token',
  'GitHub installation',
  'installation_id',
  'Bad credentials',
  'Not Found',
  'Forbidden',
  'Resource not accessible',
];

/** Detect GitHub integration errors so the UI can show "reconnect your GitHub App" guidance. */
export function isGitHubIntegrationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return GITHUB_INTEGRATION_ERROR_NEEDLES.some(needle => message.includes(needle));
}
