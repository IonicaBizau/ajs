//     AJS 0.0.1
//     (c) 2011 Evan Owen, LifeKraze LLC.
//     AJS may be freely distributed under the MIT license.
//     For details and documentation:
//     http://github.com/kainosnoema/ajs

// [&laquo; Back to Index](index.html)

var fs       = require('fs')
  , Compiler = require('./compiler');

// AJS Loader
// -------------

// The AJS Loader handles locating, reading, compiling and caching
// AJS source files. The Loader is used by AJS middleware and the
// AJS VM directly (for includes).
var Loader = module.exports = {};


// Return a template function compiled from the requested file.
// If a cached object is found and the file hasn't been updated, return that.
// Otherwise, attempt to read and compile the file asyncronously, calling back
// with a compiled template function if successful or an error if not. 
Loader.load = function load(filename, opts, callback) {
  opts = opts || {};
  
  var compiled
    , cache = (typeof opts.cache != 'undefined') ? opts.cache : true;
  
  Cache.get(filename, function(err, cached) {
    if(err) return callback(err);
    
    if(cache && cached) {
      callback(null, cached);
    } else {
      fs.readFile(filename, 'utf-8', function(err, source) {
        if(err) return callback(err);
        opts.filename = filename;
        try {
          compiled = new Compiler(source, opts).compile();
        } catch(e) {
          e.message = "In " + filename + ", " + e.message;
          return callback(e);
        }
        Cache.set(filename, compiled);
        callback(null, compiled);
      });
    }
  });
}

// The same as Loader.load, but syncronous. If an error occurs it will be thrown.
Loader.loadSync = function loadSync(filename, opts) {
  opts = opts || {};
  
  var compiled
    , cache = (typeof opts.cache != 'undefined') ? opts.cache : true;
  
  try {
    if (cache && (cached = Cache.getSync(filename))) {
      return cached;
    } else {
      compiled = new Compiler(fs.readFileSync(filename, 'utf8'), {filename: filename}).compile();
      Cache.set(filename, compiled);
      return compiled;
    }
  } catch(e) {
    e.message = "In " + filename + ", " + e.message;
    throw e;
  }
}

// A very simple singleton memory cache to store compiled template functions for
// extremely fast retrieval. We use a file's mtime (modified time) to determine
// when the cache is stale and needs to be refreshed.
var Cache = new (function() {
  this._store = {};
  
  this.get = function(filename, callback) {
    var cached = this._store[filename];
    if(!cached) return callback(null, null);
    
    fs.stat(filename, function(err, stat) {
      if(err) return callback(err);
      if(cached.mtime.toString() != stat.mtime.toString())
        callback(null, null);
      else callback(null, cached.content);
    });
  }

  this.getSync = function(filename) {
    var cached = this._store[filename];
    if(!cached) return null;

    var stat = fs.statSync(filename);
    if(cached.mtime.toString() != stat.mtime.toString())
      return null;
    else return cached.content;
  }

  this.set = function(filename, content) {
    var self = this;
    fs.stat(filename, function(err, stat) {
      if(stat) self._store[filename] = {content: content, mtime: stat.mtime};
    });
  }
})();