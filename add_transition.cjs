const fs = require('fs');
let content = fs.readFileSync('src/components/manga/MangaView.tsx', 'utf8');
let norm = content.replace(/\r\n/g, '\n');
norm = norm.replace(
  '          <div key={activeTab} className="pt-20 sm:pt-24 pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-8">\n          {/* Tab-specific content - key giúp transition nhẹ khi đổi tab, kết hợp cache nên không flash */}',
  '          <div className="pt-20 sm:pt-24 pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-8">\n            <AnimatePresence mode="wait">\n              <motion.div\n                key={activeTab}\n                initial={{ opacity: 0, y: 8, filter: \'blur(4px)\' }}\n                animate={{ opacity: 1, y: 0, filter: \'blur(0px)\' }}\n                exit={{ opacity: 0, y: -8, filter: \'blur(4px)\' }}\n                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}\n              >\n          {/* Tab-specific content - transition mượt khi đổi tab, kết hợp cache nên không flash */}'
);
norm = norm.replace(
  '                </div>\n              )}\n            </div>\n          )}',
  '                </div>\n              )}\n              </motion.div>\n            </AnimatePresence>\n            </div>\n          )}'
);
content = norm.replace(/\n/g, '\r\n');
fs.writeFileSync('src/components/manga/MangaView.tsx', content, 'utf8');
console.log('added transition');
