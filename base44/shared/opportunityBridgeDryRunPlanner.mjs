import { buildOpportunityBridgeAudit } from './opportunityBridgeAudit.mjs';
import { reconcileHistoricalSalesOutcome } from './historicalSalesOutcomeReconciliation.mjs';
import { bridgeSourceSnapshot, opportunityBridgeReceiptKey } from './opportunityBridgeExecutionPlan.mjs';

const clean = (value) => String(value ?? '').trim();
