const serverFiles = [
  "apps/server/server/{bureaucracy,cloud,credential-vault,endfield,responses,shared-cloud-budget,web-search}.js",
  "apps/server/server/cmf/**/*.js",
  "apps/server/server/importers/srt.js",
  "apps/server/server/lib/{cloud-route,fetch}.js",
  "apps/server/server/routes/{bureaucracy-captions,cloud-*,cmf-*,draft-thesis,endfield-ask,search-answer,subtitles-translate}.js",
  "apps/server/server/security/public-session.js",
];

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "apps/desktop/app.bundle.js",
      "apps/desktop/styles.bundle.css",
    ],
  },
  {
    files: serverFiles,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
    },
    rules: {
      "no-shadow": "error",
      "no-redeclare": "error",
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-unsafe-finally": "error",
      "require-await": "error",
    },
  },
  {
    files: ["tests/integration/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-shadow": "error",
      "no-redeclare": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-unsafe-finally": "error",
      "require-await": "error",
    },
  },
];
