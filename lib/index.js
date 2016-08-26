"use strict";

const fs = require("fs")
    , path = require("path")
    , Template = require("./template")
    , Cache = require("./cache")
    , idy = require("idy")
    ;

// If you need lower-level access to an ajs template, simply require it, call it
// with a locals object `template(<locals>)`, and bind to its `data`,
// `error` and `end` events.
require.extensions[".ajs"] = (module, filename) => {
  module.exports = ajs._loadSync(filename);
  return module;
};

/**
 * ajs
 * The main `ajs` export is a Connect middleware function. By adding
 * `ajs()` to your stack, any middleware down the line will have a
 * `res.render("/path", <locals>)` function that accepts a template
 * path and context object.
 *
 * @name ajs
 * @function
 * @param {Object} opts An object containing the following fields:
 *
 *  - `dir` (String): The path to the views directory (default: `./views`).
 *
 * @returns {Function} The middleware function.
 */
function ajs (opts) {
    opts = opts || {};

    const templateDir = opts.dir || "./views";

    return (req, res, next) => {
        res.render = (filename, locals, opts) => {
            let filename = normalizeFilename(path.join(templateDir, filename));

            ajs._load(filename, opts, (err, template) => {
                if (err) {
                    if (err.code == "ENOENT" || err.code == "EBADF") {
                        res.statusCode = 500;
                        res.end("Template not found: " + filename);
                    } else {
                        next(err);
                    }
                    return;
                }

                // We make sure to set the content-type and transfer-encoding headers
                // to take full advantage of HTTP's streaming ability.
                res.statusCode = 200;
                res.setHeader("Content-Type", "text/html; charset=UTF-8");
                res.setHeader("Transfer-Encoding", "chunked");

                // As data becomes available from the template, we pass it on to the client immediately.
                template(locals)
                    .on("data", data => {
                        res.write(data);
                    }).on("error", e => {
                        console.error(e.stack);
                        res.statusCode = 500;
                        res.end("Internal server error");
                    }).on("end", () => {
                        res.end();
                    });

                next();
            });
        };
    }
}

/**
 * serve
 * If you're looking for a simpler way to build a quick templated site,
 * you can use the `ajs.serve("dir", <locals>)` middleware and ajs will map request URLs
 * directly to file and directory paths. Simply create a context containing
 * a data source and any utilities, and your entire app can live in your templates!
 * If this reminds of you PHP, just remember you're asyncronous now.
 *
 * @name serve
 * @function
 * @param {String} rootDir The views directory.
 * @param {Object} locals The data to pass.
 * @param {Object} opts  The render options.
 * @returns {Function} The middleware function.
 */
ajs.serve = (rootDir, locals, opts) => {
    return (req, res, next) => {
        let path = normalizeFilename(req.url)
          , filename = rootDir + path
          ;

        ajs._load(filename, opts, (err, template) => {
            if (err) {
                return next(err);
            }

            locals.request = req;

            template(locals)
                .on("data", data => {
                    res.write(data);
                }).on("error", e => {
                    console.error(e.stack);
                    res.statusCode = 500;
                    res.end("Internal server error");
                }).on("end", () => {
                    res.end();
                });
        });
    }
};


/**
 * compile
 * While we can't support ExpressJS yet due to its syncronous handling of
 * [template engines](https://github.com/visionmedia/express/blob/master/lib/view.js#L421)
 * and [responses](https://github.com/visionmedia/express/blob/master/lib/response.js#L115),
 * we can still support a similar API.
 *
 * @name compile
 * @function
 * @param {String} str The content to compile.
 * @param {Object} opts An object containing the following fields:
 *
 *  - `filename` (String): The filename of the compiled file. By default a random filename.
 *  -
 * @returns {Template} An ajs `Template` object.
 */
ajs.compile = (str, opts) => {
    opts = opts || {};
    opts.filename = opts.filename || idy();

    let key = JSON.stringify(opts.filename + opts.bare)
      , template
      ;

    if (!(template = Cache._store[key]))
        template = Cache._store[key] = new Template(str, opts);

    return template;
};

/**
 * render
 * Render the template content.
 *
 * @name render
 * @function
 * @param {String} str The template content.
 * @param {Object} opts The compile options.
 * @param {Function} callback The callback function.
 * @returns {EventEmitter} The event emitter you can use to listen to `'data'`,
 * `'end'`, and `'error'` events.
 */
ajs.render = (str, opts, callback) => {
    let buffer = []
      , template = ajs.compile(str, opts)
      , ev = template(opts.locals)
      ;

    if (callback) {
        ev.on("data", data => {
            buffer.push(data);
        }).on("error", err => {
            callback(err);
        }).on("end", () => {
            callback(null, buffer.join(""));
        });
    }


    return ev;
};

/**
 * renderFile
 * Renders a file.
 *
 * @name renderFile
 * @function
 * @param {String} path The path to the template file.
 * @param {Object} opts The compile options.
 * @param {Function} callback The callback function.
 */
ajs.renderFile = (path, opts, callback) => {
    ajs.compileFile(path, opts, (err, template) => {
        if (err) { return callback(err); }
        template(opts.locals, callback);
    });
};

/**
 * compileFile
 * Return a template function compiled from the requested file.
 * If a cached object is found and the file hasn't been updated, return that.
 * Otherwise, attempt to read and compile the file asyncronously, calling back
 * with a compiled template function if successful or an error if not.
 *
 * @name compileFile
 * @function
 * @param {String} filename The path to the file.
 * @param {Object} opts The compile options.
 * @param {Function} callback The callback function.
 */
ajs.compileFile = ajs._load = (filename, opts, callback) => {

    if (typeof opts === "function") {
        callback = opts;
        opts = {};
    }

    opts = opts || {};

    let template
      , cache = (typeof opts.cache != "undefined") ? opts.cache : true
      ;

    Cache.get(filename, (err, cached) => {
        if(err) return callback(err);

        if(cache && cached) {
            callback(null, cached);
        } else {
            fs.readFile(filename, "utf-8", (err, source) => {
                if(err) return callback(err);
                try {
                    opts.filename = filename;
                    template = new Template(source, opts);
                } catch(e) {
                    e.message = "In " + filename + ", " + e.message;
                    return callback(e);
                }
                Cache.set(filename, template);
                callback(null, template);
            });
        }
    });
};

/**
 * compileFileSync
 * Synchronous version of `ajs.compileFile`, used for `require()` support.
 *
 * @name compileFileSync
 * @function
 * @param {String} filename The path to the file.
 * @param {Object} opts The compile options.
 * @returns {Template} The ajs template object.
 */
ajs.compileFileSync = ajs._loadSync = (filename, opts) => {
    opts = opts || {};

    let template
      , cache = (typeof opts.cache != "undefined") ? opts.cache : true
      ;

    try {
        if (cache && (cached = Cache.getSync(filename))) {
            return cached;
        } else {
            opts.filename = filename;
            template = new Template(fs.readFileSync(filename, "utf8"), opts);
            Cache.set(filename, template);
            return template;
        }
    } catch(e) {
        e.message = "In " + filename + ", " + e.message;
        throw e;
    }
};

function normalizeFilename(path) {
  if(path.slice(-1) == "/")
    path += "index";
  if(path.slice(-4) != ".ajs")
    path += ".ajs";
  return path;
}
