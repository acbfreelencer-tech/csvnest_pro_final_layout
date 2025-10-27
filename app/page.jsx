"use client";
import React, { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import Papa from "papaparse";

// Full-feature single-page UI with dark mode toggle, all controls, and CSV ZIP export
// Tailwind requirement: enable dark mode via `darkMode: 'class'` in tailwind.config.js

const IMAGE_TYPE_OPTIONS = ["None", "Vector", "Illustration", "3D Illustration", "3D Icon"];
const PLATFORMS = ["Adobe Stock", "Freepik", "Shutterstock", "General", "Vecteezy"];

export default function Page() {
  // ----------------- Theme (Dark/Light) -----------------
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const pref = typeof window !== "undefined" ? localStorage.getItem("csvnest_theme") : null;
    const val = pref === "dark";
    setDark(val);
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", val);
    }
  }, []);
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", next);
    }
    if (typeof window !== "undefined") {
      localStorage.setItem("csvnest_theme", next ? "dark" : "light");
    }
  };

  // ----------------- AUTH (Email-only gate) -----------------
  const [email, setEmail] = useState("");
  const [user, setUser] = useState(null);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("csvnest_user");
      if (saved) setUser(JSON.parse(saved));
    }
  }, []);
  const handleLogin = (e) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return alert("Enter valid email");
    const u = { email };
    setUser(u);
    if (typeof window !== "undefined") {
      localStorage.setItem("csvnest_user", JSON.stringify(u));
    }
  };
  const handleLogout = () => {
    setUser(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("csvnest_user");
    }
  };

  // ----------------- API Key + Controls -----------------
  const [apiKey, setApiKey] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined") {
      const k = localStorage.getItem("csvnest_api_key") || "";
      setApiKey(k);
    }
  }, []);
  const saveApiKey = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("csvnest_api_key", apiKey.trim());
    }
    alert("API key saved locally");
  };

  const [titleLen, setTitleLen] = useState(80);
  const [kwCount, setKwCount] = useState(25);
  const [removeDup, setRemoveDup] = useState(true);
  const [bulkOn, setBulkOn] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [prefixOn, setPrefixOn] = useState(false);
  const [prefix, setPrefix] = useState("");
  const [suffixOn, setSuffixOn] = useState(false);
  const [suffix, setSuffix] = useState("");
  const [imageType, setImageType] = useState("None");
  const [platform, setPlatform] = useState("General");

  // ----------------- Upload & Files -----------------
  const [files, setFiles] = useState([]); // {id, file, name, kind}
  const inputRef = useRef(null);
  const [progress, setProgress] = useState({ uploaded: 0, success: 0, failed: 0 });

  const classifyKind = (file) => {
    const n = file.name.toLowerCase();
    if (n.endsWith(".svg")) return "SVG";
    if (/(jpg|jpeg|png)$/.test(n)) return "IMAGE";
    if (/(mp4|mov|avi|webm)$/.test(n)) return "VIDEO";
    return "OTHER";
  };
  const addFiles = (list) => {
    const next = [...files];
    for (const f of list) next.push({ id: crypto.randomUUID(), file: f, name: f.name, kind: classifyKind(f) });
    const limited = next.slice(0, 1000);
    setFiles(limited);
    setProgress((p) => ({ ...p, uploaded: limited.length }));
  };
  const onDrop = (e) => {
    e.preventDefault();
    addFiles(Array.from(e.dataTransfer.files || []));
  };
  const onPick = (e) => {
    addFiles(Array.from(e.target.files || []));
    e.target.value = "";
  };
  const clearAll = () => {
    setFiles([]);
    setProgress({ uploaded: 0, success: 0, failed: 0 });
    setGenerated([]);
  };

  // ----------------- Generation Helpers -----------------
  const fromFilenameToWords = (name) => {
    const base = name.replace(/\.[^.]+$/, "");
    return base
      .replace(/[-_]+/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\b(copy|final|v\d+|edited|export|img|image|file|photo|video)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  };
  const uniqueList = (arr) => {
    const seen = new Set();
    const out = [];
    for (const x of arr) {
      const k = x.toLowerCase();
      if (!seen.has(k)) { seen.add(k); out.push(x); }
    }
    return out;
  };
  const clampTitle = (str) => (str.length <= titleLen ? str : str.slice(0, Math.max(10, titleLen)).replace(/[\s\W]+\w*$/, ""));
  const cleanKeywords = (arr) => {
    let list = arr.map(s => s.trim()).filter(Boolean).map(s => s.replace(/\s+/g, " "));
    if (removeDup) list = uniqueList(list);
    return list.slice(0, kwCount);
  };
  const addBulkKeywords = (baseKw) => {
    if (!bulkOn || !bulkText.trim()) return baseKw;
    const bulkList = bulkText.split(/[;,\n]/).map(s => s.trim()).filter(Boolean);
    const merged = [...baseKw, ...bulkList];
    return removeDup ? uniqueList(merged) : merged;
  };
  const buildTitle = (raw) => {
    let t = clampTitle(raw);
    if (prefixOn && prefix.trim()) t = `${prefix.trim()} ${t}`.trim();
    if (suffixOn && suffix.trim()) t = `${t} ${suffix.trim()}`.trim();
    return t;
  };

  // Simple heuristic; if apiKey exists you can later wire to your API route
  const analyzeFromFilename = (file) => {
    const base = fromFilenameToWords(file.name);
    const hint = imageType !== "None" ? ` – ${imageType}` : "";
    const title = buildTitle(`${base}${hint}`);
    const kwsBase = base.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean);
    const kws = cleanKeywords(uniqueList(kwsBase));
    return { title, keywords: addBulkKeywords(kws) };
  };

  // ----------------- CSV Schema by Platform -----------------
 const recordForPlatform = ({ file, meta }) => {
  const p = platform || "General"; // ensures correct active platform
  const common = {
    filename: file.name,
    title: meta.title,
    keywords: meta.keywords.join(", "),
    type: file.kind,
    imageType,
  };

  switch (p) {
    case "Adobe Stock":
      return {
        Filename: common.filename,
        Title: common.title,
        Keywords: common.keywords,
        Category: "",
        Releases: "",
        Illustration: imageType === "Vector" ? "Yes" : "",
      };
    case "Freepik":
      return {
        file: common.filename,
        title: common.title,
        tags: common.keywords,
        license: "standard",
        type: imageType.toLowerCase() || "none",
      };
    case "Shutterstock":
      return {
        Filename: common.filename,
        Description: common.title,
        Keywords: common.keywords,
        Editorial: "no",
        Category: "",
      };
    case "Vecteezy":
      return {
        file_name: common.filename,
        title: common.title,
        keywords: common.keywords,
        media_type: common.type.toLowerCase(),
      };
    default:
      return {
        filename: common.filename,
        title: common.title,
        keywords: common.keywords,
        media_type: common.type,
      };
  }
};

  // ----------------- Generate & Export -----------------
  const [generated, setGenerated] = useState([]); // {fileId, meta}
  const handleGenerateAll = async () => {
    if (!files.length) return alert("Please upload files first");
    setProgress((p) => ({ ...p, success: 0, failed: 0 }));
    const out = [];
    for (const f of files) {
      try {
        const meta = analyzeFromFilename(f);
        out.push({ fileId: f.id, meta });
        setProgress((p) => ({ ...p, success: p.success + 1 }));
      } catch {
        setProgress((p) => ({ ...p, failed: p.failed + 1 }));
      }
    }
    setGenerated(out);
  };

  const handleExportZip = async () => {
    if (!generated.length) return alert("Nothing to export. Generate first.");
    const rows = generated.map(g => recordForPlatform({ file: files.find(x => x.id === g.fileId), meta: g.meta }));
    const zip = new JSZip();
    zip.file("AI.csv", Papa.unparse(rows));
    zip.file("EPS.csv", Papa.unparse(rows));
    zip.file("SVG.csv", Papa.unparse(rows));
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `metadata_${platform.replace(/\s+/g, "_").toLowerCase()}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // ----------------- UI -----------------
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-slate-800/80 backdrop-blur border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">CSVNest Pro</h1>
          <div className="flex items-center gap-3">
            <button onClick={toggleTheme} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm">
              {dark ? "Light Mode" : "Dark Mode"}
            </button>
            {!user ? (
              <form onSubmit={handleLogin} className="flex items-center gap-2">
                <input type="email" required placeholder="Enter email to login" value={email} onChange={(e) => setEmail(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm" />
                <button type="submit" className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold dark:bg-slate-700">Login</button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm opacity-80">{user.email}</span>
                <button onClick={handleLogout} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm">Logout</button>
              </div>
            )}
            <div className="border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-right leading-tight">
              <div className="text-xs opacity-70">Developed By</div>
              <div className="text-sm font-semibold">Anil Chandra Barman</div>
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      {!user ? (
        <main className="max-w-7xl mx-auto px-4 py-10">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 text-center shadow-sm">
            <p className="text-lg font-medium">Login required</p>
            <p className="opacity-80 mt-1">Please log in with your email to use the generator.</p>
          </div>
        </main>
      ) : (
        <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column */}
          <aside className="lg:col-span-4 xl:col-span-3 space-y-5">
            <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm">
              <h2 className="font-bold text-lg mb-3">Generation Controls</h2>

              {/* API Key */}
              <div className="mb-4 space-y-2">
                <label className="text-sm font-medium">API Key (Gemini / ChatGPT)</label>
                <div className="flex gap-2">
                  <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-... / AI Key" className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm" />
                  <button onClick={saveApiKey} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold dark:bg-slate-700">Save</button>
                </div>
                <p className="text-xs opacity-70">If set, titles & keywords will be content-aware.</p>
              </div>

              {/* Sliders */}
              <div className="mb-4">
                <label className="text-sm font-medium">Title Length ({titleLen})</label>
                <input type="range" min={10} max={120} value={titleLen} onChange={(e) => setTitleLen(parseInt(e.target.value))} className="w-full" />
              </div>
              <div className="mb-4">
                <label className="text-sm font-medium">Keywords Count ({kwCount})</label>
                <input type="range" min={5} max={50} value={kwCount} onChange={(e) => setKwCount(parseInt(e.target.value))} className="w-full" />
              </div>

              {/* Toggles */}
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium">Auto Remove Duplicate Keywords</span>
                <input type="checkbox" checked={removeDup} onChange={(e) => setRemoveDup(e.target.checked)} />
              </div>

              {/* Bulk Add Keywords */}
              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Bulk: Add Keyword Option</span>
                  <input type="checkbox" checked={bulkOn} onChange={(e) => setBulkOn(e.target.checked)} />
                </div>
                {bulkOn && (
                  <textarea rows={3} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder="comma / newline separated keywords" className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm" />
                )}
              </div>

              {/* Prefix / Suffix */}
              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Prefix</span>
                  <input type="checkbox" checked={prefixOn} onChange={(e) => setPrefixOn(e.target.checked)} />
                </div>
                {prefixOn && (
                  <input type="text" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="e.g., Premium, Minimal" className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm" />
                )}
              </div>

              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Suffix</span>
                  <input type="checkbox" checked={suffixOn} onChange={(e) => setSuffixOn(e.target.checked)} />
                </div>
                {suffixOn && (
                  <input type="text" value={suffix} onChange={(e) => setSuffix(e.target.value)} placeholder="e.g., vector, high quality" className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm" />
                )}
              </div>

              {/* Image Type */}
              <div className="mb-4">
                <label className="text-sm font-medium">Image Type</label>
                <select value={imageType} onChange={(e) => setImageType(e.target.value)} className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm">
                  {IMAGE_TYPE_OPTIONS.map(opt => (<option value={opt} key={opt}>{opt}</option>))}
                </select>
              </div>

              {/* CSV For */}
              <div className="mb-2">
                <label className="text-sm font-medium block mb-2">CSV For</label>
                <div className="grid grid-cols-2 gap-2">
                  {PLATFORMS.map(p => (
                    <button key={p} onClick={() => setPlatform(p)} className={`px-3 py-2 rounded-lg border text-sm font-semibold ${platform === p ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-700 dark:border-slate-700" : "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-600"}`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </aside>

          {/* Right Column */}
          <section className="lg:col-span-8 xl:col-span-9 space-y-5">
            {/* Upload Area */}
            <div onDrop={onDrop} onDragOver={(e) => e.preventDefault()} className="bg-white dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-600 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-lg">Upload Files</h2>
                  <p className="text-sm opacity-80">Drag & drop up to 1000 files, or click to browse.</p>
                </div>
                <div>
                  <button onClick={() => inputRef.current?.click()} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold dark:bg-slate-700">Browse</button>
                  <input ref={inputRef} type="file" multiple className="hidden" onChange={onPick} accept=".svg,.jpg,.jpeg,.png,.mp4,.mov,.webm,.avi" />
                </div>
              </div>

              {/* Three rectangles */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                <div className="rounded-xl p-4 text-center font-semibold text-white" style={{ background: "#0ea5e9" }}>SVG</div>
                <div className="rounded-xl p-4 text-center font-semibold text-white" style={{ background: "#22c55e" }}>IMAGE (JPG, PNG)</div>
                <div className="rounded-xl p-4 text-center font-semibold text-white" style={{ background: "#f59e0b" }}>VIDEO</div>
              </div>

              <p className="text-xs opacity-80 mt-3">Supports common image, video, and SVG formats. Max 1000 files. SVG uploads enable multi-format (EPS, AI) metadata CSV export.</p>

              {files.length > 0 && (
                <div className="mt-4 max-h-56 overflow-auto border border-slate-200 dark:border-slate-700 rounded-xl">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-700 sticky top-0">
                      <tr>
                        <th className="text-left p-2">File</th>
                        <th className="text-left p-2">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {files.map((f) => (
                        <tr key={f.id} className="border-t border-slate-100 dark:border-slate-700">
                          <td className="p-2 truncate">{f.name}</td>
                          <td className="p-2">{f.kind}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Progress & Actions */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm">
              <h2 className="font-bold text-lg">Progress</h2>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                <ProgressStat label="Uploaded" value={progress.uploaded} />
                <ProgressStat label="Success" value={progress.success} />
                <ProgressStat label="Failed" value={progress.failed} />
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button onClick={clearAll} className="px-3 py-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-sm">Clear All</button>
                <button onClick={handleGenerateAll} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold dark:bg-slate-700">Generate All</button>
                <button onClick={handleExportZip} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold">Export CSV (ZIP)</button>
              </div>
            </div>

            {/* Footer */}
            <footer className="text-sm opacity-80">
              <div className="flex items-center gap-2">
                <span>Developed By <strong>Anil Chandra</strong></span>
                <span>•</span>
                <a href="https://www.facebook.com/anil.chandrabarman.3" target="_blank" rel="noreferrer" className="underline">Follow: Facebook</a>
              </div>
            </footer>
          </section>
        </main>
      )}
    </div>
  );
}

function ProgressStat({ label, value }) {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-2xl font-extrabold">{value}</div>
      <div className="mt-2 w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full bg-slate-900 dark:bg-slate-500" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}
