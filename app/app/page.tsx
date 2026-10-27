import BotChat from '@/components/app/BotChat';
import { finders } from '@/components/landing/finders';

export default function BotsHomePage({
  searchParams,
}: {
  searchParams?: { bot?: string };
}) {
  const finder = finders.find((f) => f.id === searchParams?.bot) ?? finders[0];
  return <BotChat key={finder.id} finder={finder} />;
}
