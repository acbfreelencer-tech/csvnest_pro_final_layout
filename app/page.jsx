"use client";
import React, { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import Papa from "papaparse";

export default function Page() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const pref = localStorage.getItem("csvnest_theme");
    const val = pref === "dark";
    setDark(val);
    document.documentElement.classList.toggle("dark", val);
  }, []);
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("csvnest_theme", next ? "dark" : "light");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <header className="p-4 bg-white dark:bg-slate-800 shadow flex justify-between items-center">
        <h1 className="text-2xl font-bold">CSVNest Pro</h1>
        <button
          onClick={toggleTheme}
          className="px-3 py-2 rounded-md bg-slate-900 text-white dark:bg-slate-700 text-sm"
        >
          {dark ? "Light Mode" : "Dark Mode"}
        </button>
      </header>
      <main className="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <aside className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <h2 className="text-lg font-semibold mb-3">Generation Controls</h2>
          <p className="text-sm opacity-80">All control options will go here.</p>
        </aside>
        <section className="lg:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <h2 className="text-lg font-semibold mb-3">Upload & Progress</h2>
          <p className="text-sm opacity-80">Upload, progress bar, and actions here.</p>
        </section>
      </main>
      <footer className="text-center text-sm py-6 opacity-70">
        Developed by <strong>Anil Chandra Barman</strong> —{" "}
        <a
          href="https://www.facebook.com/anil.chandrabarman.3"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Follow: Facebook
        </a>
      </footer>
    </div>
  );
}
