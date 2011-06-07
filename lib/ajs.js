//     AJS 0.0.1
//     (c) 2011 Evan Owen, LifeKraze LLC.
//     AJS may be freely distributed under the MIT license.
//     For details and documentation:
//     http://github.com/kainosnoema/ajs

var path   = require('path')
  , Loader = require('./loader')
  , VM     = require('./vm');

// An experimental asyncronous templating language similar to EJS.

// If you need low-level access to an AJS template, simply require it,
// bind to its `data`, `error` and `end` events, and call `.render(<context>)`.
require.extensions['.ajs'] = function(module, filename) {
  module.exports = new VM(Loader.loadSync(filename), {filename: filename});
  return module;
};

// AJS
// -------------

// The main AJS export is a Connect middleware function. By adding `ajs()` to your stack,
// any middleware down the line will have a `res.render('/path', <context>)`
// function that accepts a template path and context object.
var AJS = module.exports = function AJS(opts) {
  opts = opts || {};

  var templateDir  = opts.dir || './views';
  
  require.paths.unshift(templateDir);
  
  return function(req, res, next) {
    res.render = function(filename, context) {
      var filename = normalizeFilename(path.join(templateDir, filename));
      
      Loader.load(filename, {}, function(err, compiled) {
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
        new VM(compiled, {filename: filename})
        .on('data', function(data) {
          res.write(data);
        }).on('error', function(e) {
          logError(e);
          res.statusCode = 500;
          res.end('Internal server error');
        }).on('end', function() {
          res.end();
        }).render(context);
      });
    }
    next();
  }
};

// AJS.serve
// -------------

// If you're looking for a simpler way to build a quick templated site,
// you can use the `ajs.serve('dir', <context>)` middleware and AJS will map request URLs
// directly to file and directory paths. Simply create a context containing
// a data source and any utilities, and your entire app can live in your templates!
// If this reminds of you PHP, just remember you're asyncronous now.
AJS.serve = function serve(rootDir, context, opts) {
  return function(req, res, next) {
    var path = normalizeFilename(req.url)
      , filename = rootDir + path;
    
    Loader.load(filename, opts, function(err, compiled) {
      if(!err && !compiled) throw new Error();
      
      if(err) {
        if(err.code == 'ENOENT' || err.code == 'EBADF') {
          next();
          return;
        } else {
          throw err;
        }
      }
      
      context.request = req;
      
      new VM(compiled, {filename: filename})
      .on('data', function(data) {
        res.write(data);
      }).on('error', function(e) {
        logError(e);
        res.statusCode = 500;
        res.end('Internal server error');
      }).on('end', function() {
        res.end();
      }).render(context);
    });
  }
}

function normalizeFilename(path) {
  if(path.slice(-1) == '/')
    path += 'index';
  if(path.slice(-4) != '.ajs')
    path += '.ajs';
  return path;
}

function logError(e) {
  var stack = e.stack.split('\n').slice(1);
  stack.unshift('    at (' + e.filename + ":" + e.line + ')');
  console.error(e.toString());
  console.error(stack.join('\n'));
}
