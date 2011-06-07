#!/usr/bin/env node

var fs     = require('fs')
  , path   = require('path')
  , util   = require('util')
  , Loader = require('../lib/loader')
  , VM     = require('../lib/VM');

// node-cli clobbers process.argv. argh.
var argv = Array.prototype.slice.call(process.argv);
var cli = require('cli').enable('version').setApp(__dirname + '/../package.json');
process.argv = argv;

cli.parse({
  tree:   ['t', 'Output the abstract syntax tree']
, source: ['s', 'Output the raw VM source']
});

cli.main(function (args, opts) {
  var filename = args[0]
    , base   = path.join(filename);
  Loader.load(filename, opts, function(err, compiled) {
    if(err) return console.error(err.stack);
    
    if(opts.tree)
      return util.print(util.inspect(compiled, false, 100)  + "\n");
    else if(opts.source)
      return util.print(compiled  + "\n");
      
    try {
      new VM(compiled, {filename: filename})
      .on('data', function(data) {
        util.print(data);
      }).on('end', function() {
        console.log();
      }).render();
    } catch (err) {
      err.message = "In " + filename + ", " + err.message;
      throw err;
    }
  });
});
