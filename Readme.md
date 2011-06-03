
# AJS

 AJS is an experimental asyncronous templating language for [Node](http://nodejs.org).
 It's currently a work in progress, with Connect middleware coming soon.

## Example

index.ajs:

```` erb
<html>
<head>
</head>
<body>
  <% if(false) { %>
  <h1>Hidden.</h1>
  <% } %>

  <% if(true) { %>
  <h1>Hello world.</h1>
  <% } %>

  <% include('includes/two') %>

  <ul>
    <% _.each(['one', 'two', 'three'], function(item) { %>
      <% _.each(['one2', 'two2', 'three2'], function(item2) { %>
      <li><%= item %></li>
      <li><%= item2 %></li>
      <% }); %>
    <% }); %>
  </ul>
  underscore.js loops are exempt from nested callback restriction.
  
  <p>
    <% setTimeout(function() { %>
    <%= 'async 1 done' %>
    <% }, 2000 ) %>
  </p>
  
  <p>
    <% setTimeout(async2, 200) %>
  </p>

  <% setTimeout(async2, 200) %>
  
  <p><%= 'AJS is a strict superset of javascript - ' + (6 + 6) %></p>
</body>
</html>
````

Usage:

```` bash
$ ajs index.ajs
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