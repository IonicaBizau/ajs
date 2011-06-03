var Nope    = require('../lib/ajs')
  , util    = require('util')
  , AjsVM  = require('../lib/ajs_vm');

var i = 0
  , REPS = 10000
  , start = new Date()
  , compiled = Nope.compile("\nOne, two <%= 6+12; // comments %>. More... <%= params.try %>");

console.log('compiled source: ');
console.log();
console.log(compiled);
console.log();
(function next() {
  var options = {  global: {params: {try: i}} };
  runScript(compiled, i, options);
  if(i < REPS) {
    i++;
    next();
  }
})();

function runScript(compiled, i, options) {
  AjsVM.run(compiled, options).on('data', function(data) {
    // util.print(data);
  }).on('end', function() {
    if(i % 100 == 0) util.print('\rIteration: ' + i);
    if(i >= REPS) {
      var dur = ((new Date()) - start);
      console.log("\nFinished in: " + dur + "ms at " + (REPS / (dur / 1000)).toFixed() + "/sec");
    }
  });
}
