# LolPicker

Suggestions de pick pour League of Legends, basées sur tes stats perso, les stats
du patch en cours et la difficulté des champions que tu ne connais pas.

## Démarrage

```bash
npm install
npm run dev
```

Interface sur <http://localhost:5173> (l'API tourne sur le port 3001). Sous
Windows, double-cliquer sur `Demarrer LolPicker.bat` lance le tout et ouvre le
navigateur automatiquement.

## Runes

Dans la ligne dépliée d'un champion : la page de runes la plus jouée du patch
(keystone + runes mineures + arbres + winrate), récupérée depuis le JSON
`overview` de u.gg (cache 24 h ; keystones détectées dynamiquement depuis le
slot 0 de `runesReforged`). Si l'adversaire de ta lane est connu (draft ou
LCU), un conseil de matchup s'ajoute quand la fiche du champion contient un
bloc `runes` (règles selon mêlée/distance/archétype de l'adversaire — ex. Garen
prend Conquérant contre une mêlée, Poigne de l'immortel contre un ranged).

## Synchronisation avec le client LoL (LCU)

Le bouton « Auto : client LoL » de l'écran Picks active la lecture du champ
select en temps réel : le serveur (local) lit le `lockfile` du client et
interroge son API `127.0.0.1` (`/lol-champ-select/v1/session`), puis remplit
les deux compositions et ton rôle automatiquement (polling 3 s). Ne marche que
sur le PC qui fait tourner le client. États : gris (désactivé), rouge (client
non détecté), or (client ouvert, pas encore en champ select), vert (suivi en
direct). Chemin du lockfile surchargeable via `LOL_LOCKFILE`.

## Configuration

Copie `server/.env.example` vers `server/.env` et renseigne :

- `RIOT_API_KEY` : clé sur <https://developer.riotgames.com> (la clé dev expire
  toutes les 24 h — la régénérer puis relancer le serveur). Sans clé valide,
  l'app fonctionne en mode dégradé : recommandations basées uniquement sur le
  patch et la difficulté.
- `RIOT_CLUSTER` : `europe` (EUW/EUNE), `americas` ou `asia`.

## Sources de données

| Donnée | Source | Cache |
| --- | --- | --- |
| Version du jeu, champions, difficulté, tips | Data Dragon (public) | 24 h |
| Winrates du patch par rôle | `stats2.u.gg` (fichier statique par patch, non officiel) | 24 h |
| Stats perso (matchs) | API Riot match-v5 | matchs : permanent · agrégat : 1 h |

Notes d'implémentation :

- Le fichier u.gg `champion_ranking/world/{X_Y}/ranked_solo_5x5/emerald_plus/1.5.0.json`
  contient par rôle des entrées `[idChampion, [counters], victoires, parties, …]`.
- Cloudflare bloque l'empreinte TLS de Node : la requête u.gg passe par un
  sous-processus `curl` (préinstallé sur Windows 10+ et macOS).
- Limite clé dev Riot : 100 requêtes / 2 min → max ~85 nouveaux matchs
  téléchargés par rafraîchissement ; les matchs sont immuables donc cachés à vie.

## Calcul de la note (0-100)

- Base : winrate du patch dans le rôle (±1 pt de WR ≈ ±4 pts de note).
- Champions du pool (≥ 3 parties dans le rôle) : ajustement par le winrate
  perso, pondéré par le nombre de parties, plus un bonus d'expérience.
- Champions joués sur d'autres rôles : pas de malus de difficulté.
- Champions à découvrir : malus de difficulté (Data Dragon, 1-10).
- Affinité de style : bonus/malus (±8 en découverte, ±3 sur le pool) selon la
  corrélation entre le profil de style du joueur et celui du champion.

## Système de style (`server/data/champion-styles.json`)

Chaque champion a une fiche : archétype officiel (taxonomie du wiki LoL),
vecteur de 7 dimensions 0-100 (`splitpush`, `teamfight`, `pick`, `poke`,
`engage`, `peel`, `roam`), un `tempo` (0 = early, 100 = late) et, pour les
fiches `curated`, un plan de jeu (early/mid/late/draft) avec les sources web
qui l'étayent. Les fiches `draft` sont provisoires, à renforcer avec des
preuves (Reddit, guides).

Le profil du joueur est la moyenne des vecteurs de ses champions pondérée par
parties et winrate ; l'affinité est un cosinus centré (corrélation) + proximité
de tempo. Les fiches se corrigent à la main dans le JSON — le serveur les
recharge au démarrage.

## Pondérations (onglet « Calculs »)

Toutes les constantes des formules (poids du winrate patch, inertie du
winrate perso, malus de difficulté, forces des bonus de style et de draft…)
sont réglables depuis l'onglet Calculs, avec la formule affichée au-dessus de
chaque groupe. Les valeurs modifiées sont persistées dans
`server/data/weights.json` (seules les valeurs différentes du défaut y sont
écrites) et prennent effet immédiatement, sans redémarrage. Les fiches des
champions sont éditables de la même façon depuis l'onglet Fiches (curseurs +
bouton Sauvegarder).

## Écran principal (onglet « Picks »)

Un seul écran combine la recommandation générale et le mode draft. Les deux
compositions (ton équipe / ennemis) sont toujours visibles :

- **compos vides** → les scores sont ceux du patch (recommandation générale,
  aucun delta affiché) ;
- **compos remplies** (recherche + clic sur les portraits) → les scores
  s'ajustent à la draft en cours et un petit chiffre coloré sous chaque score
  montre l'écart avec le score général (ex. `48 −8`).

Chaque équipe affiche la lane probable de chaque pick, ses jauges (CC,
frontline, engage, peel, % AD — moyennes des champions) et des étiquettes
(CC-heavy, Full AD, Sans engage…). Les ajustements : malus pour les champions
sans mobilité contre une compo CC-heavy, bonus pour l'engage/la frontline qui
manque à ton équipe, équilibre AD/AP, contre-pick de résistances. Le CC et la
mobilité par champion viennent de `server/data/champion-attributes.json`
(valeurs provisoires, éditables) ; la frontline dérive de l'archétype et la
part AD/AP de Data Dragon.

Tout passe par l'endpoint `GET /api/draft` (paramètres `ally`, `enemy`, `role`,
`riotId`, `refresh`) — sans `ally`/`enemy`, il renvoie la recommandation
générale.
