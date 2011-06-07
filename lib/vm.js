//     AJS 0.0.1
//     (c) 2011 Evan Owen, LifeKraze LLC.
//     AJS may be freely distributed under the MIT license.
//     For details and documentation:
//     http://github.com/kainosnoema/ajs

// [&laquo; Back to Index](index.html)

var path          = require('path')
  , util          = require('util')
  , EventEmitter  = require('events').EventEmitter
  , Loader        = require('./loader');

// AJS Virtual Machine
// -------------

// In the VM we execute the compiled AJS code in a context that captures
// and buffers output until callbacks return and we're ready to flush
var VM = module.exports = function VM(compiled, opts) {
  EventEmitter.call(this);
  
  this.filename     = path.resolve(process.cwd(), opts.filename);
  this.dirname      = path.dirname(this.filename);
  
  this.line         = 0;
  this.error        = null;
  this.running      = false;
  
  this._compiled    = compiled;
  this._cbs         = [];
  this._inCb        = null;
  this._cbBuffer    = [];
  this._buffer      = [];
  this._depth       = 0;
}

util.inherits(VM, EventEmitter);

// We kick off the VM by calling the compiled template function,
// passing it our own context (for writes and callback handling),
// as well as the one passed in for the current request.
VM.prototype.render = function(context) {
  if(this.running) return false;
  this.running = true;

  this._context     = context || {};

  this._depth++;
  this._compiled.call(this, this._vmContext(), this._runContext());
}

// When you call `include` in a template, we use `Loader` to find
// the appropriate template (using a cached copy if available),
// pass it the context you provide, and execute it under this VM.
VM.prototype._include = function(request, context) {
  var filename = path.join(this.dirname, request + '.ajs')
  if(filename == this.filename) throw new Error('self include');
  
  try {
    var included = Loader.loadSync(filename, {filename: filename})
  } catch(e) {
    if(e.code == 'ENOENT' || e.code == 'EBADF')
      throw new Error("Can't find include: '" + request + "'");
    else throw e;
  }

  var includeContext = extend(this._runContext(), context || {});

  this._depth++;
  included.call(this, this._vmContext(), includeContext);
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
    this.running = false;
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
  this.error = e;
  this.error.filename = this.filename;
  this.error.line = this.line;
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
  , end:   this._end.bind(this)
  , err:   this._error.bind(this)
  , ln:    this._line.bind(this)
  , inc:   this._include.bind(this)
  , flush: this._flush.bind(this)
  , esc:   escape
  }
  
  return this._vmContext_;
}

// Here we extend the context passed into the template by you,
// adding a few helpful global properties along the way.
VM.prototype._runContext = function() {
  if(this._runContext_) return this._runContext_;
  
  var runCtx = this._runContext_ = extend({}, this._context);
  
  runCtx.__filename    = this.filename;
  runCtx.__dirname     = this.dirname;

  runCtx.setTimeout    = setTimeout;
  runCtx.clearTimeout  = clearTimeout;
  
  return runCtx;
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