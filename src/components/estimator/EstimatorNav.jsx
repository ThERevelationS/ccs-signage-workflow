import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ESTIMATOR_TABS, ESTIMATOR_RIGHT_TABS } from "@/components/estimator/navConfig";

function TabMenu({ tab, isActive, open, onOpen, onToggle, onClose, align = "left" }) {
  return (
    <div className="relative" onMouseEnter={onOpen}>
      <Link
        to={tab.to}
        onClick={onClose}
        className={`h-[26px] px-4 flex items-center text-[13px] font-semibold whitespace-nowrap transition-colors ${
          isActive || open ? "bg-red-800 text-white" : "text-white hover:bg-red-700"
        }`}
      >
        {tab.label}
      </Link>
      {open && (
        <div
          className={`absolute top-full ${align === "right" ? "right-0" : "left-0"} z-[60] min-w-[230px] py-1 bg-white shadow-2xl border border-gray-200`}
        >
          {tab.items.map((item, i) =>
            item.header ? (
              <div
                key={`h-${i}`}
                className="px-4 pt-3 pb-1 text-[10px] font-bold tracking-wider text-red-600"
              >
                {item.label}
              </div>
            ) : (
              <Link
                key={item.to + item.label}
                to={item.to}
                onClick={onClose}
                className="block px-4 py-2 text-[13px] text-gray-700 hover:bg-red-50 hover:text-red-700"
              >
                {item.label}
              </Link>
            )
          )}
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
    location.pathname === tab.to ||
    tab.items.some((i) => !i.header && i.to.split("?")[0] === location.pathname);

  const renderTab = (tab, align) => (
    <TabMenu
      key={tab.label}
      tab={tab}
      align={align}
      isActive={isActive(tab)}
      open={openTab === tab.label}
      onOpen={() => setOpenTab(tab.label)}
      onToggle={() => setOpenTab(openTab === tab.label ? null : tab.label)}
      onClose={() => setOpenTab(null)}
    />
  );

  return (
    <div
      ref={ref}
      className="bg-red-600 relative z-50"
      onMouseLeave={() => setOpenTab(null)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center">{ESTIMATOR_TABS.map((t) => renderTab(t, "left"))}</div>
        <div className="flex items-center">
          {ESTIMATOR_RIGHT_TABS.map((t) => renderTab(t, "right"))}
        </div>
      </div>
    </div>
  );
}