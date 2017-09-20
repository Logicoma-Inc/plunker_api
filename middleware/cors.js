var _, nconf,
  indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

nconf = require("nconf");

_ = require("lodash");

module.exports.middleware = function(config) {
  var valid;
  if (config == null) {
    config = {};
  }
  valid = [nconf.get('url:www'), nconf.get('url:embed'), "http://plnkr.co"];
  return function(req, res, next) {
    var allowHeaders, ref, requestHeaders;
    res.header("Access-Control-Allow-Origin", (ref = req.headers.origin, indexOf.call(valid, ref) >= 0) ? req.headers.origin : "*");
    res.header("Access-Control-Allow-Methods", "OPTIONS,GET,PUT,POST,DELETE");
    if (requestHeaders = req.headers['access-control-request-headers']) {
      allowHeaders = _(requestHeaders.split(",")).invoke("trim").invoke("toLowerCase").sort().value().join(", ");
      res.header("Access-Control-Allow-Headers", allowHeaders);
    }
    res.header("Access-Control-Expose-Headers", "Link");
    res.header("Access-Control-Max-Age", "60");
    if ("OPTIONS" === req.method) {
      return res.send(200);
    } else {
      return next();
    }
  };
};
