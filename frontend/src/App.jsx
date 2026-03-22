import React, { useState } from "react";
import LiveView from "./components/LiveView.jsx";
import Heatmap from "./components/Heatmap.jsx";
import Recommendations from "./components/Recommendations.jsx";

const TABS = [
  { id: "live", label: "Live" },
  { id: "heatmap", label: "Heatmap" },
  { id: "recommendations", label: "Schedule" }
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
          <a
            href="/"
            className="flex items-center gap-2.5 sm:gap-3 min-w-0 shrink"
            aria-label="PACked home"
          >
            <img
              src="/logo.svg"
              alt=""
              width={48}
              height={46}
              className="h-8 w-auto shrink-0 sm:h-9"
              decoding="async"
            />
            <span className="text-[15px] sm:text-[16px] font-semibold text-linear-text-primary tracking-[-0.03em] truncate">
              PACked
            </span>
          </a>
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

      <main className="flex-1 min-w-0">
        <div className="max-w-[1100px] w-full min-w-0 mx-auto px-4 py-6">
          {/* Keep all panels mounted so Heatmap/Schedule don’t refetch on every tab switch. */}
          <div
            className={activeTab === "live" ? "block" : "hidden"}
            aria-hidden={activeTab !== "live"}
          >
            <LiveView isActive={activeTab === "live"} />
          </div>
          <div
            className={activeTab === "heatmap" ? "block" : "hidden"}
            aria-hidden={activeTab !== "heatmap"}
          >
            <Heatmap />
          </div>
          <div
            className={activeTab === "recommendations" ? "block" : "hidden"}
            aria-hidden={activeTab !== "recommendations"}
          >
            <Recommendations />
          </div>
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
