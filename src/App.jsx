import React, { useState, useEffect, useCallback } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  runTransaction,
  arrayUnion,
  query,
  orderBy,
} from "firebase/firestore";
import { db, ensureAuth } from "./firebase.js";

const todayISO = () => new Date().toISOString().slice(0, 10);
const formatDateFR = (iso) => {
  const [y, m, d] = iso.split("-");
  return `${parseInt(d)}/${m}/${y}`;
};
const genSachetCode = () =>
  "#" + Math.floor(1000000 + Math.random() * 9000000).toString();

export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("nouvelle");
  const [sterilizers, setSterilizers] = useState(null);
  const [charges, setCharges] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    ensureAuth()
      .then(() => setReady(true))
      .catch(() => setErr("Impossible de se connecter à la base de données."));
  }, []);

  useEffect(() => {
    if (!ready) return;
    const unsubS = onSnapshot(
      collection(db, "sterilisateurs"),
      (snap) => setSterilizers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setErr("Erreur de lecture des stérilisateurs.")
    );
    const unsubC = onSnapshot(
      query(collection(db, "charges"), orderBy("date", "desc")),
      (snap) => setCharges(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setErr("Erreur de lecture des charges.")
    );
    return () => {
      unsubS();
      unsubC();
    };
  }, [ready]);

  const addSterilizer = useCallback(async (name, startCycle) => {
    try {
      await addDoc(collection(db, "sterilisateurs"), {
        name,
        nextCycle: startCycle,
      });
    } catch {
      setErr("Erreur en ajoutant le stérilisateur.");
    }
  }, []);

  const updateSterilizerCycle = useCallback(async (id, nextCycle) => {
    try {
      await updateDoc(doc(db, "sterilisateurs", id), { nextCycle });
    } catch {
      setErr("Erreur en mettant à jour le cycle.");
    }
  }, []);

  const removeSterilizer = useCallback(async (id) => {
    try {
      await deleteDoc(doc(db, "sterilisateurs", id));
    } catch {
      setErr("Erreur en retirant le stérilisateur.");
    }
  }, []);

  // Transaction: réserve le numéro de cycle du stérilisateur et crée la
  // charge (encore vide) en une seule opération atomique, pour éviter que
  // deux charges se retrouvent avec le même numéro de cycle.
  const startCharge = useCallback(async (sterilizerId) => {
    const sterilizerRef = doc(db, "sterilisateurs", sterilizerId);
    const chargeRef = doc(collection(db, "charges"));
    const charge = await runTransaction(db, async (tx) => {
      const sterSnap = await tx.get(sterilizerRef);
      if (!sterSnap.exists()) throw new Error("Stérilisateur introuvable");
      const sterData = sterSnap.data();
      const cycleNumber = sterData.nextCycle;
      const newCharge = {
        date: todayISO(),
        sterilizerId,
        sterilizerName: sterData.name,
        cycleNumber,
        sachets: [],
      };
      tx.set(chargeRef, newCharge);
      tx.update(sterilizerRef, { nextCycle: cycleNumber + 1 });
      return { id: chargeRef.id, ...newCharge };
    });
    return charge;
  }, []);

  // Ajoute un sachet à une charge déjà démarrée (un clic = un sachet imprimé).
  const addSachet = useCallback(async (chargeId, sachet) => {
    try {
      await updateDoc(doc(db, "charges", chargeId), {
        sachets: arrayUnion(sachet),
      });
    } catch {
      setErr("Erreur en enregistrant le sachet.");
    }
  }, []);

  const loading = !ready || sterilizers === null || charges === null;

  return (
    <div style={{ minHeight: "100%" }}>
      <style>{css}</style>
      <div className="ts-shell">
        <aside className="ts-side">
          <div className="ts-brand">
            <div className="ts-brand-mark" aria-hidden="true">
              <svg viewBox="0 0 40 40" width="28" height="28">
                <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeWidth="2.5" />
                <path d="M20 8 L20 20 L28 26" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <div className="ts-brand-title">Traçabilité</div>
              <div className="ts-brand-sub">Stérilisation</div>
            </div>
          </div>
          <nav className="ts-nav">
            <button className={tab === "nouvelle" ? "active" : ""} onClick={() => setTab("nouvelle")}>
              <span className="ts-nav-num">01</span> Nouvelle charge
            </button>
            <button className={tab === "consulter" ? "active" : ""} onClick={() => setTab("consulter")}>
              <span className="ts-nav-num">02</span> Consulter
            </button>
            <button className={tab === "sterilisateurs" ? "active" : ""} onClick={() => setTab("sterilisateurs")}>
              <span className="ts-nav-num">03</span> Stérilisateurs
            </button>
          </nav>
          <div className="ts-side-foot">Connecté à Firebase — données partagées en temps réel</div>
        </aside>

        <main className="ts-main">
          {err && <div className="ts-error">{err}</div>}
          {loading ? (
            <div className="ts-loading">Chargement…</div>
          ) : tab === "sterilisateurs" ? (
            <SterilizersPanel
              sterilizers={sterilizers}
              onAdd={addSterilizer}
              onUpdateCycle={updateSterilizerCycle}
              onRemove={removeSterilizer}
            />
          ) : tab === "nouvelle" ? (
            <NewChargePanel sterilizers={sterilizers} onStartCharge={startCharge} onAddSachet={addSachet} />
          ) : (
            <ConsultPanel sterilizers={sterilizers} charges={charges} />
          )}
        </main>
      </div>
    </div>
  );
}

/* ---------------- Stérilisateurs ---------------- */
function SterilizersPanel({ sterilizers, onAdd, onUpdateCycle, onRemove }) {
  const [name, setName] = useState("");
  const [start, setStart] = useState("");

  const add = () => {
    if (!name.trim() || start === "") return;
    onAdd(name.trim(), parseInt(start, 10));
    setName("");
    setStart("");
  };

  return (
    <div>
      <h1 className="ts-h1">Stérilisateurs</h1>
      <p className="ts-lead">
        Ajoute chaque stérilisateur une seule fois. Le numéro de cycle de départ est celui
        où l'appareil est rendu au moment où tu commences à l'utiliser dans le système 
        chaque nouvelle charge l'augmente de 1 automatiquement.
      </p>

      <div className="ts-card ts-form-row">
        <div className="ts-field">
          <label>Nom / numéro</label>
          <input placeholder="S1" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="ts-field ts-field-narrow">
          <label>Cycle de départ</label>
          <input
            type="number"
            placeholder="2345"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <button className="ts-btn ts-btn-primary" onClick={add}>
          Ajouter
        </button>
      </div>

      {sterilizers.length === 0 ? (
        <div className="ts-empty">
          Aucun stérilisateur configuré. Ajoute-en un ci-dessus pour commencer.
        </div>
      ) : (
        <div className="ts-list">
          {sterilizers.map((s) => (
            <div className="ts-list-item" key={s.id}>
              <div className="ts-list-item-main">
                <div className="ts-list-item-title">{s.name}</div>
                <div className="ts-list-item-sub">Prochain cycle</div>
              </div>
              <input
                className="ts-inline-num"
                type="number"
                value={s.nextCycle}
                onChange={(e) => onUpdateCycle(s.id, parseInt(e.target.value || "0", 10))}
              />
              <button className="ts-btn ts-btn-ghost" onClick={() => onRemove(s.id)}>
                Retirer
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Nouvelle charge ---------------- */
function NewChargePanel({ sterilizers, onStartCharge, onAddSachet }) {
  const [sterilizerId, setSterilizerId] = useState(sterilizers[0]?.id || "");
  const [session, setSession] = useState(null);
  const [sachets, setSachets] = useState([]);
  const [busyStart, setBusyStart] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sterilizerId && sterilizers.length) setSterilizerId(sterilizers[0].id);
  }, [sterilizers, sterilizerId]);

  const sterilizer = sterilizers.find((s) => s.id === sterilizerId);

  const start = async () => {
    if (!sterilizer) return;
    setBusyStart(true);
    setError("");
    try {
      const charge = await onStartCharge(sterilizer.id);
      setSession(charge);
      setSachets([]);
    } catch {
      setError("Erreur en démarrant la charge. Réessaie.");
    } finally {
      setBusyStart(false);
    }
  };

  const addOne = async () => {
    if (!session) return;
    setError("");
    const sachet = { code: genSachetCode(), index: sachets.length + 1 };
    setSachets((prev) => [...prev, sachet]);
    try {
      await onAddSachet(session.id, sachet);
    } catch {
      setError("Le sachet a été ajouté mais pas sauvegardé — vérifie ta connexion.");
    }
  };

  const finishAndPrint = () => {
    if (sachets.length > 0) {
      window.print();
    }
    setSession(null);
    setSachets([]);
    setError("");
  };

  if (sterilizers.length === 0) {
    return (
      <div>
        <h1 className="ts-h1">Nouvelle charge</h1>
        <div className="ts-empty">
          Configure d'abord au moins un stérilisateur dans l'onglet « Stérilisateurs ».
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="ts-h1">Nouvelle charge</h1>
      <p className="ts-lead">
        Choisis le stérilisateur et démarre la charge, puis ajoute les sachets un par un 
        autant que nécessaire. À la fin, termine la charge pour imprimer toutes les étiquettes
        d'un coup.
      </p>

      {!session ? (
        <div className="ts-card">
          <div className="ts-form-row">
            <div className="ts-field">
              <label>Stérilisateur</label>
              <select value={sterilizerId} onChange={(e) => setSterilizerId(e.target.value)}>
                {sterilizers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="ts-preview-strip">
            <div>
              <span className="ts-mono-label">Date</span>
              <span className="ts-mono-val">{formatDateFR(todayISO())}</span>
            </div>
            <div>
              <span className="ts-mono-label">Cycle</span>
              <span className="ts-mono-val">{sterilizer ? sterilizer.nextCycle : "—"}</span>
            </div>
          </div>

          {error && <div className="ts-error" style={{ marginTop: 14 }}>{error}</div>}

          <button className="ts-btn ts-btn-primary ts-btn-wide" onClick={start} disabled={busyStart}>
            {busyStart ? "Démarrage…" : "Démarrer la charge"}
          </button>
        </div>
      ) : (
        <div className="ts-card ts-sheet">
          <div className="ts-sheet-head">
            <div>
              <div className="ts-sheet-title">
                Cycle {session.cycleNumber} · {session.sterilizerName}
              </div>
              <div className="ts-sheet-sub">
                {formatDateFR(session.date)} · {sachets.length} sachet(s) ajouté(s)
              </div>
            </div>
          </div>

          {error && <div className="ts-error" style={{ marginBottom: 14 }}>{error}</div>}

          <div className="ts-print-actions">
            <button className="ts-btn ts-btn-print" onClick={addOne}>
              + Ajouter un sachet
            </button>
            <button className="ts-btn ts-btn-stop" onClick={finishAndPrint}>
              Terminer et imprimer
            </button>
          </div>

          {sachets.length > 0 && (
            <div className="ts-sachet-grid" style={{ marginTop: 18 }}>
              {sachets.map((s) => (
                <div className="ts-sachet-chip" key={s.code}>
                  {s.code}
                </div>
              ))}
            </div>
          )}

          {/* Zone imprimable : toutes les étiquettes de la charge, imprimées d'un coup */}
          <div className="ts-labels-grid" id="ts-printable" style={{ marginTop: sachets.length ? 18 : 0 }}>
            {sachets.map((s) => (
              <div className="ts-label" key={s.code}>
                <div className="ts-label-head">
                  {formatDateFR(session.date)} &nbsp; {session.sterilizerName} &nbsp; CYCLE{" "}
                  {session.cycleNumber}
                </div>
                <div className="ts-label-num">{s.code}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Consulter ---------------- */
function ConsultPanel({ sterilizers, charges }) {
  const [date, setDate] = useState(todayISO());
  const [openSterilizer, setOpenSterilizer] = useState(null);
  const [openCharge, setOpenCharge] = useState(null);

  const dayCharges = charges.filter((c) => c.date === date);
  const bySterilizer = sterilizers
    .map((s) => ({
      sterilizer: s,
      charges: dayCharges.filter((c) => c.sterilizerId === s.id),
    }))
    .filter((g) => g.charges.length > 0);

  return (
    <div>
      <h1 className="ts-h1">Consulter</h1>
      <p className="ts-lead">Choisis une date pour voir les stérilisateurs utilisés et leurs charges.</p>

      <div className="ts-card ts-form-row">
        <div className="ts-field ts-field-narrow">
          <label>Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setOpenSterilizer(null);
              setOpenCharge(null);
            }}
          />
        </div>
      </div>

      {bySterilizer.length === 0 ? (
        <div className="ts-empty">Aucune charge enregistrée pour le {formatDateFR(date)}.</div>
      ) : (
        <div className="ts-list">
          {bySterilizer.map((g) => (
            <div key={g.sterilizer.id}>
              <div
                className="ts-list-item ts-clickable"
                onClick={() =>
                  setOpenSterilizer(openSterilizer === g.sterilizer.id ? null : g.sterilizer.id)
                }
              >
                <div className="ts-list-item-main">
                  <div className="ts-list-item-title">{g.sterilizer.name}</div>
                  <div className="ts-list-item-sub">{g.charges.length} charge(s)</div>
                </div>
                <span className="ts-chevron">{openSterilizer === g.sterilizer.id ? "−" : "+"}</span>
              </div>

              {openSterilizer === g.sterilizer.id && (
                <div className="ts-sublist">
                  {g.charges.map((c) => (
                    <div key={c.id}>
                      <div
                        className="ts-list-item ts-clickable ts-sub-item"
                        onClick={() => setOpenCharge(openCharge === c.id ? null : c.id)}
                      >
                        <div className="ts-list-item-main">
                          <div className="ts-list-item-title">Cycle {c.cycleNumber}</div>
                          <div className="ts-list-item-sub">{c.sachets.length} sachets</div>
                        </div>
                        <span className="ts-chevron">{openCharge === c.id ? "−" : "+"}</span>
                      </div>
                      {openCharge === c.id && (
                        <div className="ts-sachet-grid">
                          {c.sachets.map((s) => (
                            <div className="ts-sachet-chip" key={s.code}>
                              {s.code}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const css = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');

:root {
  --teal-deep: #0F3D3D;
  --teal-mid: #1F5C5C;
  --surface: #F6F8F7;
  --surface-alt: #EAF0EE;
  --ink: #16221F;
  --steel: #6B8E90;
  --amber: #C98A2C;
  --line: #D8E2DF;
}
.ts-shell { display: flex; min-height: 100vh; background: var(--surface); color: var(--ink); font-family: 'Inter', sans-serif; }
.ts-side { width: 240px; flex-shrink: 0; background: var(--teal-deep); color: #EAF0EE; padding: 28px 20px; display: flex; flex-direction: column; }
.ts-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 36px; }
.ts-brand-mark { color: #7FB8B5; display: flex; }
.ts-brand-title { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 17px; letter-spacing: -0.01em; }
.ts-brand-sub { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #8FB5B2; }
.ts-nav { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.ts-nav button { text-align: left; background: none; border: none; color: #C7DCDA; font-family: 'Inter', sans-serif; font-size: 14px; padding: 11px 12px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.15s; }
.ts-nav button:hover { background: rgba(255,255,255,0.06); }
.ts-nav button.active { background: rgba(255,255,255,0.12); color: #fff; font-weight: 600; }
.ts-nav-num { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: #6FA09D; }
.ts-nav button.active .ts-nav-num { color: #C98A2C; }
.ts-side-foot { font-size: 11px; color: #6C9391; line-height: 1.5; border-top: 1px solid rgba(255,255,255,0.12); padding-top: 14px; }

.ts-main { flex: 1; padding: 44px 56px; max-width: 880px; }
.ts-h1 { font-family: 'Space Grotesk', sans-serif; font-size: 28px; font-weight: 700; margin: 0 0 8px; letter-spacing: -0.01em; }
.ts-lead { color: var(--steel); font-size: 14px; line-height: 1.6; margin: 0 0 24px; max-width: 560px; }
.ts-loading { color: var(--steel); font-size: 14px; }
.ts-error { background: #FBEAEA; color: #9B3B3B; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin-bottom: 16px; }

.ts-card { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 22px; margin-bottom: 20px; }
.ts-form-row { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; }
.ts-field { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 160px; }
.ts-field-narrow { flex: 0 0 140px; min-width: 100px; }
.ts-field label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--steel); font-weight: 600; }
.ts-field input, .ts-field select { border: 1px solid var(--line); border-radius: 6px; padding: 9px 11px; font-size: 14px; font-family: 'Inter', sans-serif; background: var(--surface); color: var(--ink); }
.ts-field input:focus, .ts-field select:focus { outline: 2px solid var(--teal-mid); outline-offset: 1px; }

.ts-btn { border: none; border-radius: 6px; padding: 10px 18px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: 'Inter', sans-serif; }
.ts-btn-primary { background: var(--teal-deep); color: #fff; }
.ts-btn-primary:hover { background: var(--teal-mid); }
.ts-btn-primary:disabled { opacity: 0.6; cursor: default; }
.ts-btn-ghost { background: none; color: #9B3B3B; border: 1px solid var(--line); }
.ts-btn-wide { width: 100%; margin-top: 16px; padding: 12px; }
.ts-print-actions { display: flex; gap: 12px; }
.ts-btn-print { flex: 1; background: #1F7A4C; color: #fff; padding: 14px; font-size: 15px; }
.ts-btn-print:hover { background: #24905A; }
.ts-btn-print:disabled { opacity: 0.6; cursor: default; }
.ts-btn-stop { flex: 1; background: #B23B3B; color: #fff; padding: 14px; font-size: 15px; }
.ts-btn-stop:hover { background: #C94848; }

.ts-preview-strip { display: flex; gap: 28px; margin-top: 18px; padding: 14px 16px; background: var(--surface-alt); border-radius: 8px; }
.ts-mono-label { display: block; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--steel); margin-bottom: 3px; }
.ts-mono-val { font-family: 'IBM Plex Mono', monospace; font-size: 17px; font-weight: 600; color: var(--teal-deep); }

.ts-empty { border: 1px dashed var(--line); border-radius: 10px; padding: 32px; text-align: center; color: var(--steel); font-size: 14px; }

.ts-list { display: flex; flex-direction: column; gap: 8px; }
.ts-list-item { display: flex; align-items: center; gap: 14px; background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 13px 16px; }
.ts-clickable { cursor: pointer; }
.ts-sub-item { background: var(--surface-alt); }
.ts-list-item-main { flex: 1; }
.ts-list-item-title { font-weight: 600; font-size: 14px; }
.ts-list-item-sub { font-size: 12px; color: var(--steel); margin-top: 2px; }
.ts-inline-num { width: 80px; font-family: 'IBM Plex Mono', monospace; border: 1px solid var(--line); border-radius: 6px; padding: 7px 9px; text-align: center; }
.ts-chevron { font-size: 18px; color: var(--steel); width: 20px; text-align: center; }
.ts-sublist { padding: 6px 0 6px 20px; display: flex; flex-direction: column; gap: 6px; }
.ts-sachet-grid { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 0 10px 40px; }
.ts-sachet-chip { font-family: 'IBM Plex Mono', monospace; font-size: 12px; background: var(--surface-alt); border: 1px solid var(--line); border-radius: 5px; padding: 5px 9px; color: var(--teal-deep); }

.ts-sheet-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
.ts-sheet-title { font-weight: 700; font-size: 15px; }
.ts-sheet-sub { font-size: 12px; color: var(--steel); margin-top: 2px; }
.ts-labels-grid { display: flex; flex-wrap: wrap; gap: 12px; }
.ts-label { width: 192px; aspect-ratio: 2 / 1; box-sizing: border-box; border: 1px solid var(--ink); border-radius: 4px; padding: 10px 12px; display: flex; flex-direction: column; justify-content: space-between; background: #fff; }
.ts-label-head { font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 600; color: var(--ink); line-height: 1.3; }
.ts-label-num { font-family: 'IBM Plex Mono', monospace; font-size: 22px; font-weight: 600; text-align: center; letter-spacing: 0.03em; color: var(--teal-deep); }

@media print {
  body * { visibility: hidden; }
  #ts-printable, #ts-printable * { visibility: visible; }
  #ts-printable { position: absolute; top: 0; left: 0; width: 100%; display: flex; flex-wrap: wrap; gap: 8px; }
  .ts-label { border: 1px solid #000; box-shadow: none; }
}
`;
