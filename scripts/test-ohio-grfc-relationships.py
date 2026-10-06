import importlib.util
import io
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("grfc",Path(__file__).with_name("capture-ohio-grfc-relationships.py"))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
HEADER="TABBLKST|TABBLKCOU|CURSTATE|CURCOUNTY|PLACEFP|PLACEFS\n"

class Tests(unittest.TestCase):
    def test_uses_current_codes_and_preserves_leading_zero(self):
        r=m.derive(io.StringIO(HEADER+"38|999|39|001|00001|A\n"))
        self.assertEqual(r["relationships"][0]["place_geoid"],"3900001")
        self.assertEqual(r["relationships"][0]["county_geoid"],"39001")

    def test_no_place_sentinel(self):
        r=m.derive(io.StringIO(HEADER+"39|001|39|001|99999|9\n"))
        self.assertEqual(r["relationships"],[])
        self.assertEqual(r["no_place_row_count"],1)

    def test_multiple_counties_and_no_total_row_cap(self):
        text=HEADER+("39|001|39|001|00001|A\n"*1200)+"39|003|39|003|00001|A\n"
        r=m.derive(io.StringIO(text))
        self.assertEqual(r["source_row_count"],1201)
        self.assertEqual(len(r["relationships"]),2)
        self.assertEqual(r["relationships"][0]["source_row_count"],1200)

    def test_rejects_missing_columns_empty_and_truncated(self):
        for text in ["PLACEFP\n00001\n",HEADER,HEADER+"39|001|39|001|00001\n"]:
            with self.assertRaises(ValueError):m.derive(io.StringIO(text))

    def test_rejects_wrong_state_or_code_length(self):
        for row in ["39|001|40|001|00001|A\n","39|001|39|1|00001|A\n","39|001|39|001|abcde|A\n"]:
            with self.assertRaises(ValueError):m.derive(io.StringIO(HEADER+row))

if __name__=="__main__":unittest.main()
