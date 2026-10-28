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
        scopes: ['profile', 'email']
      },
      // Production URLs (e.g. https://<domain>/app) get added once the domain is known.
      callbackUrls: ['http://localhost:3000/app'],
      logoutUrls: ['http://localhost:3000/'],
    },
  },
});
