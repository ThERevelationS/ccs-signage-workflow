import importlib.util
import unittest
from pathlib import Path
spec = importlib.util.spec_from_file_location("gaps", Path(__file__).with_name("classify-ohio-identity-gaps.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

def ref(kind="city", bucket="candidates", county=None, status="A"):
    return dict(reference_key="example:1", identity_type=kind, reference_bucket=bucket, county_name=county, funcstat=status)

class Tests(unittest.TestCase):
    def test_wrong_type_is_review_only(self):
        r=m.classify(dict(name="Geneva", type="village", county="Ashtabula"), {"geneva":[ref()]})
        self.assertEqual(r["gap_reason"], "possible_locality_type_mismatch")
        self.assertFalse(r["production_correction_authorized_by_match"])

    def test_explicit_wrong_county(self):
        r=m.classify(dict(name="Green", type="township", county="Allen"), {"green":[ref("township", county="Adams")]})
        self.assertEqual(r["gap_reason"], "same_name_only_in_other_explicit_counties")
        self.assertEqual(r["possible_references"], [])

    def test_missing_municipal_county_is_not_rejected(self):
        r=m.classify(dict(name="Union", type="village", county="Adams"), {"union":[ref("village")]})
        self.assertEqual(r["gap_reason"], "active_name_candidate_requires_identity_review")

    def test_inactive_and_hierarchy_not_active(self):
        r=m.classify(dict(name="Rendville", type="village"), {"rendville":[ref("village","status_review",status="I")]})
        self.assertEqual(r["gap_reason"], "inactive_or_consolidated_status_review")
        r=m.classify(dict(name="Lima", type="city"), {"lima":[ref("city","hierarchy_reference",status="F")]})
        self.assertEqual(r["gap_reason"], "hierarchy_only_reference")

    def test_no_exact_name_is_not_deleted(self):
        r=m.classify(dict(name="Unknown", type="village"), {})
        self.assertEqual(r["gap_reason"], "no_exact_name_in_full_reference")
        self.assertFalse(r["production_correction_authorized_by_match"])

if __name__ == "__main__":
    unittest.main()
