const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

// Hollow rectangular masonry base: perimeter courses only (no interior fill).
export function calcBrickStoneProject(project, material) {
  const gap = num(project.mortar_gap, 0.375);
  const layers = Math.max(1, num(project.layers, 1));
  const courses = num(project.courses_high, 0);
  const alongLength = num(project.bricks_along_length, 0);
  const alongWidth = num(project.bricks_along_width, 0);
  const waste = num(project.waste_factor, 1.1);

  const b = {
    length: num(material?.length),
    width: num(material?.width),
    height: num(material?.height),
  };

  // Perimeter of one course: two length runs + two width runs (corners shared).
  const bricksPerCourse = (alongLength + alongWidth) * 2;
  const rawBricks = bricksPerCourse * courses * layers;
  const calculated_bricks = Math.ceil(rawBricks * waste);

  // Geometry derived from brick size + mortar gaps.
  const derived_length = alongLength * (b.length + gap);
  const derived_width = alongWidth * (b.length + gap);
  const derived_height = courses * (b.height + gap);

  // Exposed face area of the outer wall, in sq ft.
  const perimeterInches = (derived_length + derived_width) * 2;
  const calculated_surface_area = (perimeterInches * derived_height) / 144;

  // Mortar: bed + head joints volume, ~0.6 cu ft yield per 60lb bag.
  const mortarVolumeCuIn =
    rawBricks * (b.length * b.width * gap + b.height * b.width * gap);
  const mortar_bags_needed = Math.ceil(mortarVolumeCuIn / 1728 / 0.6) || 0;

  const material_cost = calculated_bricks * num(material?.cost_per_unit);
  const mortar_cost = mortar_bags_needed * num(project.mortar_bag_cost, 12);

  const labor_hours = (calculated_bricks / Math.max(1, num(project.bricks_per_hour, 40)));
  const labor_cost = labor_hours * num(project.labor_rate_per_hour, 55);

  const subtotal = material_cost + mortar_cost + labor_cost;
  const markup_amount = (subtotal * num(project.markup_percent)) / 100;

  return {
    calculated_bricks,
    bricks_per_course: bricksPerCourse,
    derived_length,
    derived_width,
    derived_height,
    calculated_surface_area,
    mortar_bags_needed,
    material_cost,
    mortar_cost,
    labor_hours,
    labor_cost,
    subtotal,
    markup_amount,
    total_cost: subtotal + markup_amount,
  };
}