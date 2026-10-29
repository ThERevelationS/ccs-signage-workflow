import {createClientFromRequest} from 'npm:@base44/sdk@0.8.23';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import {handleIdentityCorrection} from '../../shared/jurisdictionIdentityCorrectionAction.mjs';
Deno.serve(req=>handleIdentityCorrection(req,withEntityRateLimitRetry(createClientFromRequest(req))));
