
# AJS

AJS is an experimental asyncronous templating language for [Node](http://nodejs.org).

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
