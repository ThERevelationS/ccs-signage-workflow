@echo off
cd /d C:\Users\BrettHeinlein\Documents\DevinProjects\ccs-signage-workflow-clean
type src\components\permitting\PermitSetupWizard.jsx | npx base44@latest sandbox write src/components/permitting/PermitSetupWizard.jsx --app-id 68dfcc5e57bbbc35387da97c --branch main --json
