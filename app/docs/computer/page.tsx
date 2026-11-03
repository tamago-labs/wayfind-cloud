import type { Metadata } from 'next';
import Link from 'next/link';
import { Callout, DocTable, H2, P } from '@/components/docs/ui';

export const metadata: Metadata = {
  title: 'Cloud computer — Wayfind Docs',
  description: 'Your Wayfind cloud computer: isolated MicroVMs, lifecycle, workspace sync, and limits.',
};

export default function DocsComputerPage() {
  return (
    <article>
      <h1 className="font-brico text-4xl font-extrabold tracking-tight text-navy sm:text-5xl">Cloud computer</h1>
      <P>
        Every account gets one isolated cloud computer, shared by all its Bots. It&apos;s where the
        work happens: files, tools, skills, and memory live there — not on your laptop.
      </P>

      <H2 id="what-it-is">What it is</H2>
      <P>
        A very small virtual machine (a Firecracker MicroVM on AWS Lambda) with VM-level isolation
        and near-instant launch and resume. Your computer keeps its state while it sleeps, so a Bot
        can pick up exactly where it left off.
      </P>

      <H2 id="lifecycle">Lifecycle</H2>
      <P>The computer manages itself:</P>
      <DocTable
        head={['State', 'What it means']}
        rows={[
          ['Booting', 'Starting up or resuming — chat may take a few seconds to respond.'],
          ['Ready', 'Working. Bots run tools, read files, and stream results.'],
          ['Suspended', 'Asleep after idling. Wakes automatically on your next message.'],
          ['Recycling', 'Restarted fresh roughly every 8 hours. Your workspace and memory carry over.'],
        ]}
      />
      <P>
        If chat ever shows a computer error instead of recovering, starting a new message or
        reopening the app re-provisions automatically — nothing you saved is lost.
      </P>

      <H2 id="workspace">Workspace and sync</H2>
      <P>
        Each Bot works in files on the computer, and the workspace syncs to cloud storage so it
        survives restarts and recycling. Internal bookkeeping stays out of your way; what you and
        your Bots create is what persists.
      </P>
      <Callout>
        Practical limits: individual files sync up to about 25 MB, with a few thousand files per
        workspace. If something isn&apos;t syncing, check file size first.
      </Callout>

      <H2 id="settings">Settings</H2>
      <P>
        The <strong>Computer</strong> tab in Settings shows status and lets you restart or stop the
        machine. Advanced users can flip between the cloud computer and a local machine for
        development — daily work should stay on cloud so Bots keep running with the lid closed.
      </P>
      <P>
        Tools arrive through the computer&apos;s shared registry — see{' '}
        <Link href="/docs/connectors" className="font-bold text-cta hover:underline">Connectors</Link>.
      </P>
    </article>
  );
}
