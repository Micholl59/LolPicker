import { useEffect, useState } from "react";

interface SettingsInfo {
  hasKey: boolean;
  keyPreview: string | null;
  cluster: string;
}

export default function Settings() {
  const [info, setInfo] = useState<SettingsInfo | null>(null);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = () =>
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setStatus({ kind: "error", text: "Impossible de contacter le serveur" }));

  useEffect(() => {
    reload();
  }, []);

  const save = async () => {
    const apiKey = value.trim();
    if (!apiKey) return;
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/settings/riot-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setStatus({ kind: json.valid === false ? "error" : json.valid === null ? "warn" : "ok", text: json.message });
      setValue("");
      await reload();
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : "Erreur d'enregistrement" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="settings-card">
        <h2>Clé API Riot</h2>
        <p className="settings-hint">
          La clé de développeur Riot expire toutes les 24 h. Régénère-la sur{" "}
          <a href="https://developer.riotgames.com" target="_blank" rel="noreferrer">
            developer.riotgames.com
          </a>{" "}
          puis colle-la ici — elle est prise en compte immédiatement, sans redémarrer le serveur.
        </p>

        {info && (
          <p className="settings-current">
            Clé actuelle :{" "}
            {info.hasKey ? <code>{info.keyPreview}</code> : <span className="warn">aucune clé enregistrée</span>}
            {" · "}Cluster : <code>{info.cluster}</code>
          </p>
        )}

        <div className="settings-row">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            spellCheck={false}
          />
          <button onClick={save} disabled={saving || !value.trim()}>
            {saving ? "Vérification…" : "Enregistrer"}
          </button>
        </div>

        {status && <p className={`settings-status ${status.kind}`}>{status.text}</p>}
      </div>
    </div>
  );
}
