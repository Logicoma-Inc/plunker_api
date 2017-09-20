var _, analytics;

analytics = require("analytics-node");

_ = require("underscore")._;

module.exports = function(config) {
  if (config == null) {
    config = {};
  }
  (function(req, res, next) {
    req.track = function(event, properties) {
      if (properties == null) {
        properties = {};
      }
    };
    return next();
  });
  req.analytics = {};
  if (req.currentUser) {
    req.analytics.userId = req.currentUser._id;
  }
  return next();
};
