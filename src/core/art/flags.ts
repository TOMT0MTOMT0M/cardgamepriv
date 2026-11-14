/**
 * Drapeaux nationaux dessinés au Canvas 2D (aucune image externe), pour les cartes « Monde réel » : le pays où se
 * trouve (ou se trouvait) chaque Merveille. Emblèmes simplifiés à la taille d'une étiquette (≈ 56 × 37 px).
 */
import { tData } from '../i18n';
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type CountryCode = 'EG' | 'IQ' | 'GR' | 'TR' | 'CN' | 'JO' | 'BR' | 'PE' | 'MX' | 'IT' | 'IN';

// i18n-data:début
export const COUNTRY_NAMES: Record<CountryCode, string> = {
  EG: 'Égypte', IQ: 'Irak', GR: 'Grèce', TR: 'Turquie', CN: 'Chine', JO: 'Jordanie',
  BR: 'Brésil', PE: 'Pérou', MX: 'Mexique', IT: 'Italie', IN: 'Inde',
};
// i18n-data:fin
/** (version anglaise) nom du pays imprimé sur la carte, dans la langue du moment */
export const countryName = (c: CountryCode) => tData(`country.${c}`, COUNTRY_NAMES[c]);

/** Pays de chaque Merveille (site actuel). */
export const WONDER_COUNTRY: Record<string, CountryCode> = {
  'mrv-grande-pyramide-de-kheops': 'EG',
  'mrv-jardins-suspendus-de-babylone': 'IQ',
  'mrv-statue-de-zeus-a-olympie': 'GR',
  'mrv-temple-d-artemis-a-ephese': 'TR',
  'mrv-mausolee-d-halicarnasse': 'TR',
  'mrv-colosse-de-rhodes': 'GR',
  'mrv-phare-d-alexandrie': 'EG',
  'mrv-grande-muraille-de-chine': 'CN',
  'mrv-petra-khazneh': 'JO',
  'mrv-christ-redempteur-rio': 'BR',
  'mrv-machu-picchu': 'PE',
  'mrv-chichen-itza': 'MX',
  'mrv-colisee-de-rome': 'IT',
  'mrv-taj-mahal': 'IN',
};

export function countryOf(cardId: string): CountryCode | null {
  return WONDER_COUNTRY[cardId] ?? null;
}

function star(g: Ctx, cx: number, cy: number, r: number, n = 5, inner = 0.4, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const rr = i % 2 ? r * inner : r;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

function bands(g: Ctx, x: number, y: number, w: number, h: number, cols: string[], vertical = false) {
  cols.forEach((c, i) => {
    g.fillStyle = c;
    if (vertical) g.fillRect(x + (i * w) / cols.length, y, w / cols.length + 0.5, h);
    else g.fillRect(x, y + (i * h) / cols.length, w, h / cols.length + 0.5);
  });
}

/** Dessine le drapeau `code` dans le rectangle (x, y, w, h), coins légèrement arrondis, liseré fin. */
export function drawFlag(g: Ctx, code: CountryCode, x: number, y: number, w: number, h: number, edge = 'rgba(0,0,0,0.45)', radius = Math.min(w, h) * 0.08) {
  g.save();
  g.beginPath();
  g.roundRect(x, y, w, h, radius);
  g.clip();
  const cx = x + w / 2, cy = y + h / 2;
  switch (code) {
    case 'EG': {
      bands(g, x, y, w, h, ['#ce1126', '#ffffff', '#000000']);
      g.fillStyle = '#c09300'; // aigle de Saladin, simplifié
      g.beginPath();
      g.ellipse(cx, cy, h * 0.1, h * 0.13, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(cx - h * 0.28, cy - h * 0.06);
      g.lineTo(cx, cy + h * 0.02);
      g.lineTo(cx + h * 0.28, cy - h * 0.06);
      g.lineTo(cx + h * 0.2, cy + h * 0.1);
      g.lineTo(cx - h * 0.2, cy + h * 0.1);
      g.closePath();
      g.fill();
      break;
    }
    case 'IQ': {
      bands(g, x, y, w, h, ['#ce1126', '#ffffff', '#000000']);
      g.fillStyle = '#007a3d';
      g.font = `700 ${Math.round(h * 0.22)}px "Noto Naskh Arabic", "Arial", sans-serif`; // i18n-ok
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('الله أكبر', cx, cy + h * 0.01);
      break;
    }
    case 'GR': {
      for (let i = 0; i < 9; i++) {
        g.fillStyle = i % 2 ? '#ffffff' : '#0d5eaf';
        g.fillRect(x, y + (i * h) / 9, w, h / 9 + 0.5);
      }
      const s = (h * 5) / 9;
      g.fillStyle = '#0d5eaf';
      g.fillRect(x, y, s, s);
      g.fillStyle = '#ffffff';
      g.fillRect(x, y + (s * 2) / 5, s, s / 5);
      g.fillRect(x + (s * 2) / 5, y, s / 5, s);
      break;
    }
    case 'TR': {
      g.fillStyle = '#e30a17';
      g.fillRect(x, y, w, h);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(x + w * 0.37, cy, h * 0.25, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#e30a17';
      g.beginPath();
      g.arc(x + w * 0.4, cy, h * 0.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      star(g, x + w * 0.56, cy, h * 0.12, 5, 0.38, Math.PI);
      break;
    }
    case 'CN': {
      g.fillStyle = '#ee1c25';
      g.fillRect(x, y, w, h);
      g.fillStyle = '#ffff00';
      const u = h / 20;
      star(g, x + 5 * u, y + 5 * u, 3 * u);
      for (const [sx, sy] of [[10, 2], [12, 4], [12, 7], [10, 9]]) star(g, x + sx * u, y + sy * u, u, 5, 0.4, Math.atan2(sy - 5, sx - 5) + Math.PI);
      break;
    }
    case 'JO': {
      bands(g, x, y, w, h, ['#000000', '#ffffff', '#007a3d']);
      g.fillStyle = '#ce1126';
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + w * 0.5, cy);
      g.lineTo(x, y + h);
      g.closePath();
      g.fill();
      g.fillStyle = '#ffffff';
      star(g, x + w * 0.17, cy, h * 0.1, 7, 0.45);
      break;
    }
    case 'BR': {
      g.fillStyle = '#009c3b';
      g.fillRect(x, y, w, h);
      g.fillStyle = '#ffdf00';
      g.beginPath();
      g.moveTo(cx, y + h * 0.09);
      g.lineTo(x + w * 0.92, cy);
      g.lineTo(cx, y + h * 0.91);
      g.lineTo(x + w * 0.08, cy);
      g.closePath();
      g.fill();
      g.fillStyle = '#002776';
      g.beginPath();
      g.arc(cx, cy, h * 0.25, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#ffffff';
      g.lineWidth = h * 0.05;
      g.beginPath();
      g.arc(cx - h * 0.1, cy + h * 0.55, h * 0.62, -Math.PI * 0.68, -Math.PI * 0.3);
      g.stroke();
      break;
    }
    case 'PE':
      bands(g, x, y, w, h, ['#d91023', '#ffffff', '#d91023'], true);
      break;
    case 'MX': {
      bands(g, x, y, w, h, ['#006847', '#ffffff', '#ce1126'], true);
      g.fillStyle = '#8c5a2b'; // aigle sur le nopal, simplifié
      g.beginPath();
      g.ellipse(cx, cy - h * 0.02, h * 0.11, h * 0.14, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#2e7d32';
      g.lineWidth = h * 0.035;
      g.beginPath();
      g.arc(cx, cy + h * 0.05, h * 0.18, Math.PI * 0.15, Math.PI * 0.85);
      g.stroke();
      break;
    }
    case 'IT':
      bands(g, x, y, w, h, ['#009246', '#ffffff', '#ce2b37'], true);
      break;
    case 'IN': {
      bands(g, x, y, w, h, ['#ff9933', '#ffffff', '#138808']);
      g.strokeStyle = '#000080';
      g.lineWidth = Math.max(1, h * 0.025);
      const r = h * 0.14;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      g.lineWidth = Math.max(0.5, h * 0.01);
      g.stroke();
      break;
    }
  }
  g.restore();
  // liseré + léger reflet (drapeau imprimé)
  if (radius === 0) return; // fond pleine carte : pas de liseré ni de reflet
  g.save();
  g.strokeStyle = edge;
  g.lineWidth = 1.2;
  g.beginPath();
  g.roundRect(x, y, w, h, radius);
  g.stroke();
  const gr = g.createLinearGradient(x, y, x + w, y + h);
  gr.addColorStop(0, 'rgba(255,255,255,0.18)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0)');
  gr.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = gr;
  g.beginPath();
  g.roundRect(x, y, w, h, radius);
  g.fill();
  g.restore();
}
