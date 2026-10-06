import importlib.util
import unittest
from pathlib import Path
spec = importlib.util.spec_from_file_location("reconcile", Path(__file__).with_name("reconcile-ohio-permitting-identities.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

def candidate(key, name, kind, county=None):
    return dict(reference_key=key, base_name=name, queue_type=kind, county_name=county)

class Tests(unittest.TestCase):
    def test_village_is_part_of_actual_name(self):
        refs = [candidate("a", "Lincoln Village", "village")]
        self.assertEqual(m.match(dict(name="Lincoln Village", type="village"), refs)["candidate_reference_keys"], ["a"])
        self.assertEqual(m.match(dict(name="Lincoln Village village", type="village"), refs)["candidate_reference_keys"], ["a"])

    def test_legal_name_prefix(self):
        self.assertEqual(m.normalize("City of Milford"), "milford")
        self.assertEqual(m.normalize("Village of Maineville"), "maineville")

    def test_same_named_townships_use_county(self):
        refs = [candidate("a", "Green", "township", "Adams County"), candidate("b", "Green", "township", "Allen County")]
        r = m.match(dict(name="Green Township", type="township", county="Adams"), refs)
        self.assertEqual(r["candidate_reference_keys"], ["a"])
        self.assertEqual(m.match(dict(name="Green", type="township"), refs)["status"], "ambiguous")

    def test_municipal_county_does_not_resolve_ambiguity(self):
        refs = [candidate("a", "Union", "city"), candidate("b", "Union", "village")]
        r = m.match(dict(name="Union", type="municipal", county="Adams"), refs)
        self.assertEqual(r["status"], "ambiguous")
        self.assertIn("official_county_relationship_pending", r["review_flags"])

    def test_generic_profile_type_stays_unresolved(self):
        r = m.match(dict(name="Union", type="municipality"), [candidate("a", "Union", "city")])
        self.assertIn("profile_municipality_type_unresolved", r["review_flags"])
        self.assertFalse(r["canonical_identity_verified"])
        self.assertFalse(r["authority_verified"])

    def test_duplicates_and_missing_references(self):
        rows = [dict(id="1", name="Adams County", type="county"), dict(id="2", name="Adams", type="county")]
        r = m.audit(rows, [candidate("a", "Adams", "county"), candidate("b", "Allen", "county")])
        self.assertEqual(r["duplicate_identity_groups"][0]["row_count"], 2)
        self.assertEqual(r["reference_candidates_without_any_name_candidate"], ["b"])

    def test_wrong_county_and_unknown_type_do_not_match(self):
        refs = [candidate("a", "Green", "township", "Adams")]
        self.assertEqual(m.match(dict(name="Green", type="township", county="Allen"), refs)["status"], "unmatched")
        self.assertEqual(m.match(dict(name="Green", type="planning_unit"), refs)["status"], "unmatched")

if __name__ == "__main__":
    unittest.main()
