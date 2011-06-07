
# AJS

 AJS is an experimental asyncronous templating language for [Node](http://nodejs.org).
 It's currently a work in progress, with Connect middleware coming soon.

## Example

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
  
    <!-- native array callback functions are exempt from the
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

## Usage

For now, there's a binary that simply prints the result to stdout:

```` bash
$ ajs index.ajs
````

Use the -t and -s options to view the abstracted syntax tree and compiled source:

```` bash
$ ajs -t index.ajs
  ...
$ ajs -s index.ajs
  ...
````

    
    
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