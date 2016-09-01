module.exports = {
    getPosts: function (cb) {
        setTimeout(function() {
            cb(["Apple", "Pear", "Orange"]);
        }, 10);
    }
};
