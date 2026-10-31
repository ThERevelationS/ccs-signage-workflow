p = 'src/components/layout/workspacePrefs.js'
s = open(p).read()
pairs = [('/MyWorkflow"','/myworkflow"'),('/MainWorkflow"','/mainworkflow"'),('/SalesPipeline"','/salespipeline"'),('/Opportunities"','/opportunities"'),('/Estimating"','/estimating"'),('/Permitting"','/permitting"'),('/Design"','/design"'),('/Production"','/production"'),('/Fabrication"','/fabrication"'),('/InstallationDeliver"','/installationdeliver"'),('/SOP"','/sop"'),('/OrderForm"','/orderform"'),('/Estimator"','/estimator"'),('/FleetOverview"','/fleetoverview"'),('/SIPs"','/sips"'),('/MondayMorningMeeting"','/mondaymorningmeeting"'),('/Financials"','/financials"'),('/Invoices"','/invoices"'),('/TimeClock"','/timeclock"')]
for a,b in pairs: s = s.replace(a,b)
open(p,'w').write(s)
print([l.strip() for l in s.splitlines() if 'url:' in l])
