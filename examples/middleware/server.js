var ajs = require('../../lib/ajs');


var dbCall = function(viewCallback) {
  setTimeout(function() {
    viewCallback(null, [
      {id: 1, title: '10 Quick Photography Tips', body: '<p>Some Sample Text</p>'}
    , {id: 1, title: 'Some Post Title', body: '<p>With Sample Content</p>'}
    , {id: 1, title: 'Another Interesting Post', body: '<p>Welcome to our blog!</p>'}
    ]);
  }, 50);
}

var server = require('connect').createServer()
                               .use(ajs())
                               .use(function(req, res) {
                                 res.render('index', {title: "Hello World!", dbCall: dbCall});
                               });

if (!module.parent) {
  var port = process.argv[2] || 3000;
  server.listen(port);
  console.log("Server running at http://127.0.0.1:" + port + "/");
} else {
  module.exports = server;
}