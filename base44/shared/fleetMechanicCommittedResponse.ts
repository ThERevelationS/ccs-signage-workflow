import { mechanicGrantAllowsMutation } from './fleetMechanicMutationRecovery.ts';

export function mechanicCommittedResponseAccessChangedError() {
  const error:any = new Error('This mechanic link changed after the Fleet operation may have been committed. No Fleet result data was returned. Check current server state with CCS before retrying.');
  error.code = 'FLEET_MECHANIC_ACCESS_REVOKED';
  return error;
}

export async function requireCurrentMechanicGrantForCommittedResponse(
  Access:any,
  grantId:string,
  action:string,
  equipmentId:string,
  nowMs = Date.now(),
) {
  const latest = await Access.get(grantId).catch(()=>null);
  const check = mechanicGrantAllowsMutation(latest,action,equipmentId,nowMs);
  if (!check.allowed) throw mechanicCommittedResponseAccessChangedError();
  return latest;
}
