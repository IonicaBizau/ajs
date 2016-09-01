"use strict";

const path = require('path');

const filenameCache = {}
    , dirnameCache = {}
    ;

module.exports = {
    /**
     * resolveFilename
     * Resolves and caches filename paths.
     *
     * @name resolveFilename
     * @function
     * @param {String} filename The filename to resolve.
     * @returns {String} The resolved filename.
     */
    resolveFilename: filename => {
        let cached = filenameCache[filename];

        if (cached) {
            return cached;
        }

        return filenameCache[filename] = path.resolve(process.cwd(), filename);
    }


    /**
     * resolveDirname
     * Resolves and caches folder paths.
     *
     * @name resolveDirname
     * @function
     * @param {} filename
     * @returns {String} The resolved dirname path.
     */
  , resolveDirname: filename => {
        let cached = dirnameCache[filename];

        if (cached) {
            return cached;
        }

        return dirnameCache[filename] = path.dirname(filename);
    }


    /**
     * escape
     * Escapes the HTML entities.
     *
     * @name escape
     * @function
     * @param {String} expr The input HTML code.
     * @returns {String} The escaped result.
     */
  , escape: expr => {
        return String(expr)
            .replace(/&(?!\w+;)/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * extend
     * Merges two objects.
     *
     * @name extend
     * @function
     * @param {Object} target The first object.
     * @param {Object} source The second object.
     * @returns {Object} The merged objects.
     */
  , extend: (target, source) => {
        let props = Object.getOwnPropertyNames(source);
        props.forEach(name => {
            target[name] = source[name];
        });
        return target;
    }
};
