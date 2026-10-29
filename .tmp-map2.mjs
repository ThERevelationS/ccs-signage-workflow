import { mapSalesTaskToStage } from "./base44/shared/salesTaskStageCatalog.mjs";
for (const t of ["Estimate - To Be Reviewed","Closed - Did not Lose"]) console.log(JSON.stringify(t), "→", JSON.stringify(mapSalesTaskToStage(t)));
