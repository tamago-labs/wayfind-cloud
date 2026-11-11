import { defineAuth, secret } from "@aws-amplify/backend";

/**
 * Define and configure your auth resource
 * @see https://docs.amplify.aws/gen2/build-a-backend/auth
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
    externalProviders: {
      // Scopes intentionally omitted: Cognito defaults (email, profile, openid) apply.
      google: {
        clientId: secret('GOOGLE_CLIENT_ID'),
        clientSecret: secret('GOOGLE_CLIENT_SECRET'),
        attributeMapping: {
          email: 'email',
        },
        scopes: ['profile', 'email', 'openid']
      },
      // Production URLs for the live domain (apex + www); localhost for local dev.
      // Cognito matches these exactly — the origin that starts the OAuth flow
      // must be listed here.
      callbackUrls: [
        'http://localhost:3000/app',
        'https://wayfind.click/app',
        'https://www.wayfind.click/app',
        'https://one.wayfind.click/app'
      ],
      logoutUrls: ['http://localhost:3000/', 'https://wayfind.click/', 'https://www.wayfind.click/', 'https://one.wayfind.click/'],
    },
  },
});
