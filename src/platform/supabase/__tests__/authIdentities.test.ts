/**
 * @module platform/supabase/__tests__/authIdentities.test
 * Unit tests for Google identity detection (`user.identities` with/without
 * `provider === 'google'`), identity-linking error translation, and redirect error parsing.
 */
import { describe, expect, it } from 'vitest';
import {
  extractAuthRedirectError,
  formatLinkIdentityError,
  hasGoogleIdentity,
} from '../auth';

describe('Supabase Google identity helpers', () => {
  it('detects whether provider === "google" is present in user.identities', () => {
    expect(hasGoogleIdentity(undefined)).toBe(false);
    expect(hasGoogleIdentity(null)).toBe(false);
    expect(hasGoogleIdentity([])).toBe(false);
    expect(hasGoogleIdentity([{ provider: 'email' }])).toBe(false);
    expect(hasGoogleIdentity([{ provider: 'email' }, { provider: 'apple' }])).toBe(false);

    expect(hasGoogleIdentity([{ provider: 'google' }])).toBe(true);
    expect(hasGoogleIdentity([{ provider: 'email' }, { provider: 'google' }])).toBe(true);
  });

  it('formats identity_already_exists and manual_linking_disabled errors clearly', () => {
    const conflictMsg = formatLinkIdentityError(
      'Identity is already linked to another user',
      'identity_already_exists',
    );
    expect(conflictMsg).toMatch(/already linked to another Datédex account/i);

    const conflictByMessageOnly = formatLinkIdentityError(
      'This identity is already linked to another account',
    );
    expect(conflictByMessageOnly).toMatch(/already linked to another Datédex account/i);

    const disabledMsg = formatLinkIdentityError('Manual linking is disabled');
    expect(disabledMsg).toMatch(/Manual Linking/i);

    expect(formatLinkIdentityError('Unexpected OAuth timeout')).toBe('Unexpected OAuth timeout');
  });

  it('extracts and formats identity-linking errors from URL query or hash fragments', () => {
    expect(extractAuthRedirectError({ search: '', hash: '' })).toBeNull();

    const hashErr = extractAuthRedirectError({
      search: '',
      hash: '#error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked+to+another+user',
    });
    expect(hashErr).toMatch(/already linked to another Datédex account/i);

    const queryErr = extractAuthRedirectError({
      search: '?error=access_denied&error_description=User+canceled+Google+consent',
      hash: '',
    });
    expect(queryErr).toBe('User canceled Google consent');
  });
});
