// Génère une paire de clés VAPID (Web Push) et l'imprime sous forme CLE=valeur (lu par activer-notifications.cmd).
import webpush from 'web-push';
const k = webpush.generateVAPIDKeys();
process.stdout.write(`VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}\n`);
