import { useEffect, useMemo, useState } from "react";

interface Fiche {
  key: string;
  id: string;
  name: string;
  title: string;
  icon: string;
  tags: string[];
  difficulty: number;
  cc: number;
  mobility: number;
  blurb: string;
  tips: string[];
  archetype: string | null;
  style: Record<string, number> | null;
  tempo: number | null;
  styleTags: string[];
  plan: { early: string; mid: string; late: string; draft: string } | null;
  provenance: "curated" | "draft" | null;
  sources: string[];
  wrByRole: Record<string, { wr: number; pickRate: number }>;
}

const DIMS: [string, string][] = [
  ["splitpush", "Splitpush"],
  ["teamfight", "Teamfight"],
  ["pick", "Pick"],
  ["poke", "Poke"],
  ["engage", "Engage"],
  ["peel", "Peel"],
  ["roam", "Roam"],
];

const ROLE_LABELS: Record<string, string> = {
  top: "Top",
  jungle: "Jungle",
  mid: "Mid",
  adc: "ADC",
  support: "Support",
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

type FicheStatus = "done" | "draft" | "empty";

// done = fiche complète (curated), draft = provisoire à finir, empty = aucune fiche
function statusOf(c: Fiche): FicheStatus {
  if (c.style === null) return "empty";
  return c.provenance === "curated" ? "done" : "draft";
}

const STATUS_LABEL: Record<Exclude<FicheStatus, "done">, string> = {
  draft: "provisoire",
  empty: "à créer",
};

export default function Fiches() {
  const [all, setAll] = useState<Fiche[] | null>(null);
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState(false);
  const [onlyTodo, setOnlyTodo] = useState(false);

  const reload = () =>
    fetch("/api/champions")
      .then((r) => r.json())
      .then((d) => setAll(d.champions))
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur de chargement"));

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    setEditing(false);
    setSaved(false);
  }, [selectedKey]);

  const filtered = useMemo(
    () =>
      (all ?? []).filter(
        (c) => norm(c.name).includes(norm(query)) && (!onlyTodo || statusOf(c) !== "done"),
      ),
    [all, query, onlyTodo],
  );

  const todoCount = useMemo(
    () => (all ?? []).filter((c) => statusOf(c) !== "done").length,
    [all],
  );

  const selected = useMemo(
    () => (all ?? []).find((c) => c.key === selectedKey) ?? null,
    [all, selectedKey],
  );

  if (error) return <p className="error">{error}</p>;
  if (!all) return <p className="loading">Chargement des fiches…</p>;

  return (
    <div>
      <input
        className="fiche-search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          const matches = (all ?? []).filter((c) => norm(c.name).includes(norm(e.target.value)));
          if (matches.length === 1) setSelectedKey(matches[0].key);
        }}
        placeholder="Rechercher un champion…"
        spellCheck={false}
        autoFocus
      />

      <div className="fiche-toolbar">
        <span className="fiche-count">
          <span className="dot draft" /> {todoCount} fiche{todoCount > 1 ? "s" : ""} à finir sur{" "}
          {all.length}
        </span>
        <label className="fiche-filter">
          <input
            type="checkbox"
            checked={onlyTodo}
            onChange={(e) => setOnlyTodo(e.target.checked)}
          />
          À finir seulement
        </label>
      </div>

      {selected && (
        <div className="fiche">
          <div className="fiche-head">
            <img src={selected.icon} alt="" />
            <div className="row-text">
              <p className="row-name">
                {selected.name} <span className="row-title">{selected.title}</span>
                {selected.archetype && <span className="chip">{selected.archetype}</span>}
                {selected.styleTags.map((t) => (
                  <span key={t} className="chip style">
                    {t}
                  </span>
                ))}
                {statusOf(selected) !== "done" && (
                  <span className={`chip flag ${statusOf(selected)}`}>
                    Fiche {STATUS_LABEL[statusOf(selected) as "draft" | "empty"]}
                  </span>
                )}
              </p>
              <p className="row-reason">
                Difficulté {selected.difficulty}/10
                {Object.entries(selected.wrByRole).map(([r, s]) => (
                  <span key={r}>
                    {" "}
                    · {ROLE_LABELS[r]} : {s.wr.toFixed(1).replace(".", ",")} %
                  </span>
                ))}
                {statusOf(selected) === "draft" && " · vecteurs à affiner, sans plan de jeu"}
                {statusOf(selected) === "empty" && " · aucune fiche de style, à créer"}
              </p>
            </div>
          </div>

          {!editing && selected.style && (
            <div className="fiche-bars">
              {DIMS.map(([dim, label]) => (
                <div className="bar-row" key={dim}>
                  <span className="bar-label">{label}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${selected.style![dim]}%` }} />
                  </div>
                  <span className="bar-value">{selected.style![dim]}</span>
                </div>
              ))}
              {selected.tempo !== null && (
                <div className="bar-row">
                  <span className="bar-label">Tempo</span>
                  <div className="bar-track tempo">
                    <div className="bar-dot" style={{ left: `${selected.tempo}%` }} />
                  </div>
                  <span className="bar-value">{selected.tempo < 40 ? "early" : selected.tempo > 60 ? "late" : "mid"}</span>
                </div>
              )}
              <div className="bar-row">
                <span className="bar-label">CC</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${selected.cc}%`, background: "var(--gold)" }} />
                </div>
                <span className="bar-value">{selected.cc}</span>
              </div>
              <div className="bar-row">
                <span className="bar-label">Mobilité</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${selected.mobility}%`, background: "var(--gold)" }} />
                </div>
                <span className="bar-value">{selected.mobility}</span>
              </div>
            </div>
          )}

          {editing && (
            <div className="fiche-bars fiche-edit">
              {[...DIMS, ["tempo", "Tempo"] as [string, string], ["cc", "CC"] as [string, string], ["mobility", "Mobilité"] as [string, string]].map(
                ([dim, label]) => (
                  <div className="bar-row" key={dim}>
                    <span className="bar-label">{label}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={edit[dim] ?? 0}
                      onChange={(e) => setEdit({ ...edit, [dim]: Number(e.target.value) })}
                    />
                    <span className="bar-value">{edit[dim] ?? 0}</span>
                  </div>
                ),
              )}
            </div>
          )}

          <div className="fiche-actions">
            {!editing ? (
              <>
                <button
                  onClick={() => {
                    const s = selected.style ?? {};
                    setEdit({
                      splitpush: s.splitpush ?? 30,
                      teamfight: s.teamfight ?? 40,
                      pick: s.pick ?? 30,
                      poke: s.poke ?? 20,
                      engage: s.engage ?? 30,
                      peel: s.peel ?? 20,
                      roam: s.roam ?? 20,
                      tempo: selected.tempo ?? 50,
                      cc: selected.cc,
                      mobility: selected.mobility,
                    });
                    setEditing(true);
                    setSaved(false);
                  }}
                >
                  Modifier la fiche
                </button>
                {saved && <span className="saved">Sauvegardé</span>}
              </>
            ) : (
              <>
                <button
                  onClick={async () => {
                    const { tempo, cc, mobility, ...style } = edit;
                    const res = await fetch(`/api/fiches/${selected.id}`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ style, tempo, cc, mobility }),
                    });
                    if (res.ok) {
                      setEditing(false);
                      setSaved(true);
                      await reload();
                    }
                  }}
                >
                  Sauvegarder
                </button>
                <button onClick={() => setEditing(false)}>Annuler</button>
              </>
            )}
          </div>

          {selected.plan ? (
            <dl className="plan">
              <dt>Early</dt>
              <dd>{selected.plan.early}</dd>
              <dt>Mid</dt>
              <dd>{selected.plan.mid}</dd>
              <dt>Late</dt>
              <dd>{selected.plan.late}</dd>
              <dt>Draft</dt>
              <dd>{selected.plan.draft}</dd>
            </dl>
          ) : (
            <p className="blurb">{selected.blurb}</p>
          )}

          {selected.tips.length > 0 && (
            <ul className="fiche-tips">
              {selected.tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}

          {selected.sources.length > 0 && (
            <p className="fiche-sources">
              Sources :{" "}
              {selected.sources.map((s, i) => (
                <a key={i} href={s} target="_blank" rel="noreferrer">
                  [{i + 1}]
                </a>
              ))}
            </p>
          )}
        </div>
      )}

      <div className="fiche-grid">
        {filtered.map((c) => {
          const st = statusOf(c);
          return (
            <button
              key={c.key}
              className={`tile ${c.key === selectedKey ? "active" : ""} ${st !== "done" ? "todo" : ""}`}
              onClick={() => setSelectedKey(c.key)}
            >
              {st !== "done" && (
                <span
                  className={`fiche-dot ${st}`}
                  title={`Fiche ${STATUS_LABEL[st as "draft" | "empty"]}`}
                />
              )}
              <img src={c.icon} alt="" loading="lazy" />
              <span>{c.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
