import runpy,unittest
m=runpy.run_path('scripts/capture-ohio-building-directory.py');collect=m['collect'];validate=m['validate_ids']
class DirectoryRead(unittest.TestCase):
 def test_many_batches_no_total_cap(self):
  ids=list(range(1200));calls=[]
  def read(wanted):calls.append(wanted);return {'features':[{'attributes':{'objectid':x}} for x in reversed(wanted)]}
  self.assertEqual(len(collect(ids,read,'objectid',200)),1200);self.assertEqual(len(calls),6)
 def test_duplicate_or_wrong_inventory_rejected(self):
  for data,count in [({'objectIds':[1,1]},2),({'objectIds':[1]},2),({'objectIds':[True]},1)]:
   with self.assertRaises(AssertionError):validate(data,count)
 def test_incomplete_batch_rejected(self):
  with self.assertRaises(AssertionError):collect([1,2],lambda _: {'features':[{'attributes':{'objectid':1}}]},'objectid')
 def test_transfer_limit_rejected(self):
  with self.assertRaises(AssertionError):collect([1],lambda _: {'features':[{'attributes':{'objectid':1}}],'exceededTransferLimit':True},'objectid')
 def test_wrong_batch_identity_rejected(self):
  with self.assertRaises(AssertionError):collect([1],lambda _: {'features':[{'attributes':{'objectid':2}}]},'objectid')
unittest.main()
