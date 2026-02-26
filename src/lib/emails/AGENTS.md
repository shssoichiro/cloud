# Email Templates

These HTML files are Customer.io transactional email templates. They are uploaded to Customer.io and referenced by ID in [`src/lib/email.ts`](../email.ts).

## Styling

All templates use the Kilo brand design system:

| Property                | Value                                                 |
| ----------------------- | ----------------------------------------------------- |
| Font                    | `'JetBrains Mono', 'Courier New', Courier, monospace` |
| Page background         | `#1a1a1a`                                             |
| Card background         | `#2a2a2a`                                             |
| Card border             | `1px solid #3a3a3a`                                   |
| H1 color                | `#f4e452` (yellow)                                    |
| Body text               | `#9ca3af` (gray)                                      |
| Strong / emphasis text  | `#d1d5db` (light gray)                                |
| Links                   | `#f4e452` (yellow)                                    |
| CTA button background   | `#f4e452` (yellow)                                    |
| CTA button text         | `#6b7280` (dark gray)                                 |
| Footer / secondary text | `#6b7280`                                             |
| Section divider         | `1px solid #3a3a3a`                                   |

## Footer

Every template must include this branding footer below the card:

```html
<!-- Branding Footer -->
<table width="600" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center" style="padding: 30px 20px">
      <p
        style="
          margin: 0;
          font-size: 12px;
          color: #6b7280;
          font-family: 'JetBrains Mono', 'Courier New', Courier, monospace;
        "
      >
        © {{ year }} Kilo Code, LLC<br />455 Market St, Ste 1940 PMB 993504<br />San Francisco, CA
        94105, USA
      </p>
    </td>
  </tr>
</table>
```

## Template Variables

Customer.io transactional emails receive variables from `message_data` as **top-level Liquid variables** — use `{{ variable_name }}` directly, not `{{ trigger.variable_name }}`.

| Template file                    | Customer.io ID | Variables                                                                                                                                                  |
| -------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orgSubscription.html`           | `10`           | `seats`, `organization_url`, `invoices_url`                                                                                                                |
| `orgRenewed.html`                | `11`           | `seats`, `invoices_url`                                                                                                                                    |
| `orgCancelled.html`              | `12`           | `invoices_url`                                                                                                                                             |
| `orgSSOUserJoined.html`          | `13`           | `new_user_email`, `organization_url`                                                                                                                       |
| `orgInvitation.html`             | `6`            | `organization_name`, `inviter_name`, `accept_invite_url`                                                                                                   |
| `magicLink.html`                 | `14`           | `magic_link_url`, `email`, `expires_in`, `expires_at`, `app_url`                                                                                           |
| `balanceAlert.html`              | `16`           | `organizationId`, `minimum_balance`, `organization_url`, `invoices_url`                                                                                    |
| `autoTopUpFailed.html`           | `17`           | `reason`, `credits_url`                                                                                                                                    |
| `ossInviteNewUser.html`          | `18`           | `organization_name`, `accept_invite_url`, `integrations_url`, `code_reviews_url`, `tier_name`, `seats`, `seat_value`, `has_credits`, `monthly_credits_usd` |
| `ossInviteExistingUser.html`     | `19`           | `organization_name`, `organization_url`, `integrations_url`, `code_reviews_url`, `tier_name`, `seats`, `seat_value`, `has_credits`, `monthly_credits_usd`  |
| `ossExistingOrgProvisioned.html` | `20`           | `organization_name`, `organization_url`, `integrations_url`, `code_reviews_url`, `tier_name`, `seats`, `seat_value`, `has_credits`, `monthly_credits_usd`  |
| `deployFailed.html`              | `21`           | `deployment_name`, `deployment_url`, `repository`                                                                                                          |
