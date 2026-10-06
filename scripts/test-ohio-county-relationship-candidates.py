import importlib.util
import unittest
from pathlib import Path
spec = importlib.util.spec_from_file_location("relationships", Path(__file__).with_name("build-ohio-county-relationship-candidates.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

def place(key="p", name="Union", kind="city", lsadc="25"):
    return dict(reference_key=key, name=name+" "+kind, base_name=name, queue_type=kind, lsadc=lsadc)
def part(county, name="Union", lsadc="25"):
    return dict(reference_key="h:"+county, base_name=name, lsadc=lsadc, county_geoid=county, county_name=county+" County", source_file="oh-cousub.html")

class Tests(unittest.TestCase):
    def test_multi_county_preserved(self):
        rows=m.build(dict(candidates=[place()], hierarchy_reference=[part("A"),part("B")]))
        self.assertEqual(rows[0]["county_geoids"],["A","B"])
        self.assertFalse(rows[0]["county_list_exhaustive"])
        self.assertFalse(rows[0]["place_identity_link_verified"])

    def test_duplicate_place_names_remain_ambiguous(self):
        rows=m.build(dict(candidates=[place("p1"),place("p2")], hierarchy_reference=[part("A")]))
        self.assertTrue(all(r["status"]=="ambiguous_place_name" for r in rows))

    def test_type_and_literal_name_are_preserved(self):
        rows=m.build(dict(candidates=[place(name="Lincoln Village",kind="village",lsadc="47")],
                          hierarchy_reference=[part("A",name="Lincoln",lsadc="47"),part("B",name="Lincoln Village",lsadc="25")]))
        self.assertEqual(rows[0]["county_geoids"],[])

    def test_no_relationship_does_not_invent_county(self):
        row=m.build(dict(candidates=[place()],hierarchy_reference=[]))[0]
        self.assertEqual(row["status"],"no_hierarchy_relationship_evidence")
        self.assertFalse(row["authority_verified"])

    def test_county_absence_is_partial_not_conflict(self):
        lookup={"p":dict(reference_key="p",county_names=["A County"])}
        result=m.evaluate(dict(id="q",name="Union",type="city",county="B County",candidate_reference_keys=["p"]),lookup)
        self.assertEqual(result["status"],"county_not_in_partial_relationship_evidence")
        result=m.evaluate(dict(id="q",name="Union",type="city",county="A",candidate_reference_keys=["p"]),lookup)
        self.assertEqual(result["supported_candidate_keys"],["p"])
        self.assertFalse(result["canonical_identity_verified"])

if __name__ == "__main__":
    unittest.main()
