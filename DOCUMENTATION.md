## Documentation

You can see below the API reference of this module.

### `ajs(opts)`
The main `ajs` export is a Connect middleware function. By adding
`ajs()` to your stack, any middleware down the line will have a
`res.render("/path", <locals>)` function that accepts a template
path and context object.

#### Params
- **Object** `opts`: An object containing the following fields:
 - `dir` (String): The path to the views directory (default: `./views`).

#### Return
- **Function** The middleware function.

### `serve(rootDir, locals, opts)`
If you're looking for a simpler way to build a quick templated site,
you can use the `ajs.serve("dir", <locals>)` middleware and ajs will map request URLs
directly to file and directory paths. Simply create a context containing
a data source and any utilities, and your entire app can live in your templates!
If this reminds of you PHP, just remember you're asyncronous now.

#### Params
- **String** `rootDir`: The views directory.
- **Object** `locals`: The data to pass.
- **Object** `opts`: The render options.

#### Return
- **Function** The middleware function.

### `compile(str, opts)`
While we can't support ExpressJS yet due to its syncronous handling of
[template engines](https://github.com/visionmedia/express/blob/master/lib/view.js#L421)
and [responses](https://github.com/visionmedia/express/blob/master/lib/response.js#L115),
we can still support a similar API.

#### Params
- **String** `str`: The content to compile.
- **Object** `opts`: An object containing the following fields:
 - `filename` (String): The filename of the compiled file. By default a random filename.
 -

#### Return
- **Template** An ajs `Template` object.

### `render(str, opts, callback)`
Render the template content.

#### Params
- **String** `str`: The template content.
- **Object** `opts`: The compile options.
- **Function** `callback`: The callback function.

#### Return
- **EventEmitter** The event emitter you can use to listen to `'data'`, `'end'`, and `'error'` events.

### `renderFile(path, opts, callback)`
Renders a file.

#### Params
- **String** `path`: The path to the template file.
- **Object** `opts`: The compile options.
- **Function** `callback`: The callback function.

### `compileFile(filename, opts, callback)`
Return a template function compiled from the requested file.
If a cached object is found and the file hasn't been updated, return that.
Otherwise, attempt to read and compile the file asyncronously, calling back
with a compiled template function if successful or an error if not.

#### Params
- **String** `filename`: The path to the file.
- **Object** `opts`: The compile options.
- **Function** `callback`: The callback function.

### `compileFileSync(filename, opts)`
Synchronous version of `ajs.compileFile`, used for `require()` support.

#### Params
- **String** `filename`: The path to the file.
- **Object** `opts`: The compile options.

#### Return
- **Template** The ajs template object.

