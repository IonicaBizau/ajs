#!/usr/bin/env node

var _     = require('underscore')
  , fs    = require('fs')
  , path  = require('path')
  , AJS  = require('../lib/ajs');

// node-cli clobbers process.argv. argh.
var argv = _.clone(process.argv);
var cli = require('cli').enable('version').setApp(__dirname + '/../package.json');
process.argv = argv;

cli.parse({
  tree:   ['t', 'Output the abstract syntax tree']
, source: ['s', 'Output the raw VM source']
});

cli.main(function (args, options) {
  var file = args[0]
    , base   = path.join(file);
  AJS.read(file, options);
});
