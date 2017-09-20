var _, apiErrors;

_ = require("underscore")._;

apiErrors = require("../errors");

module.exports = function(schema) {
  return function(req, res, next) {
    if (_.isFunction(schema)) {
      schema = schema(req);
    }
    return schema.validate(req.body, function(err, json) {
      if (err) {
        console.log("[INFO] Invalid schema", err);
      }
      if (err) {
        return next(new apiErrors.InvalidBody(err));
      } else {
        return next();
      }
    });
  };
};
