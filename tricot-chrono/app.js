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
    alert("Impossible d'enregistrer : la mémoire du navigateur est pleine.");
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
          alert('Une photo n’a pas pu être ajoutée.');
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
      el('h3', {}, 'Raccourci écran d’accueil'),
      el('p', { class: 'aide' },
        'Colle ce lien dans un raccourci de l’app Raccourcis : un appui sur le widget lancera le chrono de ce projet.'),
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

function creerProjet() {
  const titre = (prompt('Nom du projet ?') || '').trim();
  if (!titre) return;
  projets.push({ id: nouvelId(), titre, totalMs: 0, debut: null, rangs: 0, creeLe: Date.now() });
  sauver();
  afficher();
}

function renommer(p) {
  const titre = (prompt('Nouveau nom du projet ?', p.titre) || '').trim();
  if (!titre) return;
  p.titre = titre;
  sauver();
  afficher();
}

async function supprimerProjet(p) {
  if (!confirm(`Supprimer « ${p.titre} » ainsi que son temps, ses rangs et ses photos ?`)) return;
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

function remettreRangs(p) {
  if (!confirm('Remettre le compteur de rangs à zéro ?')) return;
  p.rangs = 0;
  sauver();
  afficher();
}

async function copier(texte, bouton) {
  try {
    await navigator.clipboard.writeText(texte);
    bouton.textContent = 'Lien copié ✓';
  } catch {
    prompt('Copie ce lien :', texte);
  }
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
  if (!confirm('Supprimer cette photo ?')) return;
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
    alert('Ce projet est introuvable ici. Le raccourci doit ouvrir l’appli dans Safari, là où tes projets sont enregistrés.');
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
