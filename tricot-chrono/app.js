'use strict';

// Projets (titre, temps, rangs) dans localStorage ; photos dans IndexedDB
// (trop lourdes pour localStorage). Un chrono en cours garde son heure de
// départ (`debut`) : il continue de tourner même appli fermée.
const CLE = 'mailles-et-minutes:projets';
const app = document.getElementById('app');

let projets = charger();
let projetOuvert = null; // id du projet affiché en détail, sinon la liste
let urlsPhotos = [];     // object URLs à libérer au prochain affichage

function charger() {
  try {
    return JSON.parse(localStorage.getItem(CLE)) || [];
  } catch {
    return [];
  }
}

function sauver() {
  try {
    localStorage.setItem(CLE, JSON.stringify(projets));
  } catch {
    boite("Impossible d'enregistrer : la mémoire du téléphone est pleine.", { annuler: false });
  }
}

function trouver(id) {
  return projets.find(p => p.id === id);
}

// ---------- Photos (IndexedDB) ----------

const base = new Promise((ok, ko) => {
  const req = indexedDB.open('mailles-et-minutes', 1);
  req.onupgradeneeded = () => {
    const store = req.result.createObjectStore('photos', { keyPath: 'id' });
    store.createIndex('projet', 'projetId');
  };
  req.onsuccess = () => ok(req.result);
  req.onerror = () => ko(req.error);
});

async function requete(mode, action) {
  const db = await base;
  return new Promise((ok, ko) => {
    const t = db.transaction('photos', mode);
    const req = action(t.objectStore('photos'));
    t.oncomplete = () => ok(req && req.result);
    t.onerror = () => ko(t.error);
  });
}

async function photosDe(projetId) {
  const photos = await requete('readonly', s => s.index('projet').getAll(projetId));
  return photos.sort((a, b) => a.date - b.date);
}

function ajouterPhoto(projetId, blob) {
  return requete('readwrite', s => s.put({ id: nouvelId(), projetId, date: Date.now(), blob }));
}

function supprimerPhoto(id) {
  return requete('readwrite', s => s.delete(id));
}

async function supprimerPhotosDe(projetId) {
  for (const photo of await photosDe(projetId)) await supprimerPhoto(photo.id);
}

// Réduit la photo (max 1600 px) pour ne pas saturer la mémoire du téléphone.
function reduire(fichier) {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * k);
      canvas.height = Math.round(img.naturalHeight * k);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => (b ? ok(b) : ko(new Error('photo'))), 'image/jpeg', 0.85);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      ko(new Error('photo illisible'));
    };
    img.src = url;
  });
}

function urlDe(blob) {
  const url = URL.createObjectURL(blob);
  urlsPhotos.push(url);
  return url;
}

// ---------- Chrono ----------

function tempsTotal(p) {
  return p.totalMs + (p.debut ? Date.now() - p.debut : 0);
}

function demarrer(p) {
  if (!p.debut) {
    p.debut = Date.now();
    sauver();
  }
}

function mettreEnPause(p) {
  if (p.debut) {
    p.totalMs += Date.now() - p.debut;
    p.debut = null;
    sauver();
  }
}

function basculer(p) {
  p.debut ? mettreEnPause(p) : demarrer(p);
  afficher();
}

function formater(ms) {
  const s = Math.floor(ms / 1000);
  const deux = n => String(n).padStart(2, '0');
  return `${Math.floor(s / 3600)}:${deux(Math.floor(s / 60) % 60)}:${deux(s % 60)}`;
}

setInterval(() => {
  for (const node of document.querySelectorAll('[data-chrono]')) {
    const p = trouver(node.dataset.chrono);
    if (p) node.textContent = formater(tempsTotal(p));
  }
}, 250);

// ---------- Utilitaires ----------

function nouvelId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function el(tag, attrs = {}, ...enfants) {
  const node = document.createElement(tag);
  for (const [cle, val] of Object.entries(attrs)) {
    if (cle.startsWith('on')) node.addEventListener(cle.slice(2), val);
    else if (cle === 'class') node.className = val;
    else if (cle === 'dataset') Object.assign(node.dataset, val);
    else node.setAttribute(cle, val);
  }
  node.append(...enfants.filter(e => e != null));
  return node;
}

function dateCourte(ts) {
  return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Ouverte depuis l'écran d'accueil, l'appli a une mémoire séparée de Safari,
// alors que le widget ouvre toujours Safari : il ne trouverait pas les projets.
const horsSafari = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

function avertissementSafari() {
  return el('p', { class: 'alerte' },
    'Tu as ouvert l’appli depuis l’écran d’accueil. Le widget, lui, ouvre Safari, qui garde ses propres projets : '
    + 'utilise plutôt l’appli dans Safari pour que le widget les retrouve.');
}

function lienRaccourci(p) {
  return `${location.origin}${location.pathname}#lancer=${p.id}`;
}

// ---------- Affichage ----------

function afficher(enHaut = false) {
  urlsPhotos.forEach(URL.revokeObjectURL);
  urlsPhotos = [];
  const p = projetOuvert && trouver(projetOuvert);
  app.replaceChildren(p ? vueProjet(p) : vueListe());
  if (enHaut) window.scrollTo(0, 0);
}

function boutonChrono(p, classe = '') {
  return el('button', {
    class: `bouton-chrono ${p.debut ? 'en-cours' : ''} ${classe}`,
    'aria-label': p.debut ? 'Mettre en pause' : 'Démarrer',
    onclick: e => { e.stopPropagation(); basculer(p); },
  }, p.debut ? '❚❚' : '▶');
}

function vueListe() {
  const cartes = projets.map(p => {
    const couverture = el('div', { class: 'couverture' }, '🧶');
    photosDe(p.id).then(photos => {
      const derniere = photos[photos.length - 1];
      if (derniere) couverture.replaceChildren(el('img', { src: urlDe(derniere.blob), alt: '' }));
    });
    return el('article', {
      class: `carte ${p.debut ? 'active' : ''}`,
      onclick: () => { projetOuvert = p.id; afficher(true); },
    },
      couverture,
      el('div', { class: 'carte-infos' },
        el('h2', {}, p.titre),
        el('p', { class: 'chrono-petit', dataset: { chrono: p.id } }, formater(tempsTotal(p))),
        el('p', { class: 'rangs-petit' }, `Rang ${p.rangs}`),
      ),
      boutonChrono(p),
    );
  });

  return el('div', { class: 'page' },
    el('header', { class: 'entete' },
      el('h1', {}, 'Mailles & Minutes'),
      el('p', { class: 'sous-titre' }, 'Mes projets tricot & crochet'),
    ),
    horsSafari ? avertissementSafari() : null,
    projets.length
      ? el('section', { class: 'liste' }, ...cartes)
      : el('p', { class: 'vide' }, 'Aucun projet pour l’instant.', el('br'), 'Crée le premier ! 🧶'),
    el('button', { class: 'bouton bouton-principal', onclick: creerProjet }, '+ Nouveau projet'),
  );
}

function vueProjet(p) {
  const galerie = el('div', { class: 'galerie' });
  photosDe(p.id).then(photos => {
    if (!photos.length) {
      galerie.replaceChildren(el('p', { class: 'vide-petit' }, 'Pas encore de photo.'));
      return;
    }
    galerie.replaceChildren(...photos.map(photo => {
      const url = urlDe(photo.blob);
      return el('figure', { onclick: () => ouvrirPhoto(photo, url) },
        el('img', { src: url, alt: '' }),
        el('figcaption', {}, dateCourte(photo.date)),
      );
    }));
  });

  const champPhoto = el('input', {
    type: 'file', accept: 'image/*', multiple: '', hidden: '',
    onchange: async e => {
      for (const fichier of e.target.files) {
        try {
          await ajouterPhoto(p.id, await reduire(fichier));
        } catch {
          await boite('Une photo n’a pas pu être ajoutée.', { annuler: false });
        }
      }
      afficher();
    },
  });

  const lien = lienRaccourci(p);

  return el('div', { class: 'page' },
    el('button', { class: 'retour', onclick: () => { projetOuvert = null; afficher(true); } }, '‹ Mes projets'),
    el('h1', { class: 'titre-projet' }, p.titre),

    el('section', { class: 'bloc bloc-rose' },
      el('h3', {}, 'Temps passé'),
      el('p', { class: 'chrono-grand', dataset: { chrono: p.id } }, formater(tempsTotal(p))),
      el('button', {
        class: `bouton ${p.debut ? 'bouton-pause' : 'bouton-principal'}`,
        onclick: () => basculer(p),
      }, p.debut ? '❚❚ Pause' : '▶ Démarrer'),
    ),

    el('section', { class: 'bloc bloc-menthe' },
      el('h3', {}, 'Compteur de rangs'),
      el('div', { class: 'compteur' },
        el('button', { class: 'rond', 'aria-label': 'Rang précédent', onclick: () => changerRangs(p, -1) }, '−'),
        el('span', { class: 'rangs-grand' }, String(p.rangs)),
        el('button', { class: 'rond rond-plus', 'aria-label': 'Rang suivant', onclick: () => changerRangs(p, 1) }, '+'),
      ),
      el('button', { class: 'lien-discret', onclick: () => remettreRangs(p) }, 'Remettre à zéro'),
    ),

    el('section', { class: 'bloc bloc-lavande' },
      el('h3', {}, 'Photos'),
      galerie,
      el('label', { class: 'bouton bouton-secondaire' }, '📷 Ajouter des photos', champPhoto),
    ),

    el('section', { class: 'bloc bloc-peche' },
      el('h3', {}, 'Widget écran d’accueil'),
      horsSafari ? avertissementSafari() : null,
      el('p', { class: 'aide' }, 'Un appui sur le widget lancera le chrono de ce projet. À faire une fois par projet :'),
      el('ol', { class: 'etapes' },
        el('li', {}, 'Touche « Copier le lien » ci-dessous.'),
        el('li', {}, 'Ouvre l’app Raccourcis, touche « + » puis « Ajouter une action ».'),
        el('li', {}, 'Cherche « Ouvrir les URL », choisis-la, touche « URL » et colle le lien.'),
        el('li', {}, `Touche le nom en haut, « Renommer », écris « ${p.titre} » puis « OK ».`),
        el('li', {}, 'Sur l’écran d’accueil : appui long, « Modifier », « Ajouter un widget », puis « Raccourcis ». Prends la taille moyenne (4 projets).'),
        el('li', {}, 'Pour choisir les projets affichés : appui long sur le widget, puis « Modifier le widget ».'),
      ),
      el('p', { class: 'aide' }, 'Au premier appui, l’iPhone peut demander s’il peut ouvrir la page : réponds « Autoriser ».'),
      el('p', { class: 'lien-raccourci' }, lien),
      el('button', { class: 'bouton bouton-secondaire', onclick: e => copier(lien, e.target) }, 'Copier le lien'),
    ),

    el('div', { class: 'actions-projet' },
      el('button', { class: 'lien-discret', onclick: () => renommer(p) }, 'Renommer'),
      el('button', { class: 'lien-discret danger', onclick: () => supprimerProjet(p) }, 'Supprimer le projet'),
    ),
  );
}

// ---------- Actions ----------

async function creerProjet() {
  const titre = ((await boite('Nom du projet', { champ: '' })) || '').trim();
  if (!titre) return;
  projets.push({ id: nouvelId(), titre, totalMs: 0, debut: null, rangs: 0, creeLe: Date.now() });
  sauver();
  afficher();
}

async function renommer(p) {
  const titre = ((await boite('Nouveau nom du projet', { champ: p.titre })) || '').trim();
  if (!titre) return;
  p.titre = titre;
  sauver();
  afficher();
}

async function supprimerProjet(p) {
  if (!(await boite(`Supprimer « ${p.titre} » ainsi que son temps, ses rangs et ses photos ?`, { ok: 'Supprimer' }))) return;
  projets = projets.filter(x => x.id !== p.id);
  sauver();
  await supprimerPhotosDe(p.id);
  projetOuvert = null;
  afficher(true);
}

function changerRangs(p, delta) {
  p.rangs = Math.max(0, p.rangs + delta);
  sauver();
  afficher();
}

async function remettreRangs(p) {
  if (!(await boite('Remettre le compteur de rangs à zéro ?', { ok: 'Remettre à zéro' }))) return;
  p.rangs = 0;
  sauver();
  afficher();
}

async function copier(texte, bouton) {
  try {
    await navigator.clipboard.writeText(texte);
    bouton.textContent = 'Lien copié ✓';
  } catch {
    boite('Copie ce lien', { champ: texte, annuler: false });
  }
}

// ---------- Boîte de dialogue ----------

// Remplace alert/confirm/prompt, dont le navigateur préfixe le message par
// l'adresse du site. Résout le texte saisi (avec `champ`), sinon true ;
// null ou false si annulé.
function boite(message, { champ = null, ok = 'OK', annuler = true } = {}) {
  return new Promise(resoudre => {
    const fond = el('div', { class: 'boite-fond' });
    const saisie = champ === null ? null : el('input', { class: 'boite-champ', type: 'text', value: champ });
    const fermer = valeur => { fond.remove(); resoudre(valeur); };
    fond.append(el('form', {
      class: 'boite',
      onsubmit: e => { e.preventDefault(); fermer(saisie ? saisie.value : true); },
    },
      el('p', { class: 'boite-message' }, message),
      saisie,
      el('div', { class: 'boite-actions' },
        annuler ? el('button', { type: 'button', class: 'bouton', onclick: () => fermer(saisie ? null : false) }, 'Annuler') : null,
        el('button', { type: 'submit', class: 'bouton bouton-principal' }, ok),
      ),
    ));
    document.body.append(fond);
    if (saisie) { saisie.focus(); saisie.select(); }
  });
}

// ---------- Visionneuse photo ----------

const visionneuse = document.getElementById('visionneuse');
let photoAffichee = null;

function ouvrirPhoto(photo, url) {
  photoAffichee = photo;
  document.getElementById('visionneuse-img').src = url;
  document.getElementById('visionneuse-date').textContent = dateCourte(photo.date);
  visionneuse.hidden = false;
}

document.getElementById('visionneuse-fermer').onclick = () => { visionneuse.hidden = true; };
document.getElementById('visionneuse-suppr').onclick = async () => {
  if (!(await boite('Supprimer cette photo ?', { ok: 'Supprimer' }))) return;
  await supprimerPhoto(photoAffichee.id);
  visionneuse.hidden = true;
  afficher();
};

// ---------- Lancement depuis un raccourci (#lancer=<id>) ----------

function lireLien() {
  const id = new URLSearchParams(location.hash.slice(1)).get('lancer');
  if (!id) return;
  history.replaceState(null, '', location.pathname + location.search);
  const p = trouver(id);
  if (!p) {
    boite('Ce projet est introuvable ici. Le raccourci doit ouvrir l’appli dans Safari, là où tes projets sont enregistrés.', { annuler: false });
    return;
  }
  demarrer(p);
  projetOuvert = p.id;
}

window.addEventListener('hashchange', () => { lireLien(); afficher(true); });

// Chaque appui sur le widget peut ouvrir un nouvel onglet : on relit les
// données pour qu'un ancien onglet n'écrase pas les changements récents.
function recharger() {
  projets = charger();
  afficher();
}
window.addEventListener('storage', e => { if (e.key === CLE) recharger(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') recharger();
});

// Demande au navigateur de ne pas effacer les données (projets et photos).
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

lireLien();
afficher();
