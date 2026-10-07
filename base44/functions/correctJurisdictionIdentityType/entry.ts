import {createClientFromRequest} from 'npm:@base44/sdk@0.8.23';
import {handleIdentityCorrection} from '../../shared/jurisdictionIdentityCorrectionAction.mjs';
Deno.serve(req=>handleIdentityCorrection(req,createClientFromRequest(req)));
