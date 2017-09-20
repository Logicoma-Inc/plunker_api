module.exports.middleware = function(config) {
  if (config == null) {
    config = {};
  }
  return function(req, res, next) {
    var v;
    req.apiVersion = ((v = req.param("api")) ? parseInt(v, 10) : 0);
    return next();
  };
};
