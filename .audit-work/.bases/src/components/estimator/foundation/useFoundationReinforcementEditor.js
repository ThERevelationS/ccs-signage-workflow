import { useRef, useState } from "react";
import { createFoundationReinforcementEditorSession } from "./foundationReinforcementEditorSession";
import { newCreationRequestKey } from "@/components/estimator/idempotentEntityCreate";

export function useFoundationReinforcementEditor({ getCurrent, commit }) {
  const [, setRevision] = useState(0);
  const callbacksRef = useRef({ getCurrent, commit });
  callbacksRef.current = { getCurrent, commit };
  const sessionRef = useRef(null);
  if (sessionRef.current === null) {
    sessionRef.current = createFoundationReinforcementEditorSession({
      getCurrent: () => callbacksRef.current.getCurrent(),
      commit: (updater) => callbacksRef.current.commit(updater),
      createId: () => newCreationRequestKey("foundation_reinforcement_proposal"),
      now: () => new Date().toISOString(),
      onChange: () => setRevision((r) => r + 1),
    });
  }
  return sessionRef.current;
}
