const fs = require('fs');
const edits = [
  {
    old_text: '              <TabsContent value="timeoff">\n                <div className="space-y-3">',
    new_text: '              <TabsContent value="timeoff">\n                <Stagger className="space-y-3">',
  },
  {
    old_text: '                    timeOffRequests.map(request => (\n                      <div key={request.id} className="clay-card p-4">',
    new_text: '                    timeOffRequests.map(request => (\n                      <StaggerItem key={request.id} className="clay-card p-4">',
  },
  {
    old_text: '                      </div>\n                    ))\n                  )}\n                </div>\n              </TabsContent>\n\n              <TabsContent value="balance">',
    new_text: '                      </StaggerItem>\n                    ))\n                  )}\n                </Stagger>\n              </TabsContent>\n\n              <TabsContent value="balance">',
  },
];
fs.writeFileSync('.tmp-ttstag.json', JSON.stringify(edits));
console.log('ok');
