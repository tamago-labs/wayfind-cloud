'use client';

export type MascotColor = 'amber' | 'moss' | 'lagoon' | 'ash' | 'white';
export type MascotSize = 'xs' | 'sm' | 'md' | 'lg';
export type MascotMood = 'open' | 'happy' | 'sleepy';
export type MascotBlink = 'calm' | 'sleepy' | 'off';
export type MascotMotion = 'bob' | 'float' | 'none';

export interface MascotProps {
  color?: MascotColor;
  size?: MascotSize;
  mood?: MascotMood;
  blink?: MascotBlink;
  motion?: MascotMotion;
  /** Wiggle the blob once on hover. */
  wiggleOnHover?: boolean;
  /** Stagger loops when several mascots share a row, e.g. `-${i * 1.4}s`. */
  blinkDelay?: string;
  className?: string;
  /** Accessible label; decorative (aria-hidden) when omitted. */
  label?: string;
}

const colorMap: Record<MascotColor, string> = {
  amber: 'bg-bamber',
  moss: 'bg-bmoss',
  lagoon: 'bg-blagoon',
  ash: 'bg-bash',
  white: 'bg-white',
};

const sizeMap: Record<MascotSize, string> = {
  xs: 'h-6 w-[22px]',
  sm: 'h-9 w-8',
  md: 'h-12 w-11',
  lg: 'h-[72px] w-16',
};

const motionMap: Record<MascotMotion, string> = {
  bob: 'animate-mascot-bob',
  float: 'animate-floaty',
  none: '',
};

const blinkMap: Record<MascotBlink, string> = {
  calm: 'animate-mascot-blink',
  sleepy: 'animate-mascot-blink-slow',
  off: '',
};

/**
 * Wayfind mascot blob (from wayfind-hero-design.html `.bot`).
 * Blob shape + eye geometry use % units so every size scales cleanly.
 */
export default function Mascot({
  color = 'amber',
  size = 'md',
  mood = 'open',
  blink = 'calm',
  motion = 'none',
  wiggleOnHover = false,
  blinkDelay = '0s',
  className = '',
  label,
}: MascotProps) {
  const blinkCls = mood === 'open' ? blinkMap[blink] : '';

  const eyes =
    mood === 'happy' ? (
      <>
        <span className="absolute top-[42%] left-[22%] h-[10%] w-[24%] rounded-full bg-navy rotate-[25deg]" />
        <span className="absolute top-[42%] right-[22%] h-[10%] w-[24%] rounded-full bg-navy -rotate-[25deg]" />
      </>
    ) : mood === 'sleepy' ? (
      <>
        <span className="absolute top-[46%] left-[22%] h-[7%] w-[26%] rounded-full bg-navy" />
        <span className="absolute top-[46%] right-[22%] h-[7%] w-[26%] rounded-full bg-navy" />
      </>
    ) : (
      <>
        <span
          className={`absolute top-[40%] left-[30%] h-[14%] w-[11%] rounded-full bg-navy ${blinkCls}`}
          style={blinkCls ? { animationDelay: blinkDelay } : undefined}
        />
        <span
          className={`absolute top-[40%] right-[30%] h-[14%] w-[11%] rounded-full bg-navy ${blinkCls}`}
          style={blinkCls ? { animationDelay: blinkDelay } : undefined}
        />
      </>
    );

  return (
    <span
      className={`group relative inline-block ${motionMap[motion]}`}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <span
        className={`relative block ${sizeMap[size]} rounded-[46%_46%_36%_36%] ${colorMap[color]} ${
          wiggleOnHover ? 'group-hover:animate-mascot-wiggle' : ''
        } ${className}`}
      >
        {eyes}
      </span>
    </span>
  );
}
