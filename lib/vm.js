//     AJS 0.0.1
//     (c) 2011 Evan Owen, LifeKraze LLC.
//     AJS may be freely distributed under the MIT license.
//     For details and documentation:
//     http://github.com/kainosnoema/ajs

// [&laquo; Back to Index](index.html)

var path          = require('path')
  , util          = require('util')
  , EventEmitter  = require('events').EventEmitter
  , AJS           = require('./ajs');

// AJS Virtual Machine
// -------------

// In the VM we execute the compiled AJS code in a context that captures
// and buffers output until callbacks return and we're ready to flush
var VM = module.exports = function VM(func, opts) {
  EventEmitter.call(this);
  
  this.filename     = resolveFilename(opts.filename);
  this.dirname      = resolveDirname(opts.filename);
  
  this.line         = 1;
  this.error        = null;
  
  this._function    = func;
  this._locals      = null;
  this._cbs         = [];
  this._inCb        = null;
  this._cbBuffer    = [];
  this._buffer      = [];
  this._depth       = 0;
}

util.inherits(VM, EventEmitter);

// We delay the actual execution of the template function by a tick
// to give us time to bind to the `data`, `error` and `end` events.
VM.prototype.render = function(locals) {
  this._locals     = locals || {};
  process.nextTick(this._execute.bind(this));
  return this;
}

// We kick off the VM by calling the compiled template function,
// passing it our own vm context (for writes and callback handling),
// as well as the locals passed in for the current request.
VM.prototype._execute = function() {
  this._depth++;
  this._function.call(this, this._vmContext(), this._runLocals());  
}

// When you call `include` in a template, we use `Loader` to find
// the appropriate template (using a cached copy if available),
// pass it the context you provide, and execute it under this VM.
VM.prototype._include = function(request, locals) {
  var filename = path.join(this.dirname, request + '.ajs')
  if(filename == this.filename) throw new Error('self include');
  
  try {
    var included = AJS._loadInclude(filename);
  } catch(e) {
    if(e.code == 'ENOENT' || e.code == 'EBADF')
      throw new Error("Can't find include: '" + request + "'");
    else throw e;
  }
  
  var includeLocals = extend(this._runLocals(), locals || {});

  this._depth++;
  included.call(this, this._vmContext(), includeLocals);
}

// This is where the magic&trade; happens. The compiler wraps any arguments
// that look like callbacks with this function, enabling us to keep track of when
// a callback returns and when its completed.
VM.prototype._wrapCb = function(func) {
  if(typeof func != 'function') return func;
  
  if(this._inCb != null) throw new Error('nested callback');
    
  var id = this._cbBuffer.length
    , cb = { data: [], done: false };
  this._cbBuffer[id] = cb;
  var self = this;
  return function() {
    self._cbBuffer[id].done = false;
    self._inCb = id;
    func.apply(undefined, arguments);
    self._cbBuffer[id].done = true;
    self._inCb = null;
    self._write();
  };
}

VM.prototype._write = function(data) {
  var include;

  // If we're currently writing inside a callback, we make sure to write
  // to its buffer so we don't lose our place. Otherwise we write directly
  // to the main buffer.
  if(typeof data != 'undefined') {
    data = data.toString();
    if(this._inCb != null)
      this._cbBuffer[this._inCb].data.push(data);
    else
      this._cbBuffer.push(data);
  }

  // Each time we write, check to see if any callbacks have been completed.
  // If so, we can dump its buffer into the main buffer and continue until
  // we hit the next incomplete callback.
  for (var i in this._cbBuffer) {
    if(typeof (cb = this._cbBuffer[i]).done != 'undefined') {
      if(cb.done) {
        if(cb.data.length) this._buffer.push(cb.data.join(''));
      } else {
        if(cb.data.length == 1) this._flush();
        return;
      }
    } else {
      this._buffer.push(this._cbBuffer[i]);
    }
    delete this._cbBuffer[i];
  }
  
  // We don't want to overload the socket with too many writes, so we only
  // flush on two occasions: (1) when we start waiting on a callback, and
  // (2) when the template has finished rendering.
  if(this.isComplete()) {
    this._flush();
  }
}

VM.prototype._flush = function() {
  // If there's anything in the buffer, emit a `data` event
  // with the contents of the buffer as a `String`.
  if(this._buffer.length) {
    this.emit('data', this._buffer.join(''));
    this._buffer = [];
  }
  // If we're done executing, emit an `end` event.
  if(this.isComplete()) {
    this.emit('end');
  }
}

// Our compiled AJS is instrumented with calls so we can keep track of
// corresponding line numbers in the original AJS source.
VM.prototype._line = function(i) {
  this.line = i;
}

// When an error occurs during template execution, we handle it here so
// we can add additional information and emit an `error` event.
VM.prototype._error = function(e) {
  this._flush();
  e.filename = this.filename;
  e.line = this.line;
  e.message = e.message + ' at (' + e.filename + ":" + e.line + ')';
  this.error = e;
  this.emit('error', this.error);
}

// All templates call `_end()` when they're finished. Since some templates
// are actually nested `include`s, we use `_depth` to let us know when we're actually done. 
VM.prototype._end = function() {
  this._depth--;
  this._write();
}

// We know we're done when the parent template is complete and all callbacks have returned.
VM.prototype.isComplete = function() {
  return this._depth == 0 && !compact(this._cbBuffer).length;
}

// Here we build the actual VM context that's passed to the compiled AJS code.
// The calls to these functions are added automatically by the compiler.
VM.prototype._vmContext = function() {
  if(this._vmContext_) return this._vmContext_;
  
  this._vmContext_ = {
    cb:    this._wrapCb.bind(this)
  , out:   this._write.bind(this)
  , ln:    this._line.bind(this)
  , end:   this._end.bind(this)
  , err:   this._error.bind(this)
  , inc:   this._include.bind(this)
  , flush: this._flush.bind(this)
  , esc:   escape
  }
  
  return this._vmContext_;
}

// Here we extend the context passed into the template by you,
// adding a few helpful global properties along the way.
VM.prototype._runLocals = function() {
  if(this._runLocals_) return this._runLocals_;
  
  this._runLocals_ = extend({}, this._locals);
  
  this._runLocals_.__filename    = this.filename;
  this._runLocals_.__dirname     = this.dirname;
  
  return this._runLocals_;
}

var filenameCache = {};
function resolveFilename(filename) {
  var cached;
  if(cached = filenameCache[filename])
    return cached;
  else return filenameCache[filename] = path.resolve(process.cwd(), filename);
}

var dirnameCache = {};
function resolveDirname(filename) {
  var cached;
  if(cached = dirnameCache[filename])
    return cached;
  else return dirnameCache[filename] = path.dirname(filename);
}

function escape(expr) {
  return String(expr)
      .replace(/&(?!\w+;)/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
}

function extend(target, source) {
  var props = Object.getOwnPropertyNames(source);
  props.forEach(function(name) { target[name] = source[name]; });
  return target;
}

function compact(array) {
  return array.filter(function(i){ return !!i })
}