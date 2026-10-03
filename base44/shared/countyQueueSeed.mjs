// Static lists of all 120 Kentucky counties and 88 Ohio counties.
// Used to seed SourceCollectionQueue. No AI web research at runtime.
// Sourced from the canonical Wikipedia county lists (KY=120, OH=88).

export const KENTUCKY_COUNTIES = Object.freeze([
  "Adair County", "Allen County", "Anderson County", "Ballard County", "Barren County",
  "Bath County", "Bell County", "Boone County", "Bourbon County", "Boyd County",
  "Boyle County", "Bracken County", "Breathitt County", "Breckinridge County", "Bullitt County",
  "Butler County", "Caldwell County", "Calloway County", "Campbell County", "Carlisle County",
  "Carroll County", "Carter County", "Casey County", "Christian County", "Clark County",
  "Clay County", "Clinton County", "Crittenden County", "Cumberland County", "Daviess County",
  "Edmonson County", "Elliott County", "Estill County", "Fayette County", "Fleming County",
  "Floyd County", "Franklin County", "Fulton County", "Gallatin County", "Garrard County",
  "Grant County", "Graves County", "Grayson County", "Green County", "Greenup County",
  "Hancock County", "Hardin County", "Harlan County", "Harrison County", "Hart County",
  "Henderson County", "Henry County", "Hickman County", "Hopkins County", "Jackson County",
  "Jefferson County", "Jessamine County", "Johnson County", "Kenton County", "Knott County",
  "Knox County", "Larue County", "Laurel County", "Lawrence County", "Lee County",
  "Leslie County", "Letcher County", "Lewis County", "Lincoln County", "Livingston County",
  "Logan County", "Lyon County", "McCracken County", "McCreary County", "McLean County",
  "Madison County", "Magoffin County", "Marion County", "Marshall County", "Martin County",
  "Mason County", "Meade County", "Menifee County", "Mercer County", "Metcalfe County",
  "Monroe County", "Montgomery County", "Morgan County", "Muhlenberg County", "Nelson County",
  "Nicholas County", "Ohio County", "Oldham County", "Owen County", "Owsley County",
  "Pendleton County", "Perry County", "Pike County", "Powell County", "Pulaski County",
  "Robertson County", "Rockcastle County", "Rowan County", "Russell County", "Scott County",
  "Shelby County", "Simpson County", "Spencer County", "Taylor County", "Todd County",
  "Trigg County", "Trimble County", "Union County", "Warren County", "Washington County",
  "Wayne County", "Webster County", "Whitley County", "Wolfe County", "Woodford County",
]);

export const OHIO_COUNTIES = Object.freeze([
  "Adams County", "Allen County", "Ashland County", "Ashtabula County", "Athens County",
  "Auglaize County", "Belmont County", "Brown County", "Butler County", "Carroll County",
  "Champaign County", "Clark County", "Clermont County", "Clinton County", "Columbiana County",
  "Coshocton County", "Crawford County", "Cuyahoga County", "Darke County", "Defiance County",
  "Delaware County", "Erie County", "Fairfield County", "Fayette County", "Franklin County",
  "Fulton County", "Gallia County", "Geauga County", "Greene County", "Guernsey County",
  "Hamilton County", "Hancock County", "Hardin County", "Harrison County", "Henry County",
  "Highland County", "Hocking County", "Holmes County", "Huron County", "Jackson County",
  "Jefferson County", "Knox County", "Lake County", "Lawrence County", "Licking County",
  "Logan County", "Lorain County", "Lucas County", "Madison County", "Mahoning County",
  "Marion County", "Medina County", "Meigs County", "Mercer County", "Miami County",
  "Monroe County", "Montgomery County", "Morgan County", "Morrow County", "Muskingum County",
  "Noble County", "Ottawa County", "Paulding County", "Perry County", "Pickaway County",
  "Pike County", "Portage County", "Preble County", "Putnam County", "Richland County",
  "Ross County", "Sandusky County", "Scioto County", "Seneca County", "Shelby County",
  "Stark County", "Summit County", "Trumbull County", "Tuscarawas County", "Union County",
  "Van Wert County", "Vinton County", "Warren County", "Washington County", "Wayne County",
  "Williams County", "Wood County", "Wyandot County",
]);

export const COUNTY_QUEUE_SEED = Object.freeze([
  ...KENTUCKY_COUNTIES.map((name) => ({ jurisdiction_name: name, state: "KY" })),
  ...OHIO_COUNTIES.map((name) => ({ jurisdiction_name: name, state: "OH" })),
]);