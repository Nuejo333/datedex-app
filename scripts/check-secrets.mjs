/**
 * @module scripts/check-secrets
 * Static public-repo security hygiene scanner verifying zero leaked secrets,
 * zero server-secret VITE_ variables, and zero password auth usage.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Runs static checks across git-tracked files and source files.
 * @returns {void}
 * @throws {Error} When a secret-hygiene or security policy violation is detected.
 */
function main() {
  const cwd = process.cwd();
  const trackedRaw = execSync('git ls-files', { cwd, encoding: 'utf8' });
  const trackedFiles = trackedRaw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const violations = [];

  for (const file of trackedFiles) {
    if (/^\.env($|\.)/.test(file) && file !== '.env.example') {
      violations.push(`Tracked env file forbidden in public repo: ${file}`);
    }
  }

  const secretPatterns = [
    { name: 'Live Stripe Secret Key', regex: /\bsk_live_[A-Za-z0-9]{16,}/ },
    { name: 'Stripe Webhook Secret', regex: /\bwhsec_[A-Za-z0-9]{16,}/ },
    { name: 'Google/Gemini API Key', regex: /\bAIza[0-9A-Za-z_-]{25,}/ },
    { name: 'Supabase Secret Key', regex: /\bsb_secret_[A-Za-z0-9_-]{16,}/ },
    {
      name: 'Client VITE_ exposure of server secret',
      regex: /\bVITE_(SUPABASE_SERVICE_ROLE_KEY|GEMINI_API_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET)\b/,
    },
  ];

  const clientOnlyForbidden = [
    { name: 'Service role key referenced in src/', regex: /SUPABASE_SERVICE_ROLE_KEY/ },
    { name: 'Password auth call forbidden by AGENTS.md', regex: /\b(signInWithPassword|updateUser\s*\(\s*\{\s*password)\b/ },
  ];

  for (const file of trackedFiles) {
    if (file === 'scripts/check-secrets.mjs') continue;
    if (/\.(png|jpg|jpeg|webp|ico|woff2|lock)$/i.test(file)) continue;

    const fullPath = resolve(cwd, file);
    let content = '';
    try {
      content = readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }

    for (const rule of secretPatterns) {
      if (rule.regex.test(content)) {
        violations.push(`${rule.name} detected in ${file}`);
      }
    }

    if (file.startsWith('src/')) {
      for (const rule of clientOnlyForbidden) {
        if (rule.regex.test(content)) {
          violations.push(`${rule.name} detected in ${file}`);
        }
      }
    }
  }

  if (violations.length > 0) {
    console.error('Security hygiene check failed:\n' + violations.map((v) => ` - ${v}`).join('\n'));
    process.exit(1);
  }

  console.log(`Secret & policy hygiene passed across ${trackedFiles.length} tracked files.`);
}

main();
