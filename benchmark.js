var ejs = require('ejs')
  , ajs = require('./index')
  , str = '<% if (foo) { %><p><%= foo %></p><% } %>'
    times = 25000;

// AJS benchmark (many short)
var ajs_times = times;
console.log('rendering AJS ' + ajs_times + ' times');
var ajsStart = new Date;
(function next(i) {
  ajs.render(str, {filename: 'test', locals: {foo: 'bar'}}, function(result) {
    if(i >= ajs_times) {
      console.log('AJS took ' + (new Date - ajsStart) + 'ms');
      ejsTest();
    } else next(++i);
  });
})(1);

// EJS benchmark (many short)
function ejsTest() {
  var ejs_times = times;
  console.log('rendering EJS ' + ejs_times + ' times');
  var ejsStart = new Date;
  while(ejs_times--) {
    ejs.render(str, { cache: true, filename: 'test', locals: { foo: 'bar' }});
  }
  console.log('EJS took ' + (new Date - ejsStart) + 'ms');
  longTest();
}

function longTest() {
  console.log();
  
  var template = [];
  while(times--) {
    template.push(str);
  }
  
  template = template.join('');
  
  // AJS benchmark (one very long)
  console.log('rendering very long AJS');
  var ajsStart2 = new Date;
  ajs.render(template, {filename: 'test2', locals: {foo: 'bar'}}, function(result) {
    console.log('AJS took ' + (new Date - ajsStart2) + 'ms');
    ejsLongTest();
  });

  // EJS benchmark (one very long)
  function ejsLongTest() {
    console.log('rendering very long EJS');
    var ejsStart2 = new Date;
    var result = ejs.render(template, { cache: true, filename: 'test2', locals: { foo: 'bar' }});
    console.log('EJS took ' + (new Date - ejsStart2) + 'ms');
  }
}
