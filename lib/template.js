"use strict";

const fs = require('fs')
    , path = require('path')
    , util = require('./util')
    , EventEmitter = require('events').EventEmitter
    , Compiler = require('./compiler')
    , Cache = require('./cache')
    ;


/**
 * Template
 * Creates a new `Template` instance by receiving the AJS source
 * and wrapping it in a function that gives it a new
 * VM to run in on each call.
 *
 * @name Template
 * @function
 * @param {String} source The template source.
 * @param {Object} opts The compile options.
 * @returns {Function} The template function.
 */
function Template (source, opts) {
    let fn = new Compiler(source, opts).compile();
    return (locals, cb) => {
        return new VM(fn, opts).render(locals, cb);
    };
}

/**
 * loadInclude
 * When we include templates from a running VM, we specificy the `bare` option
 * so the compiler doesn't wrap the template in a new VM.
 *
 * @name loadInclude
 * @function
 * @param {String} filename The filename to include.
 * @param {Objec} opts The compile options.
 * @returns {Template} The new template.
 */
Template.loadInclude = function (filename, opts) {
    opts = opts || {};
    opts.bare = true;

    let template = null
      , cached = null
      , cache = (typeof opts.cache != 'undefined')
        ? opts.cache
        : true
      ;

    try {
        if (cache && (cached = Cache.getSync(filename))) {
            return cached;
        } else {
            opts.filename = filename;
            template = new Compiler(fs.readFileSync(filename, 'utf8'), opts).compile();
            Cache.set(filename, template);
            return template;
        }
    } catch (e) {
        e.message = "In " + filename + ", " + e.message;
        throw e;
    }
};

class VM extends EventEmitter {

    /**
     * VM
     * This is the AJS Virtual Machine.
     * In the VM we execute the compiled AJS code in a context that captures
     * and buffers output until callbacks return and we're ready to flush.
     *
     * @name VM
     * @function
     * @param {Function} func The function returned by the compiler.
     * @param {Object} opts An object containing the following fields:
     *
     *  - `filename` (String): The path to the ajs template.
     *
     * @returns {VM} The `VM` instance.
     */
    constructor (func, opts) {
        super();
        this.filename     = util.resolveFilename(opts.filename);
        this.dirname      = util.resolveDirname(this.filename);

        this.line         = 1;
        this.error        = null;

        this._function    = func;
        this._locals      = null;
        this._vmContext_ = opts._vmContext_;
        if (this._vmContext_) {
            this._vmContext_.inc = this._include.bind(this);
        }

        this._depth       = 0;
        this._cbDepth     = 0;
        this._cbs         = [];
        this._inCb        = null;
        this._cbBuffer    = [];
        this._buffer      = [];
    }

    /**
     * render
     * We delay the actual execution of the template function by a tick
     * to give us time to bind to the `data`, `error` and `end` events.
     *
     * @name render
     * @function
     * @param {Object} locals The template data.
     * @param {Function} cb The callback function.
     */
    render (locals, cb) {

        if (cb) {
            let buffer = []
            this.on('data', function(data) {
                buffer.push(data);
            }).on('error', function(err) {
                cb(err);
            }).on('end', function() {
                cb(null, buffer.join(''));
            });
        }

        this._locals = locals || {};
        process.nextTick(() => this._execute());
        return this;
    }

    /**
     * _execute
     * We kick off the VM by calling the compiled template function,
     * passing it our own vm context (for writes and callback handling),
     * as well as the locals passed in for the current request.
     *
     * @name _execute
     * @function
     */
    _execute () {
        this._depth++;
        this._function.call(this, this._vmContext(), this._runLocals());
    }

    /**
     * _include
     * When you call `include` in a template, we use `Loader` to find
     * the appropriate template (using a cached copy if available),
     * pass it the context you provide, and execute it under this VM.
     *
     * @name _include
     * @function
     * @param {String} request The path to the included ajs file.
     * @param {Object} locals The template data.
     * @param {Object} pLocals The parent template data.
     */
    _include (request, locals, pLocals) {

        let filename = path.join(pLocals.__dirname, request + '.ajs')
        let template  = null;
        if(filename == this.filename) throw new Error('self include');

        try {
            template = Template.loadInclude(filename);
        } catch(e) {
            if(e.code == 'ENOENT' || e.code == 'EBADF')
                throw new Error("Can't find include: '" + request + "'");
            else throw e;
        }

        let includeLocals = util.extend(this._runLocals(), locals || {});

        this._depth++;
        debugger
        template.call(this, this._vmContext(), util.extend({
            __filename: template.filename
          , __dirname: template.dirname
        }, includeLocals, true));
    }

    /**
     * _render
     * Renders the template.
     *
     * @name _render
     * @function
     * @param {String} str The string to render.
     * @param {Object} locals The template data.
     * @param {Object} opts The compile options.
     */
    _render (str, locals, opts) {
        opts = opts || {};
        let template;
        if(opts.filename) {
            let key = JSON.stringify(opts.filename);
            if(!(template = Cache._store[key]))
                template = Cache._store[key] = new Template(str, opts);
        } else template = new Compiler(str, opts).compile();

        let renderLocals = util.extend(this._runLocals(), locals || {});

        this._depth++;
        template.call(this, this._vmContext(), renderLocals);
    }

    /**
     * _wrapCb
     * This is where the magic happens. The compiler wraps any arguments
     * that look like callbacks with this function, enabling us to keep
     * track of when a callback returns and when its completed.
     *
     * @name _wrapCb
     * @function
     * @param {Function} func The callback function.
     * @returns {Function} The wrapping function.
     */
    _wrapCb (func) {
        if(typeof func != 'function') return func;

        if(this._inCb != null) throw new Error('nested callback');

        let id = this._cbBuffer.length
            , cb = { data: [], done: false };
        this._cbBuffer[id] = cb;
        this._cbDepth++;
        this._flush();
        let self = this;
        return function() {
            self._cbStart(id);
            func.apply(this, arguments);
            self._cbEnd(id);
        };
    }

    /**
     * _cbStart
     * Mark the callback state as *started*.
     *
     * @name _cbStart
     * @function
     * @param {String} id The callback id.
     */
    _cbStart (id) {
      this._cbDepth--;
      this._cbBuffer[id].done = false;
      this._inCb = id;
    }

    /**
     * _cbEnd
     * Mark the callback state as *done*.
     *
     * @name _cbEnd
     * @function
     * @param {String} id The callback id.
     */
    _cbEnd (id) {
      this._cbBuffer[id].done = true;
      this._inCb = null;
      this._write();
    }

    /**
     * _write
     * Write data in the buffers.
     *
     * @name _write
     * @function
     * @param {String} data The data to write.
     */
    _write (data) {
        let include;

        if(data) {
            // We're not waiting on any callbacks, so write directly to the main buffer.
            if(this._cbDepth == 0) return this._buffer.push(data);

            // If we're currently writing _inside_ a callback, we make sure to write
            // to its own buffer. Otherwise we write to the cb buffer so we stay in order.
            if(this._inCb != null)
                this._cbBuffer[this._inCb].data.push(data);
            else
                this._cbBuffer.push(data);
        }

        // Each time we write, check to see if any callbacks have been completed.
        // If so, we can dump its buffer into the main buffer and continue until
        // we hit the next incomplete callback.
        for (let i in this._cbBuffer) {
            let cb = null;
            if(typeof (cb = this._cbBuffer[i]).done != 'undefined') {
                if(cb.done) {
                    if(cb.data.length) this._buffer.push(cb.data.join(''));
                } else return;
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

    /**
     * _flush
     * Ends the buffer writing and emits the *end* event.
     *
     * @name _flush
     * @function
     */
    _flush () {
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

    /**
     * _line
     * Our compiled AJS is instrumented with calls so we can keep track of
     * corresponding line numbers in the original AJS source.
     *
     * @name _line
     * @function
     * @param {String} i The line number.
     */
    _line (i) {
        this.line = i;
    }

    /**
     * _error
     * When an error occurs during template execution, we handle it here so
     * we can add additional information and emit an `error` event.
     *
     * @name _error
     * @function
     * @param {Error} e The error object.
     */
    _error (e) {
        this._flush();
        e.filename = this.filename;
        e.line = this.line;
        e.message = e.message + ' at (' + e.filename + ":" + e.line + ')';
        this.error = e;
        this.emit('error', this.error);
    }

    /**
     * _end
     * All templates call `_end()` when they're finished. Since some templates
     * are actually nested `include`s, we use `_depth` to let us know when
     * we're actually done.
     *
     * @name _end
     * @function
     */
    _end () {
        this._depth--;
        this._write();
    }

    /**
     * isComplete
     * We know we're done when the parent template is complete and all callbacks have returned.
     *
     * @name isComplete
     * @function
     * @returns {Boolean} `true` if the rendering is complete, `false` otherwise.
     */
    isComplete () {
        return this._depth == 0 && this._cbDepth == 0;
    }

    /**
     * _vmContext
     * Here we build the actual VM context that's passed to the compiled AJS code.
     * The calls to these functions are added automatically by the compiler.
     *
     * @name _vmContext
     * @function
     * @returns {Object} The vm context.
     */
    _vmContext () {
        if(this._vmContext_) return this._vmContext_;

        this._vmContext_ = {
            cb:    this._wrapCb.bind(this)
          , out:   this._write.bind(this)
          , ln:    this._line.bind(this)
          , end:   this._end.bind(this)
          , err:   this._error.bind(this)
          , inc:   this._include.bind(this)
          , ren:   this._render.bind(this)
          , flush: this._flush.bind(this)
          , esc:   util.escape
        };

        return this._vmContext_;
    }

    /**
     * _runLocals
     * Here we extend the context passed into the template by you,
     * adding a few helpful global properties along the way.
     *
     * @name _runLocals
     * @function
     * @returns {Object} The locals object.
     */
    _runLocals () {
      if(this._runLocals_) return this._runLocals_;

      this._runLocals_ = util.extend({}, this._locals);

      this._runLocals_.__filename    = this.filename;
      this._runLocals_.__dirname     = this.dirname;

      return this._runLocals_;
    }
}

module.exports = Template;
