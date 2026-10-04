// TypeScript 6 type-checks side-effect imports (noUncheckedSideEffectImports
// is on by default), so `import "@/styles/globals.css"` needs a declaration.
// Next.js bundles the CSS; the import has no value to type.
declare module "*.css";
