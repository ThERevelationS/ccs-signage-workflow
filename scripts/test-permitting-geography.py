import runpy,unittest
parse=runpy.run_path('scripts/capture-permitting-geography.py')['parse']
class GeographyParsing(unittest.TestCase):
 def fixture(self,rows):
  return ('Data as of January 1, 2026<table><tr><th>MTFCC</th><th>GEOID</th><th>STATE</th><th>NAME</th><th>BASENAME</th></tr>'+''.join('<tr>'+''.join('<td>'+v+'</td>' for v in row)+'</tr>' for row in rows)+'</table>').encode()
 def test_preserves_codes(self):
  rows=parse(self.fixture([['G4020','21001','21','Adair County','Adair']]),'ky','counties');self.assertEqual(rows[0]['GEOID'],'21001')
 def test_wrong_state(self):
  with self.assertRaises(AssertionError):parse(self.fixture([['G4020','21001','21','Adair County','Adair']]),'oh','counties')
 def test_duplicates(self):
  with self.assertRaises(AssertionError):parse(self.fixture([['G4020','21001','21','Adair County','Adair']]*2),'ky','counties')
 def test_missing_columns(self):
  with self.assertRaises(AssertionError):parse(self.fixture([['G4020','21001','21']]),'ky','counties')
 def test_explicit_empty_only_consolidated(self):
  raw=self.fixture([['No data available']]);self.assertEqual(parse(raw,'oh','concity'),[])
  with self.assertRaises(AssertionError):parse(raw,'oh','counties')
  with self.assertRaises(AssertionError):parse(self.fixture([]),'oh','concity')
 def test_wrong_vintage(self):
  with self.assertRaises(AssertionError):parse(self.fixture([]).replace(b'2026',b'2025'),'oh','concity')
unittest.main()
