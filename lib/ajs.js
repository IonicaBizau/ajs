//     AJS 0.0.1
//     (c) 2011 Evan Owen, LifeKraze LLC.
//     AJS may be freely distributed under the MIT license.
//     For details and documentation:
//     http://github.com/kainosnoema/ajs

// [&laquo; Back to Index](index.html)

var fs       = require('fs')
  , path     = require('path')
  , Compiler = require('./compiler');

// If you need lower-level access to an AJS template, simply require it, call it
// with a locals object `template(<locals>)`, and bind to its `data`,
// `error` and `end` events.
require.extensions['.ajs'] = function(module, filename) {
  module.exports = Loader.loadSync(filename);
  return module;
};

// AJS
// -------------

// The main AJS export is a Connect middleware function. By adding `ajs()` to your stack,
// any middleware down the line will have a `res.render('/path', <locals>)`
// function that accepts a template path and context object.
var AJS = module.exports = function AJS(opts) {
  opts = opts || {};

  var templateDir  = opts.dir || './views';
  
  return function(req, res, next) {
    res.render = function(filename, locals, opts) {
      var filename = normalizeFilename(path.join(templateDir, filename));
      
      AJS._load(filename, opts, function(err, template) {
        if(err) {
          if(err.code == 'ENOENT' || err.code == 'EBADF') {
            res.statusCode = 500;
            res.end('Template not found: ' + filename);
            return;
          } else throw err;
        }

        // We make sure to set the content-type and transfer-encoding headers
        // to take full advantage of HTTP's streaming ability.
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=UTF-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        // As data becomes available from the template, we pass it on to the client immediately.
        template(locals)
          .on('data', function(data) {
            res.write(data);
          }).on('error', function(e) {
            console.error(e.stack);
            res.statusCode = 500;
            res.end('Internal server error');
          }).on('end', function() {
            res.end();
          });
      });
    }
    next();
  }
};

// AJS.serve
// -------------

// If you're looking for a simpler way to build a quick templated site,
// you can use the `ajs.serve('dir', <locals>)` middleware and AJS will map request URLs
// directly to file and directory paths. Simply create a context containing
// a data source and any utilities, and your entire app can live in your templates!
// If this reminds of you PHP, just remember you're asyncronous now.
AJS.serve = function serve(rootDir, locals, opts) {
  return function(req, res, next) {
    var path = normalizeFilename(req.url)
      , filename = rootDir + path;
    
    AJS._load(filename, opts, function(err, template) {
      if(err) {
        if(err.code == 'ENOENT' || err.code == 'EBADF') {
          next();
          return;
        } else {
          throw err;
        }
      }
      
      locals.request = req;
      
      template(locals)
        .on('data', function(data) {
          res.write(data);
        }).on('error', function(e) {
          console.error(e.stack);
          res.statusCode = 500;
          res.end('Internal server error');
        }).on('end', function() {
          res.end();
        });
    });
  }
}

// AJS.compile
// -------------

// While we can't support ExpressJS yet due to its syncronous handling of
// [template engines](https://github.com/visionmedia/express/blob/master/lib/view.js#L421)
// and [responses](https://github.com/visionmedia/express/blob/master/lib/response.js#L115),
// we can still support a similar API.
AJS.compile = function(str, opts) {
  opts = opts || {};
  var filename = opts.filename = opts.filename ? JSON.stringify(opts.filename) : 'undefined'
    , compiled;
  
  if(!(compiled = Cache._store[filename]))
    compiled = Cache._store[filename] = new Compiler(str, opts).compile();
  return compiled;
}

// AJS.render
// -------------

// Again, we can't exactly emulate the API of EJS (as its syncronous), but we can come
// close with the use of a callback. Note that this is not for use in practice as its
// still blocking until the rendering is complete, so nothing is being flushed to the client.
AJS.render = function(str, opts, callback) {
  var buffer = [];
  template = AJS.compile(str, opts);
  template(opts.locals)
    .on('data', function(data) {
      buffer.push(data);
    }).on('error', function(err) {
      throw err;
    }).on('end', function() {
      callback(buffer.join(''));
    });
}

// Return a template function compiled from the requested file.
// If a cached object is found and the file hasn't been updated, return that.
// Otherwise, attempt to read and compile the file asyncronously, calling back
// with a compiled template function if successful or an error if not. 
AJS._load = function load(filename, opts, callback) {
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
AJS._loadSync = function loadSync(filename, opts) {
  opts = opts || {};
  
  var compiled
    , cache = (typeof opts.cache != 'undefined') ? opts.cache : true;
  
  try {
    if (cache && (cached = Cache.getSync(filename))) {
      return cached;
    } else {
      opts.filename = filename;
      compiled = new Compiler(fs.readFileSync(filename, 'utf8'), opts).compile();
      Cache.set(filename, compiled);
      return compiled;
    }
  } catch(e) {
    e.message = "In " + filename + ", " + e.message;
    throw e;
  }
}

// When we include templates from a running VM, we specificy the `bare` option
// so the compiler doesn't wrap the template in a new VM.
AJS._loadInclude = function loadInclude(filename, opts) {
  return AJS._loadSync(filename, {bare: true});
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
      else callback(null, cached.template);
    });
  }

  this.getSync = function(filename) {
    var cached = this._store[filename];
    if(!cached) return null;

    var stat = fs.statSync(filename);
    if(cached.mtime.toString() != stat.mtime.toString())
      return null;
    else return cached.template;
  }

  this.set = function(filename, template) {
    var self = this;
    fs.stat(filename, function(err, stat) {
      if(stat) {
        self._store[filename] = {
          template: template
        , mtime: stat.mtime
        };
      };
    });
  }
})();

function normalizeFilename(path) {
  if(path.slice(-1) == '/')
    path += 'index';
  if(path.slice(-4) != '.ajs')
    path += '.ajs';
  return path;
}