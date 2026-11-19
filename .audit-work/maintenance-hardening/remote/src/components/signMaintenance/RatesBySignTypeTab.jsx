// Rates / Service Items tab.
// Layout: [Sign Type tabs] → [Action tabs within that sign type] → rate card
// + (optional) action-specific settings panel (e.g. Repaint settings).
//
// Show only the action combinations supported by the current Maintenance data model.
// The persisted MaintenanceActionRate matrix contains exactly these applicable
// combinations, so do not manufacture unsupported sign-type/action rows in the UI.

import React from "react";
import { motion } from "framer-motion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Ruler, Sparkles, Lightbulb, Zap, Wrench, CheckCircle2, MinusCircle } from "lucide-react";
import { SIGN_TYPES, ACTIONS, ACTIONS_FOR_SIGN_TYPE } from "./constants";
import SectionCard from "./SectionCard";
import ActionRateCard from "./ActionRateCard";
import RepaintSettingsTab from "./RepaintSettingsTab";

const GROUP_ICON = {
  "Cosmetic":   Sparkles,
  "LED / Lamp": Lightbulb,
  "Electrical": Zap,
  "Component":  Wrench,
};

const SIGN_TYPE_ACTIVE_BG = {
  blue:    "data-[state=active]:bg-gradient-to-br data-[state=active]:from-blue-500    data-[state=active]:to-blue-700",
  amber:   "data-[state=active]:bg-gradient-to-br data-[state=active]:from-amber-500   data-[state=active]:to-orange-600",
  purple:  "data-[state=active]:bg-gradient-to-br data-[state=active]:from-purple-500  data-[state=active]:to-purple-700",
  teal:    "data-[state=active]:bg-gradient-to-br data-[state=active]:from-teal-500    data-[state=active]:to-teal-700",
  indigo:  "data-[state=active]:bg-gradient-to-br data-[state=active]:from-indigo-500  data-[state=active]:to-indigo-700",
  stone:   "data-[state=active]:bg-gradient-to-br data-[state=active]:from-stone-500   data-[state=active]:to-stone-700",
  slate:   "data-[state=active]:bg-gradient-to-br data-[state=active]:from-slate-500   data-[state=active]:to-slate-700",
  emerald: "data-[state=active]:bg-gradient-to-br data-[state=active]:from-emerald-500 data-[state=active]:to-emerald-700",
};

// Map of action id → component that renders that action's settings.
// Sub-panels must accept { globalSettings, setGlobalSettings, isLocked }.
const ACTION_SETTINGS_PANELS = {
  repaint: RepaintSettingsTab,
};

function ActionPane({ signType, action, rate, isLocked, onChange, globalSettings, setGlobalSettings }) {
  const enabled = rate?.is_enabled !== false;
  const SettingsPanel = ACTION_SETTINGS_PANELS[action.id];
  return (
    <div className="space-y-5">
      <ActionRateCard
        action={action}
        signType={signType}
        rate={rate || {}}
        isLocked={isLocked}
        onChange={(patch) => onChange(signType.id, action.id, patch)}
      />
      {enabled && SettingsPanel && (
        <div className="pt-2 border-t border-slate-200">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-3">
            {action.label} — Detailed Settings
          </div>
          <SettingsPanel
            globalSettings={globalSettings}
            setGlobalSettings={setGlobalSettings}
            isLocked={isLocked}
          />
        </div>
      )}
    </div>
  );
}

function SignTypePane({ signType, rateMap, isLocked, onChangeRate, globalSettings, setGlobalSettings }) {
  const applicableIds = ACTIONS_FOR_SIGN_TYPE[signType.id] || [];
  const applicableActions = ACTIONS.filter((action) => applicableIds.includes(action.id));
  const firstEnabled = applicableActions.find(a => {
    const r = rateMap.get(`${signType.id}|${a.id}`);
    return !r || r.is_enabled !== false;
  }) || applicableActions[0];

  return (
    <div className="space-y-4">
      <motion.p
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="text-xs text-slate-600 italic bg-slate-50 border-l-2 border-cyan-400 px-3 py-2 rounded-r-lg"
      >
        {signType.description}. Toggle each action on or off for this sign type using the switch on each card.
      </motion.p>

      <Tabs defaultValue={firstEnabled.id} className="w-full">
        <TabsList className="flex flex-wrap h-auto p-1.5 bg-slate-100/70 border border-slate-200 rounded-xl gap-1 justify-start">
          {applicableActions.map(a => {
            const r = rateMap.get(`${signType.id}|${a.id}`);
            const enabled = !r || r.is_enabled !== false;
            const GroupIcon = GROUP_ICON[a.group] || Wrench;
            return (
              <TabsTrigger
                key={a.id}
                value={a.id}
                className="flex items-center gap-1.5 py-1.5 px-3 text-[11px] rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 text-slate-600"
              >
                <GroupIcon className="w-3 h-3" />
                <span>{a.label}</span>
                {enabled
                  ? <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  : <MinusCircle className="w-3 h-3 text-slate-300" />}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {applicableActions.map(a => (
          <TabsContent key={a.id} value={a.id} className="mt-4">
            <ActionPane
              signType={signType}
              action={a}
              rate={rateMap.get(`${signType.id}|${a.id}`)}
              isLocked={isLocked}
              onChange={onChangeRate}
              globalSettings={globalSettings}
              setGlobalSettings={setGlobalSettings}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

export default function RatesBySignTypeTab({ rateMap, isLocked, onChangeRate, globalSettings, setGlobalSettings }) {
  return (
    <SectionCard
      icon={Ruler}
      theme="cyan"
      title="Service Items & Action Rates"
      description="Configure the maintenance actions supported for each sign type, including minutes-per-letter or per-cabinet and action-specific settings."
    >
      <Tabs defaultValue={SIGN_TYPES[0].id} className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 lg:grid-cols-8 mb-5 h-auto p-1.5 gap-1 bg-cyan-50/40 border border-cyan-100 rounded-xl">
          {SIGN_TYPES.map(st => (
            <TabsTrigger
              key={st.id}
              value={st.id}
              className={`py-2 text-xs rounded-lg transition-all data-[state=active]:text-white data-[state=active]:shadow-md ${SIGN_TYPE_ACTIVE_BG[st.color] || SIGN_TYPE_ACTIVE_BG.slate}`}
            >
              {st.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {SIGN_TYPES.map(st => (
          <TabsContent key={st.id} value={st.id} className="space-y-4">
            <SignTypePane
              signType={st}
              rateMap={rateMap}
              isLocked={isLocked}
              onChangeRate={onChangeRate}
              globalSettings={globalSettings}
              setGlobalSettings={setGlobalSettings}
            />
          </TabsContent>
        ))}
      </Tabs>
    </SectionCard>
  );
}