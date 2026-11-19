[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $OutputEncoding=[Text.UTF8Encoding]::new($false);
$raw=npx.cmd base44@latest sandbox read src/pages/FoundationEstimator.jsx src/components/estimator/foundation/foundationCatalogIntegrity.js src/components/estimator/foundation/foundationEquipmentBindings.js --app-id 68dfcc5e57bbbc35387da97c --branch main --json | Out-String;
if($LASTEXITCODE -ne 0){throw 'Read failed'};
[IO.File]::WriteAllText((Join-Path (Get-Location) '.audit-work/foundation-equipment13/extra-baselines-utf8.json'),$raw,[Text.UTF8Encoding]::new($false))
