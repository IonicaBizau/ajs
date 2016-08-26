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
                locals: require(files.inputJs.path)
            }, (err, data) => {
                t.expect(err).toBe(null);
                t.expect(data).toBe(readFile(files.outputHtml.path));
                cb();
            });
        });
    });

    let templ = null;
    t.it("compile the file", cb => {
        ajs.compileFile(tree.simple.inputAjs.path, (err, template) => {
            templ = template;
            cb();
        });
    });

    t.it("reuse the compiled result", cb => {
        templ(require(tree.simple.inputJs.path), (err, data) => {
            t.expect(data).toBe(readFile(tree.simple.outputHtml.path));
            cb();
        });
    });

    t.it("reuse the compiled result again", cb => {
        templ(require(tree.simple.inputJs.path), (err, data) => {
            t.expect(data).toBe(readFile(tree.simple.outputHtml.path));
            cb();
        });
    });

    t.it("reuse the compiled result again", cb => {
        templ(require(tree.simple.inputJs.path), (err, data) => {
            t.expect(data).toBe(readFile(tree.simple.outputHtml.path));
            cb();
        });
    });

    t.it("handle streams", cb => {
        templ(require(tree.encode.inputJs.path)).on("data", chunk => {
            t.expect(chunk).toBeA("string");
        }).on("end", cb);
    });
});
