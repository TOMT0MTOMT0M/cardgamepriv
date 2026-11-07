declare var process: {
  env: Record<string, string | undefined>;
};

/** (ouverture 07/11) le peu de `node:crypto` utilisé par convex/pwAuth.ts (fichier « use node ») — sans @types/node */
declare module 'node:crypto' {
  interface NodeBytes extends Uint8Array {
    toString(encoding?: 'base64'): string;
  }
  export function randomBytes(size: number): NodeBytes;
  export function scryptSync(password: string, salt: Uint8Array, keylen: number, options: { N: number; r: number; p: number }): NodeBytes;
  export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
}
