// Animated, color-themed card used across Sign Maintenance Settings.
// One source of truth for the look-and-feel: gradient header bar, animated
// icon chip, hover lift, and content fade-in.

import React from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const THEMES = {
  blue:    { from: "from-blue-500",    to: "to-blue-700",    ring: "ring-blue-200",    text: "text-blue-600",    bar: "from-blue-400 via-cyan-400 to-sky-500" },
  cyan:    { from: "from-cyan-500",    to: "to-cyan-700",    ring: "ring-cyan-200",    text: "text-cyan-600",    bar: "from-cyan-400 via-teal-400 to-sky-500" },
  emerald: { from: "from-emerald-500", to: "to-emerald-700", ring: "ring-emerald-200", text: "text-emerald-600", bar: "from-emerald-400 via-teal-400 to-green-500" },
  amber:   { from: "from-amber-500",   to: "to-orange-600",  ring: "ring-amber-200",   text: "text-amber-600",   bar: "from-amber-400 via-orange-400 to-rose-400" },
  rose:    { from: "from-rose-500",    to: "to-pink-600",    ring: "ring-rose-200",    text: "text-rose-600",    bar: "from-rose-400 via-pink-400 to-fuchsia-400" },
  violet:  { from: "from-violet-500",  to: "to-purple-700",  ring: "ring-violet-200",  text: "text-violet-600",  bar: "from-violet-400 via-purple-400 to-fuchsia-400" },
  slate:   { from: "from-slate-600",   to: "to-slate-800",   ring: "ring-slate-200",   text: "text-slate-600",   bar: "from-slate-400 via-slate-500 to-slate-700" },
};

export default function SectionCard({ icon: Icon, title, description, theme = "cyan", rightSlot, children }) {
  const t = THEMES[theme] || THEMES.cyan;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <Card className="bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow rounded-2xl overflow-hidden">
        {/* Gradient accent bar */}
        <div className={`h-1 bg-gradient-to-r ${t.bar}`} />

        <CardHeader className="pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <motion.div
              whileHover={{ scale: 1.08, rotate: -4 }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
              className={`w-11 h-11 rounded-xl bg-gradient-to-br ${t.from} ${t.to} ring-4 ${t.ring} flex items-center justify-center flex-shrink-0 shadow-md`}
            >
              {Icon && <Icon className="w-5 h-5 text-white drop-shadow" />}
            </motion.div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base font-semibold text-slate-900 tracking-tight">{title}</CardTitle>
              {description && (
                <CardDescription className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  {description}
                </CardDescription>
              )}
            </div>
            {rightSlot}
          </div>
        </CardHeader>

        <CardContent className="pt-6 pb-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            {children}
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Animated grid helper — stagger-fades each child as it enters the viewport.
export function AnimatedGrid({ children, className = "" }) {
  return (
    <motion.div
      className={className}
      variants={{ show: { transition: { staggerChildren: 0.04 } } }}
      initial="hidden"
      animate="show"
    >
      {React.Children.map(children, (child, i) => (
        <motion.div
          key={i}
          variants={{
            hidden: { opacity: 0, y: 10 },
            show:   { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
          }}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}