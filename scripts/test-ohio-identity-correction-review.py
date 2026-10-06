import importlib.util
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("review",Path(__file__).with_name("build-ohio-identity-correction-review.py"))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def c(key,name,kind,county=None):
    return dict(reference_key=key,geoid=key,base_name=name,queue_type=kind,county_name=county)
def row(kind="village",county="Adams County",name="Union"):
    return dict(id="q",name=name,type=kind,county=county)

class Tests(unittest.TestCase):
    def test_city_and_township_same_name_remain_ambiguous(self):
        r=m.review(row(),[c("city","Union","city"),c("town","Union","township","Adams County")],{"city":["Adams County"]})
        self.assertEqual(r["review_action"],"ambiguous_identity_requires_review")
        self.assertIsNone(r["suggested_type"])

    def test_county_narrows_same_name(self):
        r=m.review(row(),[c("a","Union","township","Adams County"),c("b","Union","township","Allen County")],{})
        self.assertEqual(r["suggested_reference_key"],"a")
        self.assertEqual(r["review_action"],"possible_type_correction_requires_identity_evidence")
        self.assertFalse(r["automatic_correction_allowed"])
        self.assertTrue(r["requires_fresh_record_read"])

    def test_placeholder_county_is_missing(self):
        r=m.review(row(county="INFORMATION NOT FOUND"),[c("a","Union","city")],{"a":["Adams County"]})
        self.assertEqual(r["review_action"],"missing_or_placeholder_parent_county")

    def test_county_does_not_need_parent_county(self):
        r=m.review(row(kind="county",county=None,name="Adams County"),[c("a","Adams","county","Adams County"),c("b","Adams","township","Adams County")],{})
        self.assertEqual(r["review_action"],"name_type_county_candidate_supported")

    def test_multi_county_support(self):
        r=m.review(row(kind="city",county="Allen"),[c("a","Union","city")],{"a":["Adams County","Allen County"]})
        self.assertEqual(r["review_action"],"name_type_county_candidate_supported")
        self.assertFalse(r["identity_verified"])

    def test_generic_type_and_no_exact_name(self):
        r=m.review(row(kind="municipality"),[c("a","Union","city")],{"a":["Adams County"]})
        self.assertEqual(r["review_action"],"generic_municipality_type_requires_review")
        r=m.review(row(),[],{})
        self.assertEqual(r["review_action"],"no_active_exact_name_candidate")

if __name__=="__main__":unittest.main()
