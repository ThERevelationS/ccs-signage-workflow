for t in validate-opportunity-workspace test-ops-reports test-customer-quote test-quote-lifecycle test-estimate-lifecycle test-estimate-cas test-entity-persistence test-customer-persistence test-builder-persistence test-builder-service test-builder-recovery test-module-registry test-work-order-persistence test-quick-price-persistence test-unified-alerts test-notification-center test-import-mappers test-legacy-migrator test-estimate-import-export test-portal-upload test-nav-wiring test-scale-reads; do
  r=$(node scripts/$t.mjs 2>&1 | tail -1)
  echo "$t => $r"
done
