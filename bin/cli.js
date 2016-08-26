#!/usr/bin/env node

const fs = require("fs")
    , path = require("path")
    , util = require("util")
    , ajs = require("..")
    ;

// node-cli clobbers process.argv. argh.
let argv = Array.prototype.slice.call(process.argv)
  , cli = require("cli").enable("version").setApp(__dirname + "/../package.json")
  ;

process.argv = argv;

cli.parse({
    tree: ["t", "Output the abstract syntax tree"]
  , source: ["s", "Output the raw VM source"]
});

cli.main(function (args, opts) {

    let filename = args[0]
      , base   = path.join(filename)
      ;

    ajs._load(filename, opts, function(err, template) {
        if(err) return console.error(err.stack);

        if(opts.tree)
            return util.print(util.inspect(template, false, 100)  + "\n");
        else if(opts.source)
            return util.print(template  + "\n");

        template()
            .on("data", function(data) {
                util.print(data);
            })
            .on("error", function(err) {
                console.error();
                console.error(err.stack);
            })
            .on("end", function() {
                console.log();
            });
    });
});
