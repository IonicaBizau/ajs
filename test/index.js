"use strict";

const tester = require("tester")
    , ajs = require("..")
    , fsTree = require("fs-file-tree")
    , iterateObject = require("iterate-object")
    , readFile = require("read-utf8")
    , readJson = require("r-json")
    ;

tester.describe("ajs", t => {
    let tree = fsTree.sync(`${__dirname}/specs`, { camelCase: true })
    iterateObject(tree, (files, name) => {
        if (name.startsWith("_")) { return; }
        t.should(`handle ${name} cases`, cb => {
            ajs.render(readFile(files.inputAjs.path), {
                filename: Math.random() + ".js"
              , locals: require(files.inputJs.path)
            }, (data) => {
                t.expect(data).toBe(readFile(files.outputHtml.path));
                cb();
            });
        });
    });
});
