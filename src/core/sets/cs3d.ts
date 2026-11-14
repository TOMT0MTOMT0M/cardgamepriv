/**
 * GÉNÉRÉ par scripts/make-cs3d.py + scripts/make-cs3d.mjs — ne pas éditer à la main.
 * Skins CS 6★ en 3D : carte → modèle (public/models/cs/<modèle>.glb) ; textures public/art/cs3d/<carte>-c.webp / -m.webp
 * (+ -n.webp, la normale, pour les gants et le sticker ; sticker : -m.webp = R holo, G rugosité, B motif du holo,
 * spectre commun art/cs3d/holo-spectre.webp).
 */
export type Cs3dModel = 'awp' | 'm4a4' | 'butterfly' | 'karambit' | 'm9' | 'talon' | 'specialist' | 'sporty' | 'sticker';

export const CS3D: Record<string, Cs3dModel> = {
  'cs-skin-4f8d99d09ded': 'awp', // AWP | Dragon Lore · cu_medieval_dragon_awp
  'cs-skin-8aacf99e7f2f': 'm4a4', // M4A4 | Howl · cu_m4a1_howling
  'cs-skin-vanilla-weapon_knife_butterfly': 'butterfly', // Butterfly Knife
  'cs-skin-51688cf28133': 'butterfly', // Butterfly Knife | Autotronic · gs_butterfly_autotronic
  'cs-skin-379727014f65': 'butterfly', // Butterfly Knife | Blue Steel · aq_blued
  'cs-skin-688d607e4dec': 'butterfly', // Butterfly Knife | Case Hardened · aq_oiled #556
  'cs-skin-6c3fbb89c658': 'butterfly', // Butterfly Knife | Crimson Web · hy_webs
  'cs-skin-da19db61f316': 'butterfly', // Butterfly Knife | Damascus Steel · aq_damascus_90
  'cs-skin-89f34e17d8b4': 'butterfly', // Butterfly Knife | Doppler · am_sapphire_marbleized_b
  'cs-skin-6656ae9270b9': 'butterfly', // Butterfly Knife | Fade · aa_fade
  'cs-skin-a07ae9bbbeff': 'butterfly', // Butterfly Knife | Gamma Doppler · am_emerald_marbleized
  'cs-skin-c14ef2ceee15': 'butterfly', // Butterfly Knife | Marble Fade · am_marble_fade #897
  'cs-skin-eae7c10fa54f': 'butterfly', // Butterfly Knife | Slaughter · am_zebra
  'cs-skin-c537f6da0a92': 'butterfly', // Butterfly Knife | Stained · aq_forced
  'cs-skin-9f5234d3821f': 'butterfly', // Butterfly Knife | Tiger Tooth · an_tiger_orange
  'cs-skin-0063b0378b5b': 'butterfly', // Butterfly Knife | Ultraviolet · so_purple
  'cs-skin-vanilla-weapon_knife_karambit': 'karambit', // Karambit
  'cs-skin-3d2a30953c01': 'karambit', // Karambit | Autotronic · gs_karam_autotronic
  'cs-skin-e7fa76b05d6f': 'karambit', // Karambit | Black Laminate · cu_karam_stonewash
  'cs-skin-648d6470a3f9': 'karambit', // Karambit | Blue Steel · aq_blued
  'cs-skin-c187005d5542': 'karambit', // Karambit | Case Hardened · aq_oiled #778
  'cs-skin-8370ef040f98': 'karambit', // Karambit | Crimson Web · hy_webs
  'cs-skin-d1da7a632cfe': 'karambit', // Karambit | Damascus Steel · aq_damascus
  'cs-skin-525ac56c082c': 'karambit', // Karambit | Doppler · am_sapphire_marbleized
  'cs-skin-657a59e6566b': 'karambit', // Karambit | Fade · aa_fade
  'cs-skin-6bd8a366ec88': 'karambit', // Karambit | Gamma Doppler · am_emerald_marbleized
  'cs-skin-d23dde6eae59': 'karambit', // Karambit | Lore · cu_karam_lore
  'cs-skin-cc03bb38269b': 'karambit', // Karambit | Marble Fade · am_marble_fade #412
  'cs-skin-818be290cd5b': 'karambit', // Karambit | Slaughter · am_zebra
  'cs-skin-672713e8a04e': 'karambit', // Karambit | Tiger Tooth · an_tiger_orange
  'cs-skin-vanilla-weapon_knife_m9_bayonet': 'm9', // M9 Bayonet
  'cs-skin-456130d33acd': 'm9', // M9 Bayonet | Autotronic · gs_m9_bay_autotronic
  'cs-skin-d335b89fc7a5': 'm9', // M9 Bayonet | Case Hardened · aq_oiled #348
  'cs-skin-34b5bf84f96f': 'm9', // M9 Bayonet | Crimson Web · hy_webs
  'cs-skin-ae0ce77b8db7': 'm9', // M9 Bayonet | Doppler · am_sapphire_marbleized
  'cs-skin-68778cfbe46d': 'm9', // M9 Bayonet | Fade · aa_fade
  'cs-skin-8f49a19645c9': 'm9', // M9 Bayonet | Gamma Doppler · am_emerald_marbleized
  'cs-skin-fd0ac7570eb0': 'm9', // M9 Bayonet | Marble Fade · am_marble_fade #763
  'cs-skin-07fea33b6a5f': 'm9', // M9 Bayonet | Slaughter · am_zebra
  'cs-skin-3bc3ff53883a': 'm9', // M9 Bayonet | Tiger Tooth · an_tiger_orange
  'cs-skin-8e3dc7a7458c': 'm9', // M9 Bayonet | Urban Masked · sp_tape_urban
  'cs-skin-ae7ba223bf1f': 'talon', // Talon Knife | Doppler · am_sapphire_marbleized
  'cs-skin-5766610447f3': 'specialist', // Specialist Gloves | Crimson Kimono · specialist_kimono_diamonds_red
  'cs-skin-b05ee2bf4f0d': 'sporty', // Sport Gloves | Hedge Maze · sporty_green
  'cs-skin-e506270deff6': 'sporty', // Sport Gloves | Pandora's Box · sporty_purple
  'cs-sticker-74': 'sticker', // Reason Gaming (Holo) | Katowice 2014
};

/** modèles qui ont une 3e texture (normale) : public/art/cs3d/<carte>-n.webp */
export const CS3D_NORMAL: ReadonlySet<Cs3dModel> = new Set(['specialist', 'sporty', 'sticker']);

/** dimensions (plus grande = 1) et triangles de chaque modèle */
export const CS3D_MODELS: Record<Cs3dModel, { size: [number, number, number]; tris: number }> = {"awp":{"size":[0.085,0.188,1],"tris":21916},"m4a4":{"size":[0.087,0.321,1],"tris":18156},"butterfly":{"size":[0.059,1,0.172],"tris":11996},"karambit":{"size":[0.074,1,0.783],"tris":13938},"m9":{"size":[0.086,1,0.277],"tris":10124},"talon":{"size":[0.085,1,0.764],"tris":6824},"specialist":{"size":[0.71,1,0.547],"tris":15350},"sporty":{"size":[0.719,1,0.626],"tris":9900},"sticker":{"size":[1,1,0.008],"tris":12}};
