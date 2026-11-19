                  onMoveItem={patchItem}
                />
              </TabsContent>

              <TabsContent value="signage" className="space-y-4">
                <SignageCabinetsPanel
                  cabinets={project.signage_cabinets || []}
                  items={project.items || []}
                  poles={project.poles || []}
                  onChange={(signage_cabinets) => patch({ signage_cabinets })}
                />
                <LandscapeDesigner
                  landscape={project.landscape}
                  onChange={(landscape) => patch({ landscape })}
                />
              </TabsContent>

              <TabsContent value="caps">
                <FoundationWallCapsPanel
                  caps={calc.wallCaps}
                  walls={calc.walls}
                  options={catalog.caps}
                  onChange={(wall_caps) => patch({ wall_caps })}
                />
              </TabsContent>

              <TabsContent value="equipment">
                <FoundationEquipmentTab
                  foundationItems={project.items || []}
                  inventory={inventory}
                  selectedEquipmentList={project.selected_equipment || []}
                  onUpdate={(rows) => patch({ selected_equipment: rows })}
                  markDirty={() => setDirty(true)}
                />
              </TabsContent>

              <TabsContent value="summary" className="space-y-3">
                <label className="block bg-white rounded-sm border border-gray-200 p-3 text-[11px] text-gray-500">
                  Section name
                  <Input
                    value={project.project_name || ""}
                    onChange={(e) => patch({ project_name: e.target.value })}
                  />
                </label>
                <ConcreteDeliveryPanel project={project} delivery={calc.delivery} onChange={patch} />
                <FoundationRatesPanel settings={settings} project={project} onChange={patch} />
                <div className="max-w-xl">
                  <FoundationTotals totals={calc.totals} pricingUnavailable={pricingBlocked} savedSectionTotal={savedSectionTotal} sectionTotal={sectionTotal} project={project} calc={calc} />
                  <div className="mt-3 space-y-1 text-[12px] text-gray-600">
                    <div className="flex justify-between">
                      <span>Signage cabinets</span>
                      <span>{hasFoundationCostSnapshot(cabinetCost) ? money(cabinetCost) : "Not saved"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Site landscaping</span>
                      <span>{hasFoundationCostSnapshot(landscapeCost) ? money(landscapeCost) : "Not saved"}</span>
                    </div>
                  </div>
                  <div className="mt-2 text-right text-[12px] text-gray-500">
                    Section total flowing to estimate: {pricingBlocked ? <b className="text-amber-700">Estimate handoff paused</b> : <b className="text-red-700">{money(sectionTotal)}</b>}
                  </div>
                  <Link
                    to="/FoundationCatalog"
                    className="inline-block mt-3 text-[12px] text-gray-600 hover:text-red-600"
                  >
                    Manage foundation catalog â†’
                  </Link>
                </div>
              </TabsContent>

              <TabsContent value="bom">
                <FoundationBOM
                  items={calc.items}
                  poles={calc.poles}
                  walls={calc.walls}
                  delivery={calc.delivery}
                  totals={calc.totals}
                  inventory={inventory}
                  itemPricing={calc.itemPricing}
                  polePricing={calc.polePricing}
                  wallPricing={calc.wallPricing}
                  cabinets={project.signage_cabinets || []}
                  landscape={project.landscape}
                  landscapePricing={calc.landscapePricing}
                  pricingUnavailable={pricingBlocked}
                />
              </TabsContent>

              <TabsContent value="pricing" className="space-y-4">
                {pricingBlocked ? (
                  <div className="rounded-sm border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-800">Customer pricing unavailable: fix highlighted design inputs or catalog selections.</div>
                ) : (<>
                <CustomerPricingPanel
                  cost={sectionTotal}
                  project={project}
                  onChange={(changes) => patch({
                    ...changes,
                    customer_pricing: { ...(project.customer_pricing || {}), applied: false },
                  })}
                />
                <CustomerPricingTab
                  project={{ ...project, ...payload() }}
                  categorize={categorizeFoundationProject}
                  accentColor="red"
                  onApplyTier={(tier) => patch({
                    customer_pricing: { ...(project.customer_pricing || {}), applied: true, tier_number: tier },
                  })}
                />
                </>)}
              </TabsContent>
            </Tabs>
          </div>

          <div className="xl:sticky xl:top-4">
            {inputBlocked ? (
              <div className="rounded-sm border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-800">3D preview hidden until the highlighted design inputs are corrected.</div>
            ) : (
              <Foundation3DPreview project={project} />
            )}
          </div>