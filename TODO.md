# TODO LolPicker

## À faire

- [ ] **Phase 2 bis (optionnel)** : renforcer les fiches avec des preuves Reddit
  quand la clé API sera disponible (r/summonerschool, subreddits de mains).
  Piste écartée : les « Tips & tricks » du wiki ne contiennent que des minuties
  techniques (temps d'incantation, hitbox), pas de stratégie exploitable.
- [ ] **Règles de runes par matchup** : seuls 5 champions ont le bloc `runes`
  (Garen, Nasus, Mordekaiser, Malphite, Singed) — à étendre aux 168 autres.
  La page de runes par défaut (u.gg), elle, marche déjà pour tous.
- [ ] **Mode draft — affinage** : valeurs de `champion-attributes.json`
  (provisoires) ; jauge burst/DPS.
- [ ] ~~**Phase 3 styles**~~ : **abandonné le 2026-07-25** (décision utilisateur,
  approche jugée non pertinente). Étude faite si on veut y revenir : les 510
  matchs en cache ont 100 % de couverture sur `damageDealtToTurrets`,
  `timeCCingOthers`, `totalHealsOnTeammates`, `soloKills`, `killParticipation`,
  `teamDamagePercentage`… Deux limites qui ont motivé l'abandon : le **poke n'est
  mesurable par aucune métrique**, et le comportement mesuré est confondu avec le
  champion joué (jouer Garen produit du splitpush quel que soit le goût du
  joueur). Valider les vecteurs eux-mêmes demanderait les parties de milliers de
  joueurs, pas seulement les nôtres.
- [ ] Hébergement pour les amis + demande de clé Riot permanente (Personal API
  Key sur developer.riotgames.com).

- [ ] **Panneau Objets** (carré en haut à droite de l'écran Picks) : emplacement
  créé et visible, contenu à faire — recommandations d'achat selon la draft,
  consultables pendant la partie.
- [ ] **Conseils anti-champion manquants** : 26 champions n'ont pas
  d'`enemytips` chez Riot (Ambessa, Aurora, Bel'Veth, Briar, Locke, Naafiri,
  Nilah, Qiyana, Akshan, Aurelion Sol, Fiddlesticks, Lillia…). Ils retombent sur
  la ligne « draft » de notre fiche — à compléter par des conseils dédiés.

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
- [x] **Counters dans le score de draft** : le winrate réel du duel contre
  l'adversaire de ta lane ajuste la note, comparé au winrate habituel du
  champion (pour ne pas recompter sa force générale). Pondéré par rôle —
  top ×1,5 et mid ×1,4 (duel de lane décisif), jungle ×0,7. Effet borné à
  ±15 points, seuil de 300 parties. Tout est réglable dans l'onglet Calculs.
  Astuce de perf : on télécharge les matchups de **l'adversaire** une seule
  fois puis on inverse, au lieu d'un fichier de 3 Mo par candidat (2026-07-25)
- [x] **Écran Picks réorganisé** (d'après le croquis de l'utilisateur) : draft à
  gauche, colonne de droite avec l'emplacement Objets en haut et le panneau
  rouge **Matchups défavorables** en bas. Il suit le champion sélectionné dans
  la liste de gauche (clic = sélection, bordure dorée) et liste ses pires
  duels ; chaque ligne se déplie sur les conseils pour jouer contre ce
  champion. Les matchups ont donc quitté la ligne dépliée de « ton pool ».
  Pensé pour rester ouvert pendant la partie (2026-07-25)
- [x] **Filtre des conseils corrompus de Riot** : K'Sante servait les
  `enemytips` de Lee Sin (erreur de copier-coller côté Riot, patch 16.14). Les
  tips qui citent un autre champion sans jamais nommer le leur sont écartés et
  remplacés par notre fiche (2026-07-25)
- [x] **Matchups réels** : endpoint u.gg `matchups` décodé
  (`[champId, victoires, parties, …]`, vérifié par recoupement du winrate
  agrégé). Source vivante cachée 24 h : contre-picks chiffrés dans les fiches
  (sélecteur de rôle) et winrate du duel direct en mode draft (2026-07-25)
- [x] **Vérification factuelle des 35 fiches écrites « au kit »** contre les
  descriptions officielles Data Dragon fr : **27 corrigées** (noms de sorts
  inventés, lettres Q/W/E/R inversées, effets faux). Chaque fiche corrigée cite
  désormais Data Dragon en source (2026-07-25)
- [x] **Phase 2 styles TERMINÉE : 173/173 fiches curées** (plan de jeu FR
  early/mid/late/draft + difficulté maison 1-10 + sources), dont les 12
  champions qui n'avaient aucune fiche (vecteur de style + attributs créés)
  (2026-07-23)
- [x] Difficulté curée : la note Riot (`info.difficulty`, trop grossière —
  Garen=5, Locke=5) est overridée par une valeur maison dans les fiches curated
  (38 posées), éditable au curseur ; les non-curées gardent la valeur Riot
  marquée « à affiner ». Le score de découverte utilise la difficulté effective
  (2026-07-22)
- [x] Onglet Réglages : changer la clé API Riot depuis l'UI (sans redémarrer le
  serveur), testée immédiatement contre l'API Riot. Pas d'authentification
  volontairement (usage local mono-utilisateur pour l'instant — à revoir avant
  tout partage) (2026-07-23)
- [x] Tips Riot (Data Dragon `allytips`) masqués sur les fiches curated (le plan
  vérifié fait foi) — corrige les infos Riot anciennes/trompeuses ; toutes les
  données restent 100 % LoL PC (jamais Wild Rift) (2026-07-22)
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
