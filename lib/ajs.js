var fs      = require('fs')
  , path    = require('path')
  , util    = require('util')
  , AjsVM  = require('./ajs_vm');

require.extensions['.ajs'] = function(module, filename) {
  var options = { filename: filename };
  var compiled = AjsVM.compile(fs.readFileSync(filename, 'utf8'), options);
  if(module.parent && module.parent.moduleRun) {
    module.parent.moduleRun(compiled, options);
  } else {
    throw new Error('AJS require can only be called from within an AJS file');
  }
};

exports.Middleware = function(options) {
  options = options || {};
  var publicDir = options.publicDir || './public'
    , compiled = null
    , cache = {};
      
  return function(req, res, next) {
    var url = '';
    if(req.url.slice(-1) == '/') {
      url = req.url + 'index.ajs';
    } else if(req.url.slice(-4) != '.ajs') {
      url = req.url + '.ajs';
    } else url = req.url;
    
    var file = publicDir + url;
    serve(req, res, file);
  }
  
  function serve(req, res, file, options) {
    options = options || {};
    options.filename = options.filename || file;
    var vm = options.vm || AjsVM;
    
    try {
      if(!(compiled = cache[file])) {
        var source = fs.readFileSync(file, 'utf8');
        compiled = cache[file] = AjsVM.compile(source.toString(), options);
      };
      
      if(cache[file] == 404) return notFound(file);
      
      vm.run(compiled, options).on('data', function(data) {
        res.write(data);
      }).on('error', function(e) {
        console.error(e.message + " at line " + e.line);
        res.statusCode = 500;
        res.end('Server error');
      }).on('end', function() {
        res.end();
      });
    } catch (err) {
      if(err) {
        if(err.code == 'ENOENT' || err.code == 'EBADF') {
          notFound(file);
        } else throw err;
      }
    }
    
    function notFound(file) {
      cache[file] = 404;
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
  }
}

exports.read = function(file, options) {
  try {
    fs.readFile(file, function(err, source) {
      if(err) throw err;
      options.filename = file;
      var compiled = compile(source.toString(), options);
      if(options.source || options.tree) {
        util.print(compiled);
        console.log();
      } else return run(compiled, options);
    });
  } catch (err) {
    console.error(err.stack);
    return process.exit(1);
  }
}

exports.compile = compile = function(source, options) {
  try {
    return AjsVM.compile(source, options);
  } catch(err) {
    if (options.filename) {
      err.message = "In " + options.filename + ", " + err.message;
    }
    throw err;
  }
}

exports.run = run = function(compiled, options) {
  options = options || {};
  
  var vm = options.vm || AjsVM;
  
  try {
    vm.run(compiled, options).on('data', function(data) {
      util.print(data);
    }).on('end', function() {
      console.log();
    });
  } catch (err) {
    if (options.filename) {
      err.message = "In " + options.filename + ", " + err.message;
    }
    throw err;
  }
};

