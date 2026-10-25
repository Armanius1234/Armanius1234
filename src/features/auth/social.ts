/**
 * Sign in with Apple / Google through Supabase Auth.
 *
 * - Apple (iPhone only): the native Apple sheet (Face ID), then the Apple ID
 *   token is checked by Supabase.
 * - Google: Google's sign-in page in a secure browser tab, then back to the app
 *   via pl8://auth/callback (PKCE code exchange).
 *
 * New social accounts must confirm 18+ and accept the terms in the app before
 * they can do anything (enforced in the database).
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

export type SocialProvider = 'apple' | 'google';
export type SocialResult = 'signed_in' | 'cancelled';

export class SocialSignInError extends Error {
  override name = 'SocialSignInError';
}

/** Which buttons to show. */
export function availableProviders(
  os: string = Platform.OS,
  flags: { apple: boolean; google: boolean } = { apple: env.authApple, google: env.authGoogle },
): SocialProvider[] {
  if (os !== 'ios' && os !== 'android') return [];
  const list: SocialProvider[] = [];
  // Apple only on iPhone (native sheet). On Android it would need a web setup
  // whose secret expires every 6 months; Android users have Google and email.
  if (flags.apple && os === 'ios') list.push('apple');
  // App Store rule 4.8: an iPhone app that offers Google sign-in must offer Apple too.
  if (flags.google && (os !== 'ios' || flags.apple)) list.push('google');
  return list;
}

export function oauthRedirect(): string {
  return Linking.createURL('auth/callback');
}

/** Finishes a browser sign-in from the URL the provider sent back. */
export async function completeOAuthFromUrl(url: string): Promise<SocialResult> {
  const parsed = new URL(url);
  const query = new URLSearchParams(parsed.search);
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const providerError = query.get('error') ?? hash.get('error');
  if (providerError === 'access_denied') return 'cancelled';
  if (providerError) throw new SocialSignInError(providerError);

  const code = query.get('code');
  if (!code) throw new SocialSignInError('missing_code');
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // On Android the deep link can arrive twice; the first exchange wins.
    const { data } = await supabase.auth.getSession();
    if (data.session) return 'signed_in';
    throw error;
  }
  return 'signed_in';
}

async function signInWithBrowser(provider: SocialProvider): Promise<SocialResult> {
  const redirectTo = oauthRedirect();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new SocialSignInError('missing_url');
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return 'cancelled';
  return completeOAuthFromUrl(result.url);
}

async function signInWithAppleNative(): Promise<SocialResult> {
  // Apple gets the hashed nonce, Supabase the raw one, so the token can't be replayed.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return 'cancelled';
    throw e;
  }
  if (!credential.identityToken) throw new SocialSignInError('missing_token');
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;
  // Apple shares the name only on the very first sign-in: keep it to prefill the profile.
  const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
  if (name) await supabase.auth.updateUser({ data: { full_name: name } });
  return 'signed_in';
}

export async function signInWithProvider(provider: SocialProvider): Promise<SocialResult> {
  if (provider === 'apple' && Platform.OS === 'ios') return signInWithAppleNative();
  return signInWithBrowser(provider);
}

/** How the signed-in account logs in: 'email' or a social provider. */
export function accountProvider(appMetadata: { provider?: unknown } | undefined): 'email' | SocialProvider {
  const p = appMetadata?.provider;
  return p === 'apple' || p === 'google' ? p : 'email';
}
