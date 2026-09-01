import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Bot, X, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { User } from '@/entities/all';

/**
 * Detailed walkthrough for the Channel & Dimensional Letters | Lobby Signs estimator.
 * Pattern matches the foundation HelpAssistant — state is persisted per-user on
 * the User.tutorials_seen object under "channel_letters_<tab>" keys, so each
 * tab's tour only auto-opens the first time that user visits it.
 *
 * Props:
 *  - activeTab: current tab key (project / letters / items / crew / summary / pricing)
 *  - manualTrigger: when true, forces the tour open (Help button)
 *  - onManualTriggerClose: called when the user dismisses a manually-triggered tour
 *  - onStepChange: optional callback fired with (stepIdx, stepObj) on each step
 */

const tourData = {
  project: [
    { targetId: "clp-client-name", text: "Enter the Client Name here. This is required to save the estimate. You can search recent clients or look them up in CCS." },
    { targetId: "clp-project-name", text: "Enter the Project Name — this is also required." },
    { targetId: "clp-estimate-number", text: "Enter an Estimate Number (e.g., INST-2024-001) to track this quote in your system." },
    { targetId: "clp-hyperlink", text: "Paste a URL to the project folder, Google Drive, Dropbox, or any reference page." },
    { targetId: "clp-install-env", text: "Pick the default install environment: Interior (lobby, indoor signage) or Exterior (storefront, parapet). Each line item can override this." },
    { targetId: "clp-project-scope", text: "Pick what this estimate covers. 'Letters + Install' includes both. 'Installation Only' hides the Letters tab. 'Lettering / Logo Only' hides the Install + Crew tabs and their costs." },
    { targetId: "clp-site-address", text: "Enter the install site address so travel mileage and fuel cost are calculated from your shop." },
    { targetId: "clp-notes", text: "Add any internal notes, special considerations, or scope reminders here." },
  ],
  letters: [
    { targetId: "clp-add-letter-row", text: "Click here to add a new Letter Purchase row. Each row represents one product type — Flush-Mounted, Halo-Lit, Raceway-Mounted, Dimensional Letters, Capsule/Pillbox Logos, etc." },
    { targetId: "clp-letter-type-picker", text: "Pick the letter type. Channel letter types calculate from a flat $/sqin lookup; 'Dimensional Letters' opens an inline Fab Builder where you select sheet material, cutting method, and paint." },
    { targetId: "clp-letter-qty", text: "Enter how many letters are on this sign. The unit cost is multiplied by this quantity." },
    { targetId: "clp-letter-size", text: "Enter the size of the letters (area in sqft for channel letters, or set the height/width in the Dimensional Fab Builder)." },
    { targetId: "clp-dimensional-fab", text: "For Dimensional Letters, this inline builder must be completed before you can leave the Letters tab. Pick the Sheet Material — note: materials with 'Allow Laser' unchecked in inventory will force CNC here." },
    { targetId: "clp-letter-fees", text: "Project-level fees: delivery, design, install supplies, permitting, other, and an optional markup % that's applied to the letters subtotal only." },
  ],
  items: [
    { targetId: "clp-install-ai", text: "Use 'AI Scope' to generate installation line items from a written description, or 'Add Item' to add one manually." },
    { targetId: "clp-install-row", text: "Each install line item captures one installation scope: install type (Flush, Halo, Raceway, Dimensional), letter qty, size, install height, wall material, and site condition multipliers (parapet, poor electrical, escort, after hours, etc.)." },
    { targetId: "clp-install-materials", text: "Materials auto-populate from your Channel Letter Install Inventory based on the install type. You can add custom materials, override unit costs, or remove anything that doesn't apply." },
  ],
  crew: [
    { targetId: "clp-equipment", text: "Pick the equipment needed for this install. The system auto-suggests based on the highest install height across all line items — bucket trucks for high installs, ladders for low ones." },
    { targetId: "clp-personnel", text: "Add personnel (Crew Lead, Installer, Helper). Hours auto-populate from the labor calculated on the Install tab, but you can override hours and rates per role." },
  ],
  summary: [
    { targetId: "clp-summary-breakdown", text: "Review the line-by-line install cost breakdown — labor, materials, and totals for each item." },
    { targetId: "clp-summary-materials", text: "The Materials pick list aggregates every material across every line item — your shopping list. Use 'Copy List' for the shop, or 'Copy with Pricing' for review." },
  ],
  pricing: [
    { targetId: null, text: "This tab applies tier markups (or cost-plus) on top of your direct cost. Pick a customer tier to see the marked-up sell price by category." },
    { targetId: null, text: "Configure tier multipliers in Admin → Tier Markups. Outsourced fab, in-house labor, machine time, and material categories can each have different markups." },
  ],
};

export default function ChannelLetterHelpAssistant({ activeTab, manualTrigger, onManualTriggerClose, onStepChange }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [bubbleStyle, setBubbleStyle] = useState({ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0 });
  const [tutorialsSeen, setTutorialsSeen] = useState(null); // null = loading
  const [tutorialsDisabled, setTutorialsDisabled] = useState(false);

  const steps = tourData[activeTab] || [];
  const tutorialKey = `channel_letters_${activeTab}`;

  // Load seen tutorials from user record
  useEffect(() => {
    User.me()
      .then(user => {
        setTutorialsSeen(user?.tutorials_seen || {});
        setTutorialsDisabled(!!user?.tutorials_disabled);
      })
      .catch(() => setTutorialsSeen({}));
  }, []);

  const handleDisableAll = async () => {
    setTutorialsDisabled(true);
    try {
      await User.updateMyUserData({ tutorials_disabled: true });
    } catch (e) {
      console.error('Failed to save tutorial preference:', e);
    }
    setOpen(false);
    if (onManualTriggerClose) onManualTriggerClose();
  };

  useEffect(() => {
    if (open && steps.length > 0 && onStepChange) {
      onStepChange(step, steps[step]);
    }
  }, [step, open, steps, onStepChange]);

  const handleClose = () => {
    const updated = { ...(tutorialsSeen || {}), [tutorialKey]: true };
    setTutorialsSeen(updated);
    User.updateMyUserData({ tutorials_seen: updated }).catch(err => console.error('Failed to save tutorial state:', err));
    setOpen(false);
    if (onManualTriggerClose) onManualTriggerClose();
  };

  useEffect(() => {
    if (manualTrigger) {
      setOpen(true);
      setStep(0);
      return;
    }
    if (tutorialsSeen === null) return;
    // Globally disabled — never auto-open
    if (tutorialsDisabled) {
      setOpen(false);
      return;
    }
    if (!tutorialsSeen[tutorialKey] && steps.length > 0) {
      const t = setTimeout(() => {
        setOpen(true);
        setStep(0);
      }, 600);
      return () => clearTimeout(t);
    } else {
      setOpen(false);
    }
  }, [activeTab, manualTrigger, steps.length, tutorialsSeen, tutorialKey, tutorialsDisabled]);

  // Reset step to 0 whenever the active tab changes while the tour is open
  useEffect(() => { setStep(0); }, [activeTab]);

  const updatePosition = useCallback(() => {
    if (!open || steps.length === 0) return;
    const currentStep = steps[step];
    if (!currentStep) return;

    const el = currentStep.targetId ? document.getElementById(currentStep.targetId) : null;
    if (el) {
      const rect = el.getBoundingClientRect();
      let top = rect.bottom + 16;
      let left = rect.left + (rect.width / 2);

      if (top + 200 > window.innerHeight) {
        top = rect.top - 16;
      }
      left = Math.max(170, Math.min(window.innerWidth - 170, left));

      if (rect.top < 0 || rect.bottom > window.innerHeight) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      setBubbleStyle({
        top: `${top}px`,
        left: `${left}px`,
        transform: top === rect.top - 16 ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
        opacity: 1,
      });
    } else {
      setBubbleStyle({
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        opacity: 1,
      });
    }
  }, [open, step, steps]);

  useEffect(() => {
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    const interval = setInterval(updatePosition, 500);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      clearInterval(interval);
    };
  }, [updatePosition]);

  if (!open || steps.length === 0) return null;
  const currentStep = steps[step];

  return (
    <>
      <div className="fixed inset-0 z-[110] bg-purple-950/10 pointer-events-none transition-opacity" />
      <div
        className="fixed z-[120] w-[340px] bg-white rounded-2xl shadow-2xl border-2 border-purple-100 p-4 transition-all duration-300 ease-out"
        style={bubbleStyle}
      >
        <button onClick={handleClose} className="absolute top-2 right-2 text-slate-400 hover:text-slate-600">
          <X className="w-4 h-4" />
        </button>

        <div className="flex gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Bot className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-sm font-medium text-slate-700 leading-snug pt-1">
            {currentStep.text}
          </p>
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className="flex gap-1.5 flex-wrap flex-1 mr-2">
            {steps.map((_, i) => (
              <div key={i} className={cn("w-1.5 h-1.5 rounded-full transition-colors flex-shrink-0", i === step ? "bg-purple-500 w-3" : "bg-purple-200")} />
            ))}
          </div>

          <div className="flex gap-2">
            {step > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStep(s => s - 1)}
                className="h-7 text-xs rounded-full px-3 text-purple-600 border-purple-200 hover:bg-purple-50"
              >
                Back
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => step < steps.length - 1 ? setStep(s => s + 1) : handleClose()}
              className="h-7 text-xs bg-purple-600 hover:bg-purple-700 rounded-full px-4 text-white"
            >
              {step < steps.length - 1 ? (
                <>Next <ChevronRight className="w-3 h-3 ml-1 -mr-1" /></>
              ) : 'Got it!'}
            </Button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDisableAll}
          className="mt-3 text-[11px] text-slate-400 hover:text-slate-700 underline w-full text-center"
        >
          Don't show tutorials again
        </button>

        {/* Tail */}
        {currentStep.targetId && bubbleStyle.transform === 'translate(-50%, 0)' && (
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-l-2 border-t-2 border-purple-100 rotate-45" />
        )}
        {currentStep.targetId && bubbleStyle.transform === 'translate(-50%, -100%)' && (
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-r-2 border-b-2 border-purple-100 rotate-45" />
        )}
      </div>
    </>
  );
}