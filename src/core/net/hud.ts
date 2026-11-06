import { net, type NetState } from './client';
import { RARITY_BY_ID } from '../rarity';

/**
 * Mounts the online infrastructure HUD pill (Discord Auth, Pack Balance,
 * Daily Booster Claim, and Live 20-Friend Feed Popover) into the main toolbar.
 */
/** Cartes uniques / au total (avant : calculées par le serveur dans users.me, qui relisait tout l'inventaire). */
function cardCounts(state: NetState) {
  return { uniqueCards: new Set(state.collection.map((c) => c.cardId)).size, totalCards: state.collection.reduce((sum, c) => sum + c.count, 0) };
}

export function mountNetHud(toolbar: HTMLElement, stage: HTMLElement) {
  // ce HUD affiche le fil d'activité complet (le jeu, lui, ne s'y abonne qu'en repli des gros tirages)
  net.watchFeed();
  const wrap = document.createElement('div');
  wrap.className = 'net-hud';

  const popover = document.createElement('div');
  popover.className = 'net-popover hidden';
  stage.append(popover);

  let popoverOpen = false;

  const togglePopover = () => {
    popoverOpen = !popoverOpen;
    popover.classList.toggle('hidden', !popoverOpen);
    render(net.state);
  };

  function render(state: NetState) {
    wrap.innerHTML = '';

    if (!state.configured) {
      const pill = document.createElement('button');
      pill.className = 'btn net-pill offline';
      pill.title = 'Ajoute VITE_CONVEX_URL dans .env.local pour activer le mode en ligne (Convex + Discord)';
      pill.textContent = '⚡ Hors-ligne (Lab)';
      pill.addEventListener('click', togglePopover);
      wrap.append(pill);

      popover.innerHTML = `
        <div class="net-pop-head">
          <strong>Infrastructure Convex + Discord</strong>
          <button class="btn net-close">✕</button>
        </div>
        <div class="net-pop-body">
          <p>Le client temps réel est prêt. Pour connecter le serveur :</p>
          <ol>
            <li>Lance <code>npx convex dev</code> dans le terminal</li>
            <li>Ajoute <code>DISCORD_CLIENT_ID</code> et <code>DISCORD_CLIENT_SECRET</code> dans Convex</li>
            <li>Recharge la page : le bouton <b>Connexion Discord</b> s'activera automatiquement.</li>
          </ol>
          <div class="net-hint">Voir <code>docs/INFRASTRUCTURE.md</code> pour le guide complet.</div>
        </div>
      `;
      popover.querySelector('.net-close')?.addEventListener('click', togglePopover);
      return;
    }

    const onlineCount = state.friends.filter((f) => f.online).length;

    if (!state.user) {
      const discordBtn = document.createElement('button');
      discordBtn.className = 'btn net-pill discord-btn';
      discordBtn.title = 'Se connecter avec Discord (accès réservé aux 20 amis)';
      discordBtn.innerHTML = `🔗 Connexion Discord`;
      discordBtn.addEventListener('click', () => net.loginWithDiscord());
      wrap.append(discordBtn);

      if (state.authError) {
        const errSpan = document.createElement('span');
        errSpan.className = 'btn net-err';
        errSpan.textContent = `⚠️ ${state.authError}`;
        wrap.append(errSpan);
      }
    } else {
      const u = state.user;

      if (u.canClaimDaily) {
        const claimBtn = document.createElement('button');
        claimBtn.className = 'btn net-pill daily-btn on';
        claimBtn.title = 'Réclamer tes 2 boosters gratuits (toutes les 12h)';
        claimBtn.textContent = '🎁 +2 Boosters';
        claimBtn.addEventListener('click', async () => {
          claimBtn.disabled = true;
          try {
            await net.claimDailyBooster();
          } catch (e) {
            alert((e as Error).message);
          } finally {
            claimBtn.disabled = false;
          }
        });
        wrap.append(claimBtn);
      }

      const userBtn = document.createElement('button');
      userBtn.className = 'btn net-pill user-btn';
      const { uniqueCards, totalCards } = cardCounts(state);
      userBtn.title = `${u.displayName} · ${uniqueCards} cartes uniques (${totalCards} au total) · Cliquer pour ouvrir le Club (${onlineCount} en ligne)`;
      const avatarHtml = u.avatarUrl ? `<img src="${u.avatarUrl}" class="net-ava" alt="" />` : '👤';
      userBtn.innerHTML = `${avatarHtml} <span>${u.displayName}</span> <span class="net-pack">📦 ${u.packBalance}</span> <span class="net-online">🟢 ${onlineCount}/${state.friends.length || 1}</span>`;
      userBtn.addEventListener('click', togglePopover);
      wrap.append(userBtn);
    }

    // Render Popover content (Friends online + Live Activity Feed)
    const friendsHtml =
      state.friends
        .map(
          (f) => `
        <div class="net-friend">
          <span class="dot ${f.online ? 'on' : ''}"></span>
          <span class="name">${f.displayName}</span>
          <span class="meta">${f.statusText ?? `${f.totalPacksOpened} packs`}</span>
        </div>`,
        )
        .join('') || '<div class="net-empty">Aucun joueur inscrit</div>';

    const feedHtml =
      state.feed
        .slice(0, 10)
        .map((item) => {
          const rar = item.rarity ? RARITY_BY_ID[item.rarity] : null;
          const badge = rar
            ? `<span class="net-rar" style="color:${rar.accentHex};border-color:${rar.hex}">${rar.glyph} ${rar.label}${item.mintNumber ? ` #${item.mintNumber}` : ''}</span>`
            : '';
          return `<div class="net-feed-item"><div>${item.message}</div>${badge}</div>`;
        })
        .join('') || '<div class="net-empty">Aucun tirage récent</div>';

    popover.innerHTML = `
      <div class="net-pop-head">
        <strong>Club Privé (${onlineCount}/${state.friends.length}/20 en ligne)</strong>
        <button class="btn net-close">✕</button>
      </div>
      <div class="net-pop-body">
        <div class="net-sec-title">Amis (${state.friends.length}/20)</div>
        <div class="net-friends-list">${friendsHtml}</div>
        <div class="net-sec-title">Tirages & Échanges en direct</div>
        <div class="net-feed-list">${feedHtml}</div>
        ${
          state.user
            ? `<div class="net-pop-foot">
                 <span>📚 ${cardCounts(state).uniqueCards} uniques · ${cardCounts(state).totalCards} cartes</span>
                 <button class="btn net-logout">Déconnexion</button>
               </div>`
            : ''
        }
      </div>
    `;

    popover.querySelector('.net-close')?.addEventListener('click', togglePopover);
    popover.querySelector('.net-logout')?.addEventListener('click', () => {
      void net.logout();
      popoverOpen = false;
      popover.classList.add('hidden');
    });
  }

  net.onChange(render);
  toolbar.append(wrap);
}
