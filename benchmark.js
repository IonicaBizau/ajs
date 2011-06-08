var ejs = require('ejs')
  , ajs = require('ajs')
  , str = '<% if (foo) { %></p><%= foo %></p><% } %>'
    times = 50000;

// AJS benchmark
var ajs_times = times;
console.log('rendering AJS ' + ajs_times + ' times');
var start = new Date;
(function next(i) {
  ajs.render(str, {filename: 'test', locals: {foo: 'bar'}}, function(result) {
    if(i >= ajs_times) {
      console.log('AJS took ' + (new Date - start) + 'ms');
      ejsTest();
    } else next(++i);
  });
})(1);

// EJS benchmark
function ejsTest() {
  var ejs_times = times;
  console.log('rendering EJS ' + ejs_times + ' times');
  var start = new Date;
  while(ejs_times--) {
    ejs.render(str, { cache: true, filename: 'test', locals: { foo: 'bar' }});
  }
  console.log('EJS took ' + (new Date - start) + 'ms');
}
