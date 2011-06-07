var connect = require('connect')
  , ajs     = require('../../lib/ajs')
  , context = require('./context');

var server = connect.createServer()
                    .use(ajs.serve('./public', context))
                    .use(connect.static('./public'));

if (!module.parent) {
  var port = process.argv[2] || 3000;
  server.listen(port);
  console.log("Server running at http://127.0.0.1:" + port + "/");
} else {
  module.exports = server;
}