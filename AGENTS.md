# AGENTS.md — Bud Clicker

Guide d'entrée pour tout agent IA ou dev rejoignant le projet. Lis ça en entier
avant de toucher au code : tout y est — stack, conventions, workflow git, tests,
boucle d'équilibrage économique.

## Le projet en 30 secondes

Idle/clicker game mobile « Bud Clicker » : on clique un bud pour récolter du
weed, on le transforme en 8 produits (joint → live rosin), on vend au Marché
dont les prix **fluctuent ±30 %**, on automatise des chaînes craft+vente façon
AdVenture Capitalist, on débloque 8 variétés de cannabis aux multiplicateurs
croissants. Zéro dépendance runtime : HTML/CSS/JS statiques servis tels quels
par GitHub Pages.

- **Jouer** : https://stxtxm.github.io/clicker-game/
- **Stack** : vanilla JS (UMD), node:test pour les tests, chromium headless pour l'e2e.
- **Règle d'or** : la logique de jeu vit dans `js/game.js` (pur, testable), le DOM
  dans `js/ui.js`, le SVG du bud dans `js/bud.js`. Ne jamais mélanger.

## Structure

```
index.html            UI + CSS (tout le rendu statique, styles inline dans <style>)
js/game.js            Logique pure (window.BudGame / module.exports) — économie, catalogues
js/ui.js              Colle DOM : rendu, événements, autoProduce 1s, save/load localStorage
js/bud.js             Rendu SVG procédural du bud (déterministe, seeds fixés)
sw.js                 Service worker PWA (network-first code, cache-first images)
manifest.json         Manifest PWA + raccourcis d'app
icon-*.{svg,png}      Icônes (SVG = source de vérité, PNG régénérés depuis le SVG)
test/game.test.js     ~70 tests unitaires (économie, catalogues, limites, saves)
test/playthrough.test.js  Simulateur de joueur optimal — asserte la courbe de pacing
test/e2e.test.js      E2E chromium : pilote le vrai jeu dans une iframe (13 scénarios)
test/e2e-runner.html  Page harnais e2e (scénarios décrits en JS, sortie "E2E x: PASS|FAIL")
```

## Commandes

```bash
npm test              # toute la suite : unit + playthrough + e2e (e2e skip sans navigateur)
node --test test/game.test.js        # unitaires seuls (rapide, ~1s)
node --test test/playthrough.test.js # sim 2h + assertions de pacing (~5s)
node --test test/e2e.test.js         # e2e (auto-détecte chromium/google-chrome, ~25s)
CHROMIUM_PATH=/chemin/chromium npm test  # navigateur non standard
./start.sh            # serveur local port 8000
```

Vérifications avant tout commit : `npm test` passe **et** `node --check` sur chaque
`js/*.js` + `sw.js` modifié (le CI le fait aussi).

## Workflow git (OBLIGATOIRE — master est protégé)

1. `git pull origin master` — toujours partir à jour.
2. Crée une branche courte et descriptive : `git switch -c fix/nom-du-bug` ou
   `feat/nom-de-la-feature`. Pas d'accent, kebab-case.
3. Commits atomiques, messages en français, style du repo :
   `type(scope): résumé court` puis détail à puces. Types utilisés : feat, fix,
   balance, refactor, test, chore, docs.
4. `git push -u origin ma-branche` puis ouvre la **Pull Request vers master**
   (`gh pr create` si gh est authentifié, sinon l'URL compare que git affiche).
5. Le pipeline **CI** tourne automatiquement (unit + playthrough + e2e + node
   --check). Il doit être **vert** avant de merger.
6. Merge en **Squash and merge** uniquement (historique master = 1 commit par PR,
   message de squash = le message de la PR).
7. Supprime la branche après merge. `master` refuse les push directs et les
   merges sans checks verts (ruleset GitHub `protect-master`).

### Règles de commit

- Jamais de `git commit --no-verify`, jamais de force-push sur master.
- Ne commit jamais de secrets/tokens (le repo est public).
- Un commit qui casse `npm test` ne doit pas exister — lance les tests AVANT.

## Patterns UI / performance (OBLIGATOIRE pour toute liste rendue)

- **Structure / valeurs** : toute liste rendue dans une vue (marché, jalons,
  upgrades) est construite **une seule fois** (`buildX()` avec ids stables et
  handlers attachés une fois), puis mise à jour **in place** à chaque tick
  (`updateX()` ne touche que textContent/style.width/classList/disabled).
  Interdiction de faire `innerHTML = ''` dans une boucle d'update — c'était
  la cause de taps perdus et de thrash layout sur mobile. Rebuild complet
  uniquement quand l'ensemble change (ex déverrouillage d'un produit).
- **Animations redémarrables** (pop au clic, bannières) : Web Animations API
  (`el.animate(...)`), jamais `classList.remove + void offsetWidth + add`
  (reflow forcé). Propriétés animées : transform/opacity uniquement
  (compositor). `prefers-reduced-motion` respecté pour les animations
  décoratives continues.
- **Toasts** : max 2 simultanés, dédoublonnés (le même message relance le
  timer au lieu de réempiler) — voir `toast()` dans `js/ui.js`.
- **Feedback d'achat** : tout achat passe par le retour de la fonction Game
  (`res.ok / res.reason`), toast + `popNum` + `refreshStats` + `save`.
- **Latence de jeu** : la récolte écoute `pointerdown` (réponse instantanée au
  touch), avec garde anti double-fire sur `click` (e2e/souris). Les particules
  vivent dans un pool réutilisé sur une couche `#fx` séparée — jamais dans la
  couche compositée du bud. `refreshStats` ne met à jour que la vue active
  (`switchTab` déclenche un refresh à l'entrée d'une vue).

## Conventions de code

- **Pas de commentaires** sauf JSDoc sur les fonctions exportées de `game.js` et
  les notes de design délibéré (ex : ordre de tick de `autoTick`). Le code doit
  se lire seul.
- UI en **français**, code/docstrings en anglais, README bilingue pragmatique.
- Zéro dépendance npm runtime. Pas de build step. ES5-compatible-ish (UMD),
  pas de module ES dans `js/` (les tests font `require`).
- Tout état persistant passe par `Game.serialize/deserialize` — toute nouvelle
  donnée de jeu doit avoir sa sanitisation dans `deserialize` + son test de
  roundtrip. Les anciennes saves doivent toujours se charger (migration douce,
  jamais de breaking change de format sans migration).
- CSS : variables du `:root` de index.html, mobile-first, pas de framework.

## Économie : la boucle d'équilibrage

L'économie est pilotée par les données, pas au doigt mouillé :

1. Modifie les knobs dans `js/game.js` (dans l'ordre d'impact) :
   - **Stockage** (`sbox`/`coldroom`, growth ×3.0) — le revenu ≈ cap × €/g, donc
     le cap de stockage gate tout le late game. C'est LE puits à argent.
   - **Coûts des variétés** — chaque variété est un saut exponentiel
     (`yieldMult × priceMult`) ; leurs coûts espacent les sauts.
   - `XP_GROWTH` (1.32) — les niveaux gate produits/chaînes/variétés.
   - Échelle de produits (`PRODUCTS`) et `MARKET` (pulse ±30 %).
2. Lance `node --test test/playthrough.test.js` et lis la ligne `SIM2H` :
   c'est un joueur **optimal** (2.5 clics/s, vente aux pics, sessions AFK,
   achats parfaits). Un joueur réel est 2-4× plus lent.
3. Ajuste jusqu'à tenir les cibles gravées dans le test (niveau 10 à 6-20 min,
   1 M€ à 6-20 min, plafond < 10 Md€ en 2h optimale, etc.).
4. `npm test` — les assertions de pacing + les 70 tests unitaires doivent rester
   verts. Toute valeur de prix/coût du README doit suivre (tables à jour).

## PWA / cache — règle de versioning

`sw.js` précache les assets. **Bump `CACHE_VERSION` à chaque changement de forme
des assets** (nouveau fichier, renommage). Le code du jeu lui-même est
network-first : pas besoin de bump pour un simple changement de logique.
Les icônes : modifier `icon-*.svg` PUIS régénérer les PNG (rendu headless du SVG,
cf. historique git) — les PNG servent à iOS/shortcuts uniquement.

## E2E — comment ça marche

`test/e2e-runner.html` charge `../index.html` dans une iframe same-origin,
exécute des scénarios joueur (clics, onglets, achats, reload de save) et écrit
des lignes `E2E <nom>: PASS|FAIL` dans son propre DOM. `test/e2e.test.js` sert
le repo sur un port éphémère, lance chromium `--dump-dom` sur le runner et
asserte zéro FAIL. Pour ajouter un scénario : une fonction dans `scenario()`,
un `report('nom', condition, 'détail')`, et l'assertion correspondante si
pertinente. L'e2e doit rester **sans dépendance** (pas de puppeteer/playwright).

## Checklist de PR

- [ ] `npm test` vert en local (70 unit + playthrough + e2e)
- [ ] `node --check` sur chaque fichier JS touché
- [ ] Nouvelles données de jeu → sanitisation `deserialize` + test roundtrip
- [ ] Changement d'économie → sim playthrough relancée, README à jour
- [ ] Changement visuel → vérifié dans chromium headless (pas juste "ça devrait le faire")
- [ ] Pas de commentaire superflu, pas de dépendance ajoutée
- [ ] Message de PR = ce qui change, pourquoi, comment c'est testé
