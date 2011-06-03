var local = { _:            require('underscore')
            , util:         require('util')
            , path:         require('path')
            , fs:           require('fs')
            , Compiler:     require('./compiler')
            , EventEmitter: require('events').EventEmitter
            , Module:       require('module')
            };

var AjsVM = module.exports = function(context) {
  local.EventEmitter.call(this);
  
  this.filename  = null;
  this.running   = false;
  this.line      = 0;
  this.error     = null;
  this.includes  = [];
  this.context   = context || null;

  this._cbs   = [];
  this._inCb  = null;

  this._buffer    = [];
  this._outBuffer = [];
  this._eof       = false;
  this._cache     = [];
}

local.util.inherits(AjsVM, local.EventEmitter);

AjsVM.prototype._cbWrap = function(func) {
  if(typeof func == 'function') {
    if(this._inCb != null) throw new Error('nested callback');
      
    var id = this._buffer.length
      , cb = { data: [], done: false };
    this._buffer[id] = cb;
    var self = this;
    return function() {
      self._buffer[id].done = false;
      self._inCb = id;
      func.apply(undefined, arguments);
      self._buffer[id].done = true;
      self._inCb = null;
      self._write();
    };
  } else {
    return func;
  }
}

AjsVM.prototype._write = function(data) {
  var include;
  
  if(typeof data != 'undefined') {
    data = data.toString();
    if(this._inCb) {
      this._buffer[this._inCb].data.push(data);
    } else
      this._buffer.push(data);
  }

  // fast forward and return any available data
  for (var i in this._buffer) {
    // if there's a cb here, wait for it's data
    if(typeof (cb = this._buffer[i]).done != 'undefined') {
      // console.log(i, cb);
      if(cb.data.length) {
        this._outBuffer.push(cb.data.join(''));
        cb.data = [];
      }
      if(cb.done == true) {
        delete this._buffer[i];
      } else break;
    } else {
      this._outBuffer.push(this._buffer[i]);
      delete this._buffer[i];
    }
  }
  
  this._flush();
}

AjsVM.prototype._error = function(e) {
  this._flush();
  this.error = e;
  this.error.line = this.line;
  this.emit('error', this.error);
}

AjsVM.prototype._line = function(i) {
  this.line = i;
}

AjsVM.prototype._end = function() {
  this._eof = true;
  this._write();
}

AjsVM.prototype._atEnd = function() {
  return this._eof == true && !local._.compact(this._buffer).length;
}

AjsVM.prototype._flush = function() {
  this.emit('data', this._outBuffer.join(''));
  this._outBuffer = [];
  
  if(this._atEnd() || this.error != null) {
    this.running = false;
    this.emit('end');
  }
}

AjsVM.prototype.run = function(source, options) {
  if(this.running) return false;
  
  if(options.filename) {
    this.filename = options.filename;
    var dir = local.path.dirname(local.path.normalize(options.filename));
    require.paths.unshift(dir);
  }
  
  if(!this.context) this.context = AjsVM.createContext();
  var globals = local._.extend(options.global || {}, AjsVM.createGlobals(this, options));
  local._.extend(this.context, globals);
  local._.extend(this.context.AJS, options.register);
  
  var self = this;
  process.nextTick(function() {
    self.running = true;
    self._contextEval(source);
  });
  
  return this;
}

AjsVM.prototype.includeRun = function(source, options) {
  var id = this._buffer.length
    , cb = { data: [], done: false };
  this._buffer[id] = cb;
  var self = this;
  AjsVM.run(source, options).on('data', function(data) {
    self._buffer[id].data.push(data);
    self._write();
  }).on('end', function() {
    self._buffer[id].done = true;
    self._write();
  });
}

AjsVM.prototype._contextEval = function(__COMPILED_SOURCE) {
  local._.extend(this.context, { local: undefined });
  with (this.context) { eval("try { " + __COMPILED_SOURCE + " } catch(e) { _ajs.err(e) }") };
}

AjsVM.compile = function(source, options) {
  var compiler = new local.Compiler(source, options);
  
  try {
    return compiler.compile();
  } catch (err) {
    if (options.filename) {
      err.message = "In " + options.filename + ", " + err.message;
    }
    throw err;
  }
}

AjsVM._registered = {};
AjsVM.register = function(name, value) { AjsVM._registered[name] = value; };

AjsVM.register('log', function(str) { local.util.log(str)  });

AjsVM.run = function(source, options) {
  return (new AjsVM()).run(source, options);
}

AjsVM._cache = {}
AjsVM.createGlobals = function(vm, options) {
  var include = function(path) {
    var resolved = local.Module._resolveFilename(path, vm)
      , id       = resolved[0]
      , filename = resolved[1];
    
    if(filename.slice(-4) != '.ajs') throw new Error('not a valid .ajs file');
    if(filename == vm.filename) throw new Error('self include');
    
    var compiled = vm._cache[filename];
    
    if (!compiled) {
      var source = local.fs.readFileSync(filename, 'utf8');
      compiled = AjsVM.compile(source, options);
      vm._cache[filename] = compiled;
    }
    
    try {
      vm.includeRun(compiled, {filename: filename})
    } catch (err) {
      delete vm._cache[filename];
      throw err;
    }
  }
  
  return {
    '_ajs':         { cb: vm._cbWrap.bind(vm)
                    , out: vm._write.bind(vm)
                    , end: vm._end.bind(vm)
                    , flush: vm._flush.bind(vm)
                    , err: vm._error.bind(vm)
                    , ln: vm._line.bind(vm) }
  , 'include':       include
  , 'require':       require
  , '__filename':    options.filename
  , 'setTimeout':    setTimeout
  , 'clearTimeout':  clearTimeout
  , 'setInterval':   setInterval
  , 'clearInterval': clearInterval
  }
} 

AjsVM.createContext = function() {
  var context = {'AJS': {}};
  local._.extend(context.AJS, AjsVM._registered);

  return context;
}