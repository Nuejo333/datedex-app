/**
 * @module dependency-cruiser
 * Enforces SoC-006 architectural boundaries across domain, platform, features, and api.
 */
module.exports = {
  forbidden: [
    {
      name: 'domain-no-react',
      severity: 'error',
      comment: 'src/domain must remain pure TypeScript with zero React dependency.',
      from: { path: '^src/domain' },
      to: { path: 'node_modules/react' },
    },
    {
      name: 'domain-no-outer-layers',
      severity: 'error',
      comment: 'src/domain must not import from platform, features, or app.',
      from: { path: '^src/domain' },
      to: { path: '^src/(platform|features|app)' },
    },
    {
      name: 'no-cross-feature-imports',
      severity: 'error',
      comment: 'Features must be isolated vertical slices with zero cross-feature imports.',
      from: { path: '^src/features/([^/]+)/' },
      to: {
        path: '^src/features/',
        pathNot: '^src/features/$1/',
      },
    },
    {
      name: 'no-server-sdks-in-client',
      severity: 'error',
      comment: 'Client code must never import server API routes, Stripe server SDK, or Gemini SDK.',
      from: { path: '^src/' },
      to: { path: '(^api/|node_modules/(@google/genai|stripe)/)' },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
  },
};
