'use client';

import Link from 'next/link';
import {
  Authenticator,
  Theme,
  ThemeProvider,
  useTheme,
  View,
  Text,
} from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import Mascot from '@/components/Mascot';

const NAVY = '#0E1B2C';
const CTA = '#2F7BFF';
const CTA_HOVER = '#1F63DA';

const theme: Theme = {
  name: 'Wayfind Auth Theme',
  tokens: {
    fonts: {
      default: {
        variable: { value: "'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif" },
        static: { value: "'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif" },
      },
    },
    colors: {
      brand: {
        primary: {
          10: { value: '#DDE9F7' },
          80: { value: CTA },
          90: { value: CTA_HOVER },
          100: { value: NAVY },
        },
      },
    },
    components: {
      authenticator: {
        router: {
          boxShadow: { value: '0 10px 40px rgba(14, 27, 44, 0.12)' },
          borderWidth: { value: '0' },
        },
      },
      button: {
        primary: {
          backgroundColor: { value: CTA },
          _hover: { backgroundColor: { value: CTA_HOVER } },
        },
        link: { color: { value: CTA } },
      },
      tabs: {
        item: {
          color: { value: '#38506B' },
          _active: { borderColor: { value: CTA }, color: { value: NAVY } },
        },
      },
    },
  },
};

function AuthHeader() {
  const { tokens } = useTheme();
  return (
    <View textAlign="center" padding={tokens.space.large}>
      <Link href="/" aria-label="Back to Wayfind Cloud home">
      <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#0E1B2C]">
          <Mascot color="white" size="xs" motion="none" label="Wayfind Cloud mascot" />
        </span>
        <span className="font-brico text-lg font-bold text-navy">Wayfind Cloud</span>
      </View>
      </Link>
      <Text color="#38506B" marginTop={tokens.space.small}>Sign in to meet your Bots.</Text>
    </View>
  );
}

function AuthFooter() {
  const { tokens } = useTheme();
  return (
    <View textAlign="center" padding={tokens.space.large}>
      <Text color={tokens.colors.neutral[80]}>Secured by AWS Cognito</Text>
    </View>
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <Authenticator
        socialProviders={['google']}
        loginMechanisms={['email']}
        components={{
          Header: AuthHeader,
          Footer: AuthFooter,
        }}
      >
        {children}
      </Authenticator>
    </ThemeProvider>
  );
}
