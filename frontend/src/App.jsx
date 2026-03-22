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
    <div className="min-h-screen flex flex-col bg-linear-bg">
      <header
        className="w-full h-11 flex items-center border-b border-linear-border"
        style={{ backgroundColor: "#0F0F0F" }}
      >
        <div className="max-w-[1100px] w-full mx-auto px-4 flex items-center justify-between">
          <span className="text-[14px] font-semibold text-linear-text-primary tracking-[-0.03em]">
            PACked
          </span>
          <nav className="flex items-center gap-6">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`text-[13px] py-2 -mb-px transition-colors duration-100 ${
                  activeTab === tab.id
                    ? "text-linear-text-primary border-b border-linear-text-primary"
                    : "text-linear-text-secondary hover:text-linear-text-primary"
                }`}
                style={
                  activeTab === tab.id
                    ? { borderBottomWidth: "1px" }
                    : {}
                }
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-[1100px] w-full mx-auto px-4 py-6">
          {activeTab === "live" && <LiveView />}
          {activeTab === "heatmap" && <Heatmap />}
          {activeTab === "recommendations" && <Recommendations />}
        </div>
      </main>

      <footer
        className="w-full h-11 flex items-center border-t border-linear-border"
        style={{ backgroundColor: "#0F0F0F" }}
      >
        <div className="max-w-[1100px] w-full mx-auto px-4 flex justify-between gap-2 flex-wrap text-[11px] text-linear-text-tertiary">
          <span>Built by Paul Chike-Igwe</span>
        </div>
      </footer>
    </div>
  );
}
