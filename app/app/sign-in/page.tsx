'use client';

import Link from 'next/link';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import outputs from '@/amplify_outputs.json';
import { PageHead } from '@/components/app/ui';

export default function SignInPage() {
  const hasAuth = Boolean((outputs as Record<string, any>)?.auth);

  if (!hasAuth) {
    return (
      <>
        <PageHead
          mono="account.sign-in"
          title="Sign in"
          sub="Accounts arrive with the Phase 3 backend. Once the owner deploys Amplify (auth + data + wayfind-api), this page becomes the real email sign-in and this notice disappears automatically."
        />
        <div className="rounded-3xl border border-dashed border-ink/20 bg-cream p-8 text-center">
          <p className="font-mono text-[11px] text-inksoft">auth — not deployed yet</p>
          <p className="text-[13.5px] text-inksoft leading-relaxed max-w-md mx-auto mt-3">
            Nothing to sign into yet, and no data is collected. Deploy, reload,
            and you will be able to create an account, hire Bots, and request
            your Computer from here.
          </p>
          <Link
            href="/app"
            className="inline-block mt-5 text-[13px] font-display font-medium bg-ink text-white px-5 py-2.5 rounded-lg hover:bg-accent transition-colors"
          >
            Back to your Bots
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead
        mono="account.sign-in"
        title="Sign in"
        sub="Your Bots, computer, skills and routines live behind this sign-in. Email only — no card, free in early access."
      />
      <div className="max-w-md">
        <Authenticator />
        <p className="font-mono text-[10.5px] text-inksoft mt-4">
          signed in? head to <Link href="/app" className="underline">your Bots</Link> — your profile is created on your first API call.
        </p>
      </div>
    </>
  );
}
