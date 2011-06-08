
# AJS

AJS is an experimental asyncronous templating language for [Node](http://nodejs.org).

NOTE: While AJS includes Connect middleware, it's currently **NOT** compatible with the [ExpressJS](http://expressjs.com) view system due to its synchronous handling of [template engines](https://github.com/visionmedia/express/blob/master/lib/view.js#L421) and [responses](https://github.com/visionmedia/express/blob/master/lib/response.js#L115).
 
## Installation

```` bash
$ npm install ajs
````

## Usage

AJS includes [Connect](http://github.com/senchalabs/connect) middleware:

```` javascript
var connect = require('connect')
  , mysql   = new (require('mysql').Client)
  , ajs     = require('ajs');

mysql.user = 'dbuser';
mysql.password = 'passwd';
mysql.connect();
mysql.useDatabase('blog');
  
var getPosts = function(viewCallback) {
  mysql.query("select * from posts", viewCallback);
}

var server = connect.createServer()
                    .use(ajs({dir: './views'}))
                    .use(function(req, res) {
                      res.render('index', {title: "Blog Home", getPosts: getPosts});
                    });
````

views/index.ajs:

```` erb
<html>
  <head>
    <title><%= title %></title>
  </head>
  <body>
    <h1><%= title %></h1>
    <div id="posts">
      <% getPosts(function(err, posts) {
        if(posts) {
          posts.forEach(function(post) { %>
            <div class="post">
              <h3><a href="#"><%= post.title %></a></h3>
              <%- post.body %>
            </div>
          <%});
        } else { %>
          An error occured while trying to load the posts.
        <% }
      }) %>
    </div>
  </body>
</html>
````

For lower-level access to an AJS template, simply require it, call it with a locals object `template(<locals>)`, and bind to its `data`, `error` and `end` events.

```` javascript
var template = require('views/index');
template({title: 'Hello World!'}).on('data', function(data) {
  console.log(data);
});
````

## Syntax

index.ajs:

```` erb
<html>
  <head>
    <title><%= 'Hello World' %></title>
  </head>
  <body>
  
    <!-- AJS is a superset of javascript, so things like 
         variable assignment just work as expected -->
  
    <% var async2 = function() { %>
    <div><%= 'async 2 done' %></div>
    <% } %>
  
    <% if(10 == (5 + 5)) { %>
    <h1>Hello world.</h1>
    <% } %>

    <% for(i=1; i<5; i++) { %>
      <%= "next: " + i  + "<br/>" %>
    <% } %>

    <!-- callbacks are flushed to the proper location in the template
         when they return, but they can't be nested -->
    
    <p>
      <% setTimeout(function() { %>
      <%= 'async 1 done' %>
      <% }, 10 ) %>
    </p>
  
    <!-- some native syncronous callbacks are exempt from the
         nested callback restriction. -->
    
    <ul>
      <% ['one', 'two', 'three'].forEach(function(item) { %>
        <% ['nested'].forEach(function(item2) { %>
        <li><%= item %></li>
        <% include('partials', {item: item2}) %>
        <% }); %>
      <% }); %>
    </ul>
  
    <!-- named callback functions work too.
         a callback's output is inserted into the template at the 
         spot where it was passed to its async function -->
  
    <p> <% setTimeout(async2, 100) %> </p>

    <!-- callbacks can be used multiple times -->
  
    <% setTimeout(async2, 100) %>
  
    <!-- other AJS partials can be embedded using the "include" function -->
  
    <% include('partials/message', {text: "Hello world!"}) %>
  
    <p><%= 'any statement can be printed - ' + (6 + 6) %></p>
  </body>
</html>
````

partials/message.ajs:

```` erb
<div><%= text %></div>
````

## Annotated Source

http://kainosnoema.github.com/ajs

## Authors

  * Evan Owen

## License 

(The MIT License)

Copyright (c) 2011 Evan Owen &lt;kainosnoema@gmail.com&gt;

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.