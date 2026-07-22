# TODO LolPicker

## À faire

- [ ] **Clé API Reddit** : créer l'app sur reddit.com/prefs/apps (type "script",
  cocher le reCAPTCHA ; vérifier email + enregistrement API si refus), puis
  **phase 2 styles** : enrichir les ~150 fiches `draft` de
  `server/data/champion-styles.json` avec des preuves Reddit (r/summonerschool,
  subreddits de mains).
- [ ] **Règles de runes de matchup** : n'existent que pour 5 champions curated
  (bloc `runes` dans les fiches). À étendre au fil de la phase 2.
- [ ] **Mode draft — affinage** : valeurs de `champion-attributes.json`
  (provisoires) ; jauge burst/DPS.
- [ ] **Phase 3 styles** : valider les vecteurs avec les champs `challenges`
  des matchs déjà téléchargés (turretTakedowns, soloKills,
  damageDealtToObjectives…).
- [ ] Hébergement pour les amis + demande de clé Riot permanente (Personal API
  Key sur developer.riotgames.com).

## Fait

- [x] v1 : recommandations par rôle (winrates patch u.gg + stats perso Riot +
  difficulté), caches à tous les niveaux, rattrapage progressif de
  l'historique (2026-07-22)
- [x] Système de styles : 7 dimensions + tempo + archétype, profil joueur,
  bonus d'affinité, 8 fiches curated avec plan de jeu sourcé (2026-07-22)
- [x] Page fiches champions avec recherche (2026-07-22)
- [x] Mode draft v1 : saisie manuelle des deux compos, jauges (CC, frontline,
  engage, peel, % AD) + étiquettes, recommandations ajustées au contexte
  (malus CC-heavy, bonus engage/frontline manquants, équilibre des dégâts,
  contre full AD/AP) (2026-07-22)
- [x] Lane probable affichée sous chaque pick de la draft (2026-07-22)
- [x] Page « Calculs » : les 25 pondérations des formules modifiables et
  persistées dans `server/data/weights.json` (2026-07-22)
- [x] Fiches éditables : curseurs sur les 7 dimensions + tempo + CC +
  mobilité, sauvegarde dans les fichiers de données (2026-07-22)
- [x] Fusion des onglets Picks + Draft en un seul écran : compos toujours
  visibles (vides = score général, remplies = score ajusté avec delta affiché),
  endpoint unique `/api/draft` (l'ancien `/api/recommendations` supprimé)
  (2026-07-22)
- [x] Statut des fiches mis en avant (compteur + filtre + pastilles + badges) ;
  correction casse d'ID KhaZix/KaiSa (2026-07-22)
- [x] Runes : page par défaut via u.gg overview JSON (keystone + mineures +
  arbres + WR, keystones détectées dynamiquement depuis runesReforged slot 0) +
  conseils de matchup (bloc `runes` des fiches, selon melee/ranged/archétype de
  l'adversaire de lane), affichés dans la ligne dépliée (2026-07-22)
- [x] LCU : lecture du champ select via le serveur local (lockfile → HTTPS
  127.0.0.1), remplissage auto des compos + rôle, bouton on/off dans l'écran
  Picks, polling 3 s (2026-07-22)
- [x] Lanceur double-clic `Demarrer LolPicker.bat` (2026-07-22)
