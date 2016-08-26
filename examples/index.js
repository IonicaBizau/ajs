"use strict";

const ajs = require("..");

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
