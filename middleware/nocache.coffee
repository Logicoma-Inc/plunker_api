module.exports.middleware = function(config) {
  if (config == null) {
    config = {};
  }
  return function(req, res, next) {
    res.set({
      "Cache-Control": "no-cache",
      "Expires": 0
    });
    return next();
  };
};
