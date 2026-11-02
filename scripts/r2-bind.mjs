/**
 * Branche le bucket R2 des images sur le site Pages (binding ART lu par functions/art/[[path]].js), dans wrangler.jsonc.
 * Lancé par activer-r2.cmd une fois le bucket créé et rempli (avant, un binding vers un bucket absent ferait échouer
 * le déploiement). Sans effet s'il est déjà là.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const f = 'wrangler.jsonc';
const src = readFileSync(f, 'utf8');
if (src.includes('"r2_buckets"')) {
  console.log('wrangler.jsonc : bucket déjà branché');
  process.exit(0);
}
const i = src.lastIndexOf('}');
const body = src.slice(0, i).trimEnd();
const out = `${body}${body.endsWith(',') ? '' : ','}\n  // images du jeu (public/art) servies depuis R2 par functions/art/[[path]].js — scripts/r2-sync.mjs les envoie\n  "r2_buckets": [{ "binding": "ART", "bucket_name": "cardgamepriv-art" }]\n}\n`;
writeFileSync(f, out);
console.log('wrangler.jsonc : bucket cardgamepriv-art branché (binding ART)');
