import React from "react";
import { motion } from "framer-motion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertTriangle } from "lucide-react";
import SettingInput from "./SettingInput";
import { maintenanceSiteConditionDefs, SITE_CONDITION_SUBTABS } from "./maintenanceTravelSiteDefs";
import SectionCard, { AnimatedGrid } from "./SectionCard";

export default function SiteConditionsTab({ globalSettings, setGlobalSettings, isLocked }) {
  const setSetting = (k, v) => setGlobalSettings(prev => ({ ...prev, [k]: v }));
  return (
    <SectionCard
      icon={AlertTriangle}
      theme="amber"
      title="Site Conditions"
      description="Per-condition adjustments. Multipliers scale labor time. Severity levels and Parapet / Thick / Hollow Walls are additive minutes."
    >
      <Tabs defaultValue="multipliers" className="w-full">
        <TabsList className="flex flex-wrap w-full mb-5 h-auto p-1 gap-1 bg-amber-50/50 border border-amber-100 rounded-xl">
          {SITE_CONDITION_SUBTABS.map(st => (
            <TabsTrigger
              key={st.key}
              value={st.key}
              className="py-2 text-xs flex-1 min-w-[140px] rounded-lg transition-all data-[state=active]:bg-gradient-to-br data-[state=active]:from-amber-500 data-[state=active]:to-orange-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              {st.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {SITE_CONDITION_SUBTABS.map(st => {
          const defs = maintenanceSiteConditionDefs.filter(d => d.category === st.category);
          const labelDefs = st.labelsCategory
            ? maintenanceSiteConditionDefs.filter(d => d.category === st.labelsCategory)
            : [];
          return (
            <TabsContent key={st.key} value={st.key} className="space-y-4">
              <motion.p
                key={st.key + "-desc"}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="text-xs text-amber-700/80 italic bg-amber-50/60 border-l-2 border-amber-400 px-3 py-2 rounded-r-lg"
              >
                {st.description}
              </motion.p>
              <AnimatedGrid className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {defs.map(def => (
                  <SettingInput key={def.name} def={def} value={globalSettings[def.name]} onChange={setSetting} isLocked={isLocked} />
                ))}
              </AnimatedGrid>
              {labelDefs.length > 0 && (
                <div className="mt-6 pt-5 border-t border-amber-100">
                  <div className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-3">Severity Slider Names</div>
                  <p className="text-xs text-slate-500 italic mb-3">
                    These names appear on the estimator's severity slider (next to "{st.label}").
                  </p>
                  <AnimatedGrid className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {labelDefs.map(def => (
                      <SettingInput key={def.name} def={def} value={globalSettings[def.name]} onChange={setSetting} isLocked={isLocked} />
                    ))}
                  </AnimatedGrid>
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </SectionCard>
  );
}