
[![ajs](http://i.imgur.com/nQiOz0E.png)](#)

# `$ ajs`

 [![PayPal](https://img.shields.io/badge/%24-paypal-f39c12.svg)][paypal-donations] [![AMA](https://img.shields.io/badge/ask%20me-anything-1abc9c.svg)](https://github.com/IonicaBizau/ama) [![Version](https://img.shields.io/npm/v/ajs.svg)](https://www.npmjs.com/package/ajs) [![Downloads](https://img.shields.io/npm/dt/ajs.svg)](https://www.npmjs.com/package/ajs) [![Get help on Codementor](https://cdn.codementor.io/badges/get_help_github.svg)](https://www.codementor.io/johnnyb?utm_source=github&utm_medium=button&utm_term=johnnyb&utm_campaign=github)

> Asynchronous templating in Node.js

## Features

 - Control flow with `<% %>`
 - Escaped output with `<%= %>` (escape function configurable)
 - Unescaped raw output with `<%- %>`
 - Newline-trim mode ('newline slurping') with `-%>` ending tag
 - Custom delimiters (e.g., use `<? ?>` instead of `<% %>`)
 - Includes
 - Static caching of intermediate JavaScript
 - Static caching of templates
 - Complies with the [Express](http://expressjs.com) view system


## :cloud: Installation

You can install the package globally and use it as command line tool:


```sh
$ npm i -g ajs
```


Then, run `ajs --help` and see what the CLI tool can do.


```
$ ajs --help
Usage: ajs [options]

Asynchronous templating in Node.js

Options:
  -t, --tree             Output the abstract syntax tree
  -s, --source           Output the raw VM source
  -l, --locals <locals>  The template data as JSON.
  -v, --version          Displays version information.
  -h, --help             Displays this help.

Examples:
  $ ajs template.ajs
  $ ajs -t template.ajs
  $ ajs -s template.ajs

Documentation can be found at https://github.com/IonicaBizau/ajs#readme.
```

## :clipboard: Example


Here is an example how to use this package as library. To install it locally, as library, you can do that using `npm`:

```sh
$ npm i --save ajs
```



```js
const ajs = require("ajs");

ajs.render(
`<% fruits.forEach(function (c) { -%>
<%= c %>s are great
<% }) %>`, {
    locals: {
        fruits: ["Apple", "Pear", "Orange"]
    }
}, (err, data) => {
    console.log(err || data);
    // =>
    // Apples are great
    // Pears are great
    // Oranges are great
});

// Do some async stuff
ajs.render(
`<% fetchData(function (err, msg) {
   if (err) { %>
     Error: <%= err.message %>
   <% } else {
    <%= msg %>
   <% } %>
<% }) %>`, {
    locals: {
        fetchData: cb => setTimeout(
            () => cb(null, "Hey there!")
          , 1000
        )
    }
}, (err, data) => {
    console.log(err || data);
    // =>
    // Hey there!
});
```

## :memo: Documentation

For full API reference, see the [DOCUMENTATION.md][docs] file.

## :yum: How to contribute
Have an idea? Found a bug? See [how to contribute][contributing].

## :cake: Thanks

Big thanks to [Evan Owen](https://github.com/kainosnoema) who created the initial versions of the project! Amazing stuff! :cake:


## :dizzy: Where is this library used?
If you are using this library in one of your projects, add it in this list. :sparkles:


 - [`ajs-xgettext`](https://npmjs.com/package/ajs-xgettext) (by Duane Griffin)—Extract localised text from AJS templates

## :scroll: License

[MIT][license] © [Ionică Bizău][website]

[paypal-donations]: https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=RVXDDLKKLQRJW
[donate-now]: http://i.imgur.com/6cMbHOC.png

[license]: http://showalicense.com/?fullname=Ionic%C4%83%20Biz%C4%83u%20%3Cbizauionica%40gmail.com%3E%20(http%3A%2F%2Fionicabizau.net)&year=2011#license-mit
[website]: http://ionicabizau.net
[contributing]: /CONTRIBUTING.md
[docs]: /DOCUMENTATION.md
