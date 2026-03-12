import React, { useState } from "react";
import LiveView from "./components/LiveView.jsx";
import Heatmap from "./components/Heatmap.jsx";
import Recommendations from "./components/Recommendations.jsx";

const TABS = [
  { id: "live", label: "Live View" },
  { id: "heatmap", label: "Heatmap" },
  { id: "recommendations", label: "Schedule & Recommendations" }
];

export default function App() {
  const [activeTab, setActiveTab] = useState("live");

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold">
              Warrior Gym Tracker
            </h1>
            <p className="text-slate-400 text-sm">
              Find the quietest times to hit the gym using real Warrior
              Athletics occupancy data.
            </p>
          </div>
          <nav className="flex gap-2 rounded-full bg-slate-800/80 p-1 text-sm">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-full transition ${
                  activeTab === tab.id
                    ? "bg-emerald-500 text-slate-900 font-medium shadow"
                    : "text-slate-300 hover:bg-slate-700/80"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
          {activeTab === "live" && <LiveView />}
          {activeTab === "heatmap" && <Heatmap />}
          {activeTab === "recommendations" && <Recommendations />}
        </div>
      </main>

      <footer className="border-t border-slate-800 bg-slate-900/80">
        <div className="max-w-5xl mx-auto px-4 py-3 text-xs text-slate-500 flex justify-between gap-2 flex-wrap">
          <span>Warrior Gym Tracker · Personal/educational use only.</span>
          <span>Backend: FastAPI · Frontend: React + Vite + Tailwind</span>
        </div>
      </footer>
    </div>
  );
}

