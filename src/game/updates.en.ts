/** English patch notes (same order and structure as updates.data.ts : month → entries → points). Loaded only in English (views/infos.ts). */
import type { UpdateMonth } from './updates.data';

export const UPDATES_EN: UpdateMonth[] = [
  {
    month: 'November 2026',
    entries: [
      {
        date: '14 Nov', title: '🚀 Version 2: the biggest update yet', tag: 'nouveau', featured: true,
        lead: 'Your collection is safe: cards, coins, boosters, achievements, binders – nothing was lost. And to celebrate: 🎁 50 free boosters for everyone.',
        points: [
          '💬 Chat: the lounge for everyone and private messages. Type @ and the first letter of a name to mention someone: they get a notification.',
          '🛒 Market: sell a card at a fixed price in coins or put it up for trade, right in “For you”. Buy other players’ cards: first to buy gets it.',
          '🤝 Trades: under each card, see who has it, who sells it, who wants it and its average price. “For you” sets up ready-made trades from your wishes, in one tap.',
          '🏆 Seasons: every month, a ranking of the new cards you win, with boosters for everyone at the end. The first one ends on 30 November.',
          '⏳ Booster of the moment: a limited edition, with its countdown at the top of the shop.',
          '🪙 Boosters for coins: buy as many as you want, still 250 coins each.',
          '🃏 New cards: over 3,000 more, {CARTES} to collect.',
          '✨ 6★ cards: each has its own staging, 6★ Music and anime cards play their clip, and nearly all are full art.',
          '🎲 Games: Pack Battle, Battle Royale and the Roulette, with its wheel, a replay of the draw and a reminder 10 min before.',
          '🎖️ Achievements: as badges, “2/7” and your progress; one tap shows what you’re missing.',
          '📊 Leaderboard: your rank, and what you need to pass the player just above you.',
          '🔊 Sound and opening: brand-new, softer sound and a more real booster tear.',
          '🔔 Notifications: full reserve, trades, friends, chat. On iPhone, add the game to your home screen first.',
          '🌍 English: the game switches to English on its own if your phone or PC isn’t in French (FR | EN button next to the sound).',
        ],
      },
      {
        date: '14 Nov', title: 'v2.0.1: launch touch-ups', tag: 'amélioré',
        points: [
          'Card viewer: “Replay” at the top, buttons tidied under the card, and they fade out when you zoom.',
          'Collection: the filter bar stays stuck at the top when you scroll.',
          'General chat: messages only, drops stay in Big pulls.',
          'Images: 95 more 6★ cards in full art.',
          'English: the big pulls time and a few tabs were displayed wrong, now fixed.',
        ],
      },
      {
        date: '13 Nov', title: 'Fixes: Star Wars and The Mandalorian, Oner and ShowMaker, new images', tag: 'corrigé',
        points: [
          'Star Wars and The Mandalorian: Grogu, the Mandalorian, Cobb Vanth and Koska Reeves move to The Mandalorian album.',
          'Oner and ShowMaker are now 6★.',
          'New images: Iron Man reframed, 15 The Walking Dead cards, Will Smith, Captain America, Winter Soldier, Scarlet Witch, Joey Tribbiani, Jeff Tuche, Rex, Ben 10, ZywOo, Oner, ShowMaker, Dembélé, Fernando Alonso, Ballon d’Or, LaLiga, Zelda, Alan Wake II, PNL, Idol and more.',
        ],
      },
      {
        date: '12 Nov', title: 'More full-art 6★ cards, new images and the real booster rates', tag: 'amélioré',
        points: [
          'Full art: 208 6★ cards whose photo used to sit in a strip now fill the whole frame (photos cropped on the face; covers, cars and groups kept whole on a background taken from the image).',
          'New images for 77 cards: Gojo, Kaneki, Aizen, Byakuya, Lelouch, Minato, Shikamaru, Mulan, Neo, John Wick, Indiana Jones, Louis de Funès, François Pignon, Pierre Brochant, Perceval, Arthur (Kaamelott), Kanye West, Orelsan, Stevie Wonder, One Direction, Thomas Müller, Gerrard, Kanté, Neuer, s1mple, apEX, Keria, Neon, Tracer, Sephiroth, Heineken, the Nissan GT-R, the Skyline R34…',
          'Norman fait des vidéos has been removed from the game.',
          'Booster sheet: the real rates. Per-card percentages now add up exactly (100% in total), the god pack and the pity are counted in (6★: 1 booster in 38.6), so is each card’s chance, and the World Pack shows the chance of its secret Wonders.',
          'The card count shown now follows the real catalogue: {CARTES} cards to collect (locked Bébous are no longer counted).',
          'Clips: American Idiot finally plays American Idiot (it was 21 Guns), Pump It and Bande organisée play the right track, and Francis Poulenc has his own. 20 songs also have the right artist printed (Bad → Michael Jackson, Someone Like You → Adele…).',
        ],
      },
      {
        date: '12 Nov', title: 'The new 6★ Music cards have their clip', tag: 'nouveau',
        points: [
          'Songs, artists and albums that moved up to 6★ now play their 30 s clip when you draw them and in the viewer.',
        ],
      },
      {
        date: '11 Nov', title: 'Pop Culture and Sport: 3,024 new cards', tag: 'nouveau',
        points: [
          'Anime: 1,843 new characters in the series already in the game (Toji Fushiguro, Himiko Toga, Bokuto, Akaza, Escanor, Echidna, Dabi…), from 1★ to 4★.',
          'Music: 1,136 new songs by artists already in the game, from 1★ to 4★.',
          'Sport: 45 Ligue 1 players (Kvaratskhelia, Désiré Doué, João Neves, Lucas Hernandez…).',
          '5★ and 6★ cards don’t change: the collection is simply fuller.',
        ],
      },
      {
        date: '11 Nov', title: 'Trades reworked, booster of the moment and seasons', tag: 'nouveau',
        points: [
          'Trades: under each card, see who has it, who is selling it and who wants it. “For you” sets up ready-made trades based on your wishes: you ask in one tap, then the other player accepts, picks another card or declines. Your “Protect” button keeps a card out of suggestions.',
          'Booster of the moment: a limited-edition booster, with its countdown at the top of the shop.',
          'Seasons: every month, a ranking of the new cards you win, boosters for everyone at the end, and a frame and a title for the podium.',
          'Opening animations to unlock: the burn (Ember achievement) and the fan (Cartographer achievement), to pick from a booster’s sheet.',
          'Also: cards you don’t own show their blurred artwork, gloves and a 3D CS 6★ sticker, apostles in the Eclipse, new sounds for 6★ cards, and a collection that updates faster.',
        ],
      },
      {
        date: '11 Nov', title: '56 songs in 6★, Finn from Adventure Time', tag: 'nouveau',
        points: [
          'New 6★: Give Me the Night, Temperature, Plus près des étoiles, Caravane, Le Temps des cathédrales, Je ne suis pas un héros, Laisse pas traîner ton fils, Gravé dans la roche, Suicide social, Le monde ou rien, Mosaïque solitaire, Avant la douane, and the great classics (Für Elise, Swan Lake, Ride of the Valkyries…).',
          'Anime openings in 6★: Unravel, KICK BACK, Kaikai Kitan, Guren no Yumiya, Sign, crossing field, Peace Sign, Idol, Black Rover, Brave Shine, Snow Fairy, Fly High!! and more.',
          'Moving up to 6★: Locked Out of Heaven, Take on Me, Wonderwall, In the End, Dream On, Every Breath You Take, Californication, L’Aziza, Ne me quitte pas, Petite Marie, La Boulette… Every 6★ plays its clip.',
          'Finn the Human (Adventure Time) arrives in 6★. Gérard Depardieu has been removed from the game.',
        ],
      },
      {
        date: '11 Nov', title: '3D CS 6★ skins and the Eclipse for Berserk', tag: 'nouveau',
        points: [
          'In the viewer, Counter-Strike 6★ skins appear in 3D inside the card: the camera zooms in, then your finger, mouse or gyroscope turns the weapon.',
          'Berserk 6★ cards have their own animation, the Eclipse, both on opening and in the viewer.',
        ],
      },
      {
        date: '11 Nov', title: 'New star sort: Pop Culture, World and Sport', tag: 'amélioré',
        points: [
          'Pop Culture: 530 cards go up in stars, 335 of them moving to 6★ (Leonardo DiCaprio, Morgan Freeman, Louis de Funès, Bruce Lee, Asterix and Obelix, the Bleach captains, Blue Lock…).',
          'World: 75 cards change stars (Paris, Heineken and the Nissan GT-R move to 6★, for example).',
          'Sport: 287 cards change stars (Ousmane Dembélé, T1 and Rey Mysterio move to 6★). Antoine Dupont, Tadej Pogačar, Naoya Inoue and Hikaru Nakamura leave 6★.',
          'Cards you’ve already drawn follow automatically: collection, showcase, trades and ongoing announcements.',
        ],
      },
      {
        date: '11 Nov', title: '37 5★ and 6★ cards with a better image', tag: 'corrigé',
        points: [
          'New images for Eminem, Bruno Mars, Chris Brown, Charles Aznavour, Allumer le feu, Tchikita, Mon fils ma bataille, Iron Man, Hulk, Han Solo, Yoda, the Joker, Ron Weasley, Michael Scofield, Fernand Naudin, Jess Day and Jayce.',
          'Anime: Ichigo, Kisuke Urahara, Eren, Giyuu, Shikamaru, Ippo, Aquamarine, Yuno Gasai, Exodia and the Blue-Eyes White Dragon.',
          'Sport: Zidane, Deschamps, Alex Ferguson, Kobe Bryant, Evander Holyfield, Bugha, Footix and WrestleMania. Plus Ratchet and the Maki.',
        ],
      },
      {
        date: '11 Nov', title: 'Sport Pack: 278 new Sport & Esport cards', tag: 'nouveau',
        points: [
          'Esport: new pro players from League of Legends (old and new), Counter-Strike, Valorant, Call of Duty, Apex Legends (Zer0 6★, Reps, Yulariman and Blinkzr 5★) and Fortnite.',
          'Sport: Lin Dan (6★), Lee Chong Wei, Gao Ling and Carolina Marín (Badminton); Shohei Ohtani (6★), Aaron Judge and Bobby Witt Jr. (Baseball); Shai Gilgeous-Alexander (Basketball); Félix and Alexis Lebrun (6★, Table Tennis); Luke Littler (6★), Luke Humphries and Gian van Veen (Darts); The Rock (6★, Wrestling); Remco Evenepoel and Paul Seixas (Cycling); Efren Reyes and Raymond Ceulemans (Billiards).',
          'Moving up to 6★: Antoine Dupont (Rugby), Tadej Pogačar (Cycling), Naoya Inoue (Boxing) and Hikaru Nakamura (Chess) – cards already drawn follow automatically.',
        ],
      },
      {
        date: '10 Nov', title: 'Hugo’s feedback: the Market, bigger cards, faster opening', tag: 'nouveau',
        points: [
          'New Market in Trades: put a card up for sale at a fixed price in coins, and buy other players’ cards in one move (no auctions: first to buy gets it).',
          'Trades in three clear tabs: Market, With a friend, Offers.',
          'Opening: “Direct 4★” goes straight to your first 4★ (or opens the whole booster if there isn’t one), without scrolling through the others; the tear is much quieter.',
          'The pity at the top right now only moves once the booster is finished: no more spoilers.',
          'Contracts: 10 cards for each star level, from 1★ to 5★.',
          'Collection: bigger cards, fewer per row. And you can see other players’ full collections from their profile.',
          'Round shapes and the round font are back on boosters, with touches of colour.',
          'All 5★ cards are full art; anime 6★ cards play their anime’s opening, and the missing clips for 6★ Music have arrived (Au DD…).',
        ],
      },
      {
        date: '10 Nov', title: 'The whole game moves to the Games area style', tag: 'amélioré',
        points: [
          'Collection, Trades, Ranking, Achievements, Friends, Profile, Suggestions: same look as the Games area – black, fine lines, square corners, corner marks.',
          'Big page titles, uppercase labels, more readable text (especially on phones).',
          'Buttons, tabs, menus and windows are identical from page to page. Cards, boosters and the opening don’t change.',
        ],
      },
      {
        date: '10 Nov', title: 'New sound: softer, closer, more precise', tag: 'amélioré',
        points: [
          'All the everyday sounds are redone with “materials”: cardboard, felt, wood, crumpled foil – no more shrill beeps.',
          'Everything you touch answers with a small, muffled “tock”, placed right where you touch.',
          'Whooshes follow the speed of the animations, and impacts land exactly on the frame.',
          'Lighter on phones: sounds are built once at launch, then simply replayed.',
        ],
      },
      {
        date: '10 Nov', title: 'Profile: drag-and-drop showcase, clearer page', tag: 'amélioré',
        points: [
          'Showcase: tap a card in your collection to add it, tap it again to remove it. Drag it onto a slot to place it, drag showcase cards to reorder them, or out of the showcase to remove them (on a phone: hold the card, then drag).',
          'While you choose, the showcase stays at the top of the screen; “Auto-fill” fills the empty slots with your best cards.',
          'Tidier profile dashboard: three key figures, then Activity, Collection, Rarities and Universes, with a colour code (blue = progress, green = activity, gold = achievements, rainbow = 6★).',
        ],
      },
      {
        date: '10 Nov', title: 'Your suggestions handled faster', tag: 'amélioré',
        points: [
          'Tom and Hugo have a new tool to read your suggestions and reported cards, and to sort out your issues (missing boosters, referral, blocked trade) in seconds. Keep reporting everything in the Suggestions tab!',
        ],
      },
      {
        date: '10 Nov', title: 'Always the latest version', tag: 'amélioré',
        points: [
          'When an update is released, the game updates itself the next time you reopen it (or come back to it), even when installed on your home screen. Never during a booster opening, and you stay logged in.',
          'Display issue? Profile menu → “Repair and update”: the game clears its caches and reloads the latest version.',
        ],
      },
      {
        date: '10 Nov', title: 'Ranking fixed', tag: 'corrigé',
        points: [
          'The ranking had stopped showing since collections grew so much: it’s back, and opens faster.',
          'Your row is up to date as soon as you open the ranking; other players’ rows refresh every 5 minutes.',
        ],
      },
      {
        date: '10 Nov', title: 'Survey: you choose what comes next', tag: 'nouveau',
        points: [
          'A one-minute survey opens when you log in: the universes you want to collect, the new game features that tempt you, your rating of the game and a free comment. The answers decide what arrives first.',
          '“Later” closes it: it comes back an hour later, until it’s filled in.',
        ],
      },
      {
        date: '10 Nov', title: '6★ cards: their scene everywhere', tag: 'amélioré',
        points: [
          'Opening a 6★ card in Collection, Trades, Contracts, Profile or Big draws replays the scene of its family (cartridge, vinyl, manga panel, tunnel…), then the card flips. One tap skips the scene; “Replay” runs the full version again.',
          'All 26 scenes have been reworked: the scene’s card is the real brushed-aluminium back, it blends into the card seamlessly, and the text is more readable on phones.',
        ],
      },
      {
        date: '10 Nov', title: 'Berserk: six new cards', tag: 'nouveau',
        points: [
          'Six new Berserk cards beyond the Golden Age, in the Pop Culture booster: Femto, the Skull Knight and Guts (Berserker Armour) in 6★, Schierke, Farnese and Serpico in 5★.',
          'The Eclipse: a booster hiding a 5★ or 6★ Berserk card gives itself away – its glow turns blood red, then, once opened, the black sun rises over a lake while “Behelit” plays in the background.',
        ],
      },
      {
        date: '9 Nov', title: 'Trades: “Accept” fixed, and find who has a card', tag: 'nouveau',
        points: [
          'The “Accept” button on a received trade works first time (you sometimes had to tap the thin balance bar in the middle first).',
          'Trades → “Find a card”: search for any card in the game, then “Who has it?” shows the players who own it and how many spares they have. “Trade” opens the trade with the card already requested: all that’s left is to choose what you give.',
          'Collection: “Find an owner” on a card’s sheet, and tapping a card you’re missing directly shows who has it.',
          'More flexible card search everywhere: several words in any order (“pikachu pokemon”, “messi foot”), ignoring accents and apostrophes, the universe or artist, the number, or “6★” for stars.',
        ],
      },
      {
        date: '8 Nov', title: 'God pack, trades fixed and everything that has changed since V1', tag: 'nouveau',
        points: [
          'GOD PACK: 1 booster in 1,000 is a god pack. Only 4★ cards and above, at least one 5★ and one 6★, and its own animation on opening. The whole gang is notified when someone opens one.',
          'Trades: the “Accept” button on a received trade works again (it had become unreadable and didn’t always respond). It now opens a “Yes, trade” confirmation that stays on screen, and if the trade gets stuck, the reason stays written in the trade.',
          'Faces: over 600 cards recropped so the whole face is visible, and no longer hidden under the name.',
          'Patrick Bruel and everything related to him (his songs, Le Prénom) have been removed from the game.',
          'Pack Battle: draws twice as slow, the two cards of the draw shown large in the centre, and both columns the same size at the end.',
          'Battle Royale: you can wager from 1 to 5 boosters, the same number for everyone. The total stars of all your cards break the tie.',
          '“Image to review”: a button in every viewer (collection, profile, trades, contracts, opening) to report a broken or missing image in one tap.',
          'New artwork for 27 5★ and 6★ cards (Michael Jordan, Usain Bolt, Altaïr, Ciri, Edward Elric…).',
          'Cards that had no real image have been removed from the game (5★ and 6★ stay while we find them one).',
          'Rarities revised: some stars mostly known outside Europe and the United States drop in stars.',
          'Pitbull: the clip played is now “International Love”.',
          'Discord: drawn 6★ and secret cards are announced there with the card shown face up, large, and the player’s name. Logged in with Discord? You automatically get the “Card” role on the server.',
        ],
      },
      {
        date: '7 Nov', title: 'Version 1 – Bébou Cartes', tag: 'nouveau',
        points: [
          'Season 1: everyone starts from zero. Sign up with Discord or a simple nickname, 15 free boosters and double recharge during your first 24 hours.',
          'The roulette starts with a base pot: coins and a 6★ card gifted by the club.',
          '{CARTES} cards to collect across 4 themes – Gaming, Pop Culture, Sport and World – plus secret cards.',
          '5 boosters (Bebou, Gaming, Popculture, Sport, World), 1 free booster every 5 minutes (up to 15 in reserve), openings by 5 or 10.',
          'Collection by families and albums, binders, the forge and Contracts to turn your duplicates into something new.',
          'Direct trades between friends and an offer board open to everyone.',
          'Tiered achievements: every tier comes with a reward – coins, boosters, titles, badges or animated frames.',
          'Customisable profile, ranking, friends and referral, Games area.',
          'One big update a month: new cards, new features. Everything will be announced here.',
        ],
      },
    ],
  },
];
