#!/usr/bin/env node

var _     = require('underscore')
  , fs    = require('fs')
  , path  = require('path')
  , Nope  = require('../lib/ajs');

// node-cli clobbers process.argv. argh.
var argv = _.clone(process.argv);
var cli = require('cli').enable('version').setApp(__dirname + '/../package.json');
process.argv = argv;

cli.parse({
    // port:       ['p', 'Port number to listen on', 'number', 3000]
    // , workers:  ['w', 'Number of workers to spawn', 'number']
    // , env:      ['e', 'Server environment', 'string', 'development']
});

cli.main(function (args, options) {
  var file = args[0]
    , base   = path.join(file);
  Nope.read(file);
});
