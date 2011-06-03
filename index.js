var path     = require('path')
  , connect  = require('connect')
  , ajs     = require('./lib/ajs').Middleware;

require.paths.unshift('./public');

var server = connect.createServer()
                .use(ajs());

if (!module.parent) {
  var port = process.argv[2] || 3000;
  server.listen(port);
  console.log("Server running at http://127.0.0.1:" + port + "/");
} else {
  module.exports = server;
}