module.exports = function(schema, options) {
  if (options == null) {
    options = {};
  }
  schema.add({
    updated_at: Date
  });
  schema.pre("save", function(next) {
    this.updated_at = Date.now();
    return next();
  });
  if (options.index) {
    return schema.path("updated_at").index(options.index);
  }
};
