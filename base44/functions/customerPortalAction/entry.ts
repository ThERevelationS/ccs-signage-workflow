import { createClientFromRequest } from "npm:@base44/sdk@0.8.53";
import { authenticateSignShopSession } from "../eFoundationFieldsIfUnchanged,
} from "../../shared/opportunityFoundationPersistence.mjs";

const clean = (value: any) => String(value ?? "").trim();
const num = (value: any, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const bad = (mess