import { useEffect, useMemo, useState } from "react";

interface Weight {
  key: string;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  default: number;
  group: string;
  value: number;
}

const FORMULAS: Record<string, string> = {
  "Note de base":
    "note de base = 50 + (WR_patch − 50) × poids_patch, bornée entre plancher et plafond. Sans données patch : 48.",
  "Ton pool":
    "note = base + (WR_perso − 50) × poids_perso × w + bonus_exp × min(parties, 40)/40, avec w = parties / (parties + inertie). Champion hors-rôle : facteur dédié, pas de malus de difficulté.",
  Découverte:
    "note = base − (difficulté − 1) × malus_difficulté (+ bonus si déjà essayé). La difficulté vient de Data Dragon (1-10).",
  "Affinité de style":
    "affinité = corrélation(profil, champion) × poids_corr + proximité_tempo × (1 − poids_corr), entre −1 et 1. Bonus = affinité × force, borné. Ton profil = moyenne des vecteurs de tes champions, pondérée par parties (plafonnées) × (0,5 + WR).",
  "Mode draft":
    "malus CC = (1 − mobilité/100) × dépassement_du_seuil × force (réduit pour les tanks) ; bonus engage/frontline si ton équipe en manque et que le candidat en apporte ; bonus équilibre AD/AP et contre-résistances. Total borné à ± ajustement max.",
};

export default function Weights() {
  const [weights, setWeights] = useState<Weight[] | null>(null);
  const [values, setValues] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (data: { weights: Weight[] }) => {
    setWeights(data.weights);
    setValues(Object.fromEntries(data.weights.map((w) => [w.key, w.value])));
  };

  useEffect(() => {
    fetch("/api/weights")
      .then((r) => r.json())
      .then(load)
      .catch(() => setError("Impossible de charger les pondérations"));
  }, []);

  const groups = useMemo(() => {
    const g = new Map<string, Weight[]>();
    for (const w of weights ?? []) {
      if (!g.has(w.group)) g.set(w.group, []);
      g.get(w.group)!.push(w);
    }
    return g;
  }, [weights]);

  const dirty = useMemo(
    () => (weights ?? []).some((w) => values[w.key] !== w.value),
    [weights, values],
  );

  const save = async (reset = false) => {
    setStatus(null);
    const res = await fetch("/api/weights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reset ? { reset: true } : { values }),
    });
    const json = await res.json();
    if (res.ok) {
      load(json);
      setStatus(reset ? "Valeurs par défaut restaurées" : "Sauvegardé — les notes utilisent maintenant ces valeurs");
    } else {
      setError(json.error ?? "Erreur de sauvegarde");
    }
  };

  if (error) return <p className="error">{error}</p>;
  if (!weights) return <p className="loading">Chargement…</p>;

  return (
    <div>
      <div className="weights-actions">
        <button onClick={() => save(false)} disabled={!dirty}>
          Sauvegarder
        </button>
        <button onClick={() => save(true)}>Valeurs par défaut</button>
        {status && <span className="weights-status">{status}</span>}
      </div>

      {[...groups.entries()].map(([group, items]) => (
        <section key={group} className="weights-group">
          <h2>{group}</h2>
          <p className="formula">{FORMULAS[group]}</p>
          {items.map((w) => (
            <div key={w.key} className="weight-row">
              <div className="weight-head">
                <span className="weight-label" title={w.key}>
                  {w.label}
                </span>
                <span className="weight-value">
                  {values[w.key]}
                  {values[w.key] !== w.default && (
                    <em className="weight-default"> (défaut : {w.default})</em>
                  )}
                </span>
              </div>
              <input
                type="range"
                min={w.min}
                max={w.max}
                step={w.step}
                value={values[w.key] ?? w.default}
                onChange={(e) => setValues({ ...values, [w.key]: Number(e.target.value) })}
              />
              <p className="weight-desc">{w.description}</p>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
