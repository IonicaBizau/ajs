#!/usr/bin/env node

"use strict";

const fs = require("fs")
    , path = require("path")
    , util = require("util")
    , ajs = require("..")
    , Tilda = require("tilda")
    ;

new Tilda(`${__dirname}/../package.json`, {
    options: [
        {
            opts: ["tree", "t"]
          , desc: "Output the abstract syntax tree"
        }
      , {
            opts: ["source", "s"]
          , desc: "Output the raw VM source"
        }
      , {
            name: "locals"
          , opts: ["locals", "l"]
          , desc: "The template data as JSON."
        }
    ]
  , examples: [
        "ajs template.ajs"
      , "ajs -t template.ajs"
      , "ajs -s template.ajs"
    ]
}).main(app => {

    let filename = app.argv[0];

    if (!filename) {
        return app.exit(new Error("Please provide a template path."));
    }

    debugger
    let locals = {};
    try {
        locals = JSON.parse(app.options.locals.value);
    } catch (e) {
        return app.exit(e);
    }

    ajs._load(filename, {}, function(err, template) {
        if(err) return console.error(err.stack);

        if(app.options.tree.value)
            return console.log(util.inspect(template.toString(), false, 100)  + "\n");
        else if(app.options.source.value)
            return console.log(template.toString()  + "\n");

        template(locals).on("data", function(data) {
            console.log(data);
        }).on("error", function(err) {
            console.error();
            console.error(err.stack);
        }).on("end", function() {
            console.log();
        });
    });
});
