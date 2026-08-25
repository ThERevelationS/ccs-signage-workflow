import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { ESTIMATOR_TABS, ESTIMATOR_RIGHT_TABS } from "@/components/estimator/navConfig";

function TabMenu({ tab, isActive, open, onToggle, onClose, align = "left" }) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={`h-10 px-3 flex items-center gap-1 text-sm font-semibold whitespace-nowrap transition-colors ${
          isActive ? "bg-red-800 text-white" : "text-red-50 hover:bg-red-700"
        }`}
      >
        {tab.label}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          className={`absolute top-full ${align === "right" ? "right-0" : "left-0"} mt-0.5 z-50 min-w-[220px] py-1 rounded-lg bg-white shadow-xl border border-gray-200`}
        >
          {tab.items.map((item) => (
            <Link
              key={item.to + item.label}
              to={item.to}
              onClick={onClose}
              className="block px-3 py-2 text-sm text-gray-700 hover:bg-red-50 hover:text-red-700"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EstimatorNav() {
  const location = useLocation();
  const [openTab, setOpenTab] = useState(null);
  const ref = useRef(null);

  useEffect(() => setOpenTab(null), [location.pathname, location.search]);

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpenTab(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const isActive = (tab) =>
    location.pathname === tab.to || tab.items.some((i) => i.to.split("?")[0] === location.pathname);

  return (
    <div ref={ref} className="bg-red-600 shadow-md">
      <div className="flex items-center justify-between overflow-x-auto">
        <div className="flex items-center">
          {ESTIMATOR_TABS.map((tab) => (
            <TabMenu
              key={tab.label}
              tab={tab}
              isActive={isActive(tab)}
              open={openTab === tab.label}
              onToggle={() => setOpenTab(openTab === tab.label ? null : tab.label)}
              onClose={() => setOpenTab(null)}
            />
          ))}
        </div>
        <div className="flex items-center">
          {ESTIMATOR_RIGHT_TABS.map((tab) => (
            <TabMenu
              key={tab.label}
              tab={tab}
              align="right"
              isActive={isActive(tab)}
              open={openTab === tab.label}
              onToggle={() => setOpenTab(openTab === tab.label ? null : tab.label)}
              onClose={() => setOpenTab(null)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}