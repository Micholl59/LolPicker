# Mailles & Minutes

Chronomètres pour projets de tricot et de crochet : autant de projets que
voulu, chacun avec son chrono, son compteur de rangs et ses photos d'évolution.

Appli web sans installation ni serveur : `index.html`, `style.css`, `app.js`
et les icônes suffisent. Elle doit être mise en ligne (n'importe quel
hébergement de pages statiques) pour s'ouvrir sur un iPhone.

## Où sont les données

Projets, temps, rangs et photos restent **dans le navigateur du téléphone**
(rien n'est envoyé ailleurs). Les photos sont réduites à 1600 px.

Décision : l'appli s'utilise **dans Safari** (et pas en « appli web »
ajoutée à l'écran d'accueil). Sur iPhone, une appli web ajoutée à l'écran
d'accueil a sa propre mémoire, séparée de Safari ; or les raccourcis du widget
ouvrent toujours Safari. Si les deux étaient utilisés, le widget ne
retrouverait pas les projets.

## Widget sur l'écran d'accueil (app Raccourcis)

Un vrai widget iPhone n'est possible qu'avec une appli native. On passe donc
par l'app **Raccourcis** d'Apple :

1. Dans l'appli, ouvrir le projet, puis « Copier le lien » (section
   *Raccourci écran d'accueil*).
2. App Raccourcis → `+` → *Ajouter une action* → **Ouvrir les URL** → coller
   le lien. Nommer le raccourci comme le projet.
3. Recommencer pour chaque projet.
4. Écran d'accueil : appui long → *Modifier* → *Ajouter un widget* →
   **Raccourcis** → choisir la taille (le moyen affiche plusieurs raccourcis)
   et les raccourcis à afficher.

Un appui sur un projet du widget ouvre l'appli dans Safari et démarre son
chrono (s'il tournait déjà, il continue).

## Limites connues

- Le widget ouvre l'appli à chaque appui (pas de démarrage en arrière-plan).
- Effacer les données de Safari efface aussi les projets. Safari peut aussi
  effacer les données d'un site non ouvert pendant plusieurs jours d'usage :
  l'appli demande à les conserver, mais iOS ne le garantit pas.
